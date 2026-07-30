import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { generateVerdict, mistrial } from '@/lib/ai/verdict';
import { checkLimit } from '@/lib/rate-limit';
import { voteSplit } from '@/lib/utils';
import { MAX_VERDICT_ATTEMPTS, type CaseCategory } from '@/lib/types';
import type { ParsedVerdict } from '@/lib/ai/verdict-schema';
import type { Json } from '@/lib/supabase/database.types';

/**
 * The gavel: closing a case and generating its verdict.
 *
 * Shared by the cron sweep (`/api/cron/gavel`) and the lazy fallback in
 * `getCase()`. Both can run concurrently for the same case, so every write here
 * is guarded and idempotent — the status update is conditional on the case still
 * being `in_session`, and whichever caller loses the race simply does nothing.
 */

export interface GavelResult {
  slug: string;
  outcome: 'closed' | 'retry_later' | 'mistrial' | 'skipped';
  source?: string;
}

/** Cases whose jury phase is over: deadline passed, or vote target reached. */
export async function findDueCases(limit = 10) {
  const admin = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from('cases')
    .select(
      'id, slug, title, body, category, red_weight, green_weight, verdict_attempts, closes_at, vote_target'
    )
    .eq('status', 'in_session')
    .order('closes_at', { ascending: true })
    .limit(limit * 3);

  if (error) {
    console.error('[gavel] failed to query due cases:', error.message);
    return [];
  }

  return (data ?? [])
    .filter((c) => {
      const deadlinePassed = c.closes_at <= nowIso;
      const targetHit = c.red_weight + c.green_weight >= c.vote_target;
      return deadlinePassed || targetHit;
    })
    .slice(0, limit);
}

interface DueCase {
  id: string;
  slug: string;
  title: string;
  body: string;
  category: string;
  red_weight: number;
  green_weight: number;
  verdict_attempts: number;
}

/**
 * Generates and persists a verdict for one case.
 *
 * Failure handling is the interesting part: a failed generation increments
 * `verdict_attempts` and leaves the case open for the next sweep. Only after
 * MAX_VERDICT_ATTEMPTS do we write a mistrial, because a case that never closes
 * is worse than an honest "we couldn't rule on this".
 */
export async function closeCase(due: DueCase): Promise<GavelResult> {
  const admin = createServiceClient();

  // Global throttle so a backlog cannot stampede the providers.
  const limit = await checkLimit('verdict:global', 'all');
  if (!limit.ok) {
    return { slug: due.slug, outcome: 'retry_later' };
  }

  const split = voteSplit(due.red_weight, due.green_weight);

  const outcome =
    due.verdict_attempts >= MAX_VERDICT_ATTEMPTS
      ? mistrial(split.red)
      : await generateVerdict({
          title: due.title,
          body: due.body,
          category: due.category as CaseCategory,
          redPct: split.red,
          greenPct: split.green,
          totalVotes: split.total,
        });

  if (!outcome) {
    const nextAttempt = due.verdict_attempts + 1;
    await admin
      .from('cases')
      .update({ verdict_attempts: nextAttempt })
      .eq('id', due.id)
      .eq('status', 'in_session');

    // Exhausted: declare a mistrial now rather than leaving it pending forever.
    if (nextAttempt >= MAX_VERDICT_ATTEMPTS) {
      const fallback = mistrial(split.red);
      await persistVerdict(due.id, fallback.verdict, nextAttempt);
      return { slug: due.slug, outcome: 'mistrial', source: 'mistrial' };
    }

    return { slug: due.slug, outcome: 'retry_later' };
  }

  const persisted = await persistVerdict(
    due.id,
    outcome.verdict,
    due.verdict_attempts
  );

  return {
    slug: due.slug,
    outcome: persisted ? 'closed' : 'skipped',
    source: outcome.source,
  };
}

/**
 * Writes the verdict and flips the case closed.
 *
 * The `.eq('status', 'in_session')` guard is what makes this safe to call twice:
 * the second caller updates zero rows instead of overwriting a verdict that is
 * already public (and possibly already screenshotted).
 */
async function persistVerdict(
  caseId: string,
  verdict: ParsedVerdict,
  attempts: number
): Promise<boolean> {
  const admin = createServiceClient();

  const { data, error } = await admin
    .from('cases')
    .update({
      status: 'closed',
      // ParsedVerdict is a flat object of primitives, so it satisfies Json at
      // runtime; TypeScript cannot narrow an interface to the Json union itself.
      verdict: verdict as unknown as Json,
      toxicity: verdict.toxicity,
      verdict_generated_at: new Date().toISOString(),
      verdict_attempts: attempts,
    })
    .eq('id', caseId)
    .eq('status', 'in_session')
    .select('id');

  if (error) {
    console.error('[gavel] failed to persist verdict:', error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Lazy safety net for a single overdue case, called on read.
 *
 * Vercel cron on the free tier can miss a window; without this a visitor could
 * land on a case that looks frozen past its deadline. Deliberately handles one
 * case only, so a page render never turns into a batch job.
 */
export async function closeCaseIfDue(slug: string): Promise<boolean> {
  const admin = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data } = await admin
    .from('cases')
    .select(
      'id, slug, title, body, category, red_weight, green_weight, verdict_attempts, closes_at, vote_target'
    )
    .eq('slug', slug)
    .eq('status', 'in_session')
    .maybeSingle();

  if (!data) return false;

  const deadlinePassed = data.closes_at <= nowIso;
  const targetHit = data.red_weight + data.green_weight >= data.vote_target;
  if (!deadlinePassed && !targetHit) return false;

  const result = await closeCase(data);
  return result.outcome === 'closed' || result.outcome === 'mistrial';
}
