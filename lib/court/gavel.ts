import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { generateVerdict, hungJury } from '@/lib/ai/verdict';
import { checkLimit } from '@/lib/rate-limit';
import { voteSplit } from '@/lib/utils';
import {
  MAX_VERDICT_ATTEMPTS,
  SESSION_HOURS,
  VOTE_TARGET,
  DEFAULT_PERSONA,
  type CaseCategory,
  type JudgePersona,
} from '@/lib/types';
import type { ParsedVerdict } from '@/lib/ai/verdict-schema';

/**
 * The gavel: closing a case and generating its verdict.
 *
 * Shared by the cron sweep (`/api/cron/gavel`) and the lazy fallback in
 * `getCase()`. Both can run concurrently for the same case, so every write here
 * is guarded and idempotent — the status update is conditional on the case still
 * being open, and whichever caller loses the race simply does nothing.
 *
 * Verdicts persist across the existing columns (`ai_verdict`, `ai_verdict_line`,
 * `ai_roast`, `ai_summary`, `toxicity_score`) rather than one JSONB blob.
 */

export interface GavelResult {
  publicId: string;
  outcome: 'closed' | 'retry_later' | 'hung_jury' | 'skipped';
  source?: string;
  /** Why a sweep deferred or gave up. Surfaced in the cron response for debugging. */
  reason?: 'throttled' | 'providers_unavailable' | 'invalid_verdict';
}

/** Columns the gavel needs. */
const DUE_COLUMNS =
  'id, public_id, title, body, category, judge_persona, red_weight, green_weight, verdict_attempts, created_at, status';

interface DueCase {
  id: string;
  public_id: string;
  title: string | null;
  body: string;
  category: string;
  judge_persona: string;
  red_weight: number;
  green_weight: number;
  verdict_attempts: number;
  created_at: string;
}

/** True when a case's jury phase is over: deadline passed, or target reached. */
function isDue(row: {
  created_at: string;
  red_weight: number;
  green_weight: number;
}): boolean {
  const deadline =
    new Date(row.created_at).getTime() + SESSION_HOURS * 60 * 60 * 1000;
  const deadlinePassed = Date.now() >= deadline;
  const targetHit = row.red_weight + row.green_weight >= VOTE_TARGET;
  return deadlinePassed || targetHit;
}

/**
 * Cases ready for judgment.
 *
 * There is no `closes_at` column, so the deadline is derived from `created_at`
 * plus SESSION_HOURS. That means the filter cannot be fully pushed into SQL
 * without a generated column, so we over-fetch and filter in memory — fine at
 * this batch size.
 */
export async function findDueCases(limit = 10): Promise<DueCase[]> {
  const admin = createServiceClient();

  const { data, error } = await admin
    .from('cases')
    .select(DUE_COLUMNS)
    .in('status', ['live', 'judging'])
    /*
     * Never re-judge a case that already has a ruling.
     *
     * Status alone is not a sufficient guard: a case can legitimately carry a
     * verdict while still `live` (e.g. seeded data, or a verdict written before a
     * status update failed). Without this filter the sweep re-ran those cases and
     * overwrote genuine headlines with the canned "THE JURY IS SPLIT" fallback
     * once the provider was rate-limited — silent, irreversible data loss.
     */
    .is('ai_verdict', null)
    .order('created_at', { ascending: true })
    .limit(limit * 4);

  if (error) {
    console.error('[gavel] failed to query due cases:', error.message);
    return [];
  }

  return ((data ?? []) as unknown as DueCase[]).filter(isDue).slice(0, limit);
}

/**
 * Generates and persists a verdict for one case.
 *
 * Failure handling is the interesting part, and it distinguishes two kinds:
 *
 *  - **Capacity** (429, timeout, unconfigured key): no model ever read the case,
 *    so the attempt counter is NOT spent. Otherwise a provider outage of three
 *    sweeps would permanently brand every queued case a hung jury.
 *  - **Rejected** (a reply arrived but failed validation): a genuine judging
 *    failure, so it spends an attempt. After MAX_VERDICT_ATTEMPTS we write a hung
 *    jury, because a case that never closes is worse than an honest
 *    "we couldn't rule on this".
 */
export async function closeCase(due: DueCase): Promise<GavelResult> {
  const admin = createServiceClient();

  // Global throttle so a backlog cannot stampede the providers.
  const limit = await checkLimit('verdict:global', 'all');
  if (!limit.ok) {
    return {
      publicId: due.public_id,
      outcome: 'retry_later',
      reason: 'throttled',
    };
  }

  // Mark as judging so concurrent sweeps skip it and the UI can say so.
  await admin
    .from('cases')
    .update({ status: 'judging', updated_at: new Date().toISOString() })
    .eq('id', due.id)
    .eq('status', 'live');

  const split = voteSplit(due.red_weight, due.green_weight);
  const persona = normalisePersona(due.judge_persona);

  const attempt =
    due.verdict_attempts >= MAX_VERDICT_ATTEMPTS
      ? { outcome: hungJury(split.red) }
      : await generateVerdict({
          title: due.title ?? 'Untitled case',
          body: due.body,
          category: due.category as CaseCategory,
          persona,
          redPct: split.red,
          greenPct: split.green,
          totalVotes: split.total,
        });

  if (!attempt.outcome) {
    const capacityOnly = attempt.failure === 'unavailable';

    /*
     * Spend an attempt only when the failure was ours to fix. Either way the case
     * returns to `live` so it is retried rather than stranded in `judging`.
     */
    const nextAttempt = capacityOnly
      ? due.verdict_attempts
      : due.verdict_attempts + 1;

    await admin
      .from('cases')
      .update({
        verdict_attempts: nextAttempt,
        status: 'live',
        updated_at: new Date().toISOString(),
      })
      .eq('id', due.id)
      .eq('status', 'judging');

    // Exhausted, and only ever reachable via real judging failures.
    if (!capacityOnly && nextAttempt >= MAX_VERDICT_ATTEMPTS) {
      const fallback = hungJury(split.red);
      await persistVerdict(due.id, fallback.verdict, nextAttempt, null);
      return { publicId: due.public_id, outcome: 'hung_jury', source: 'split' };
    }

    return {
      publicId: due.public_id,
      outcome: 'retry_later',
      reason: capacityOnly ? 'providers_unavailable' : 'invalid_verdict',
    };
  }

  const persisted = await persistVerdict(
    due.id,
    attempt.outcome.verdict,
    due.verdict_attempts,
    attempt.outcome.model
  );

  return {
    publicId: due.public_id,
    outcome: persisted ? 'closed' : 'skipped',
    source: attempt.outcome.source,
  };
}

/**
 * Writes the verdict and closes the case.
 *
 * The status guard is what makes this safe to call twice: the second caller
 * updates zero rows instead of overwriting a verdict that is already public (and
 * possibly already screenshotted).
 */
async function persistVerdict(
  caseId: string,
  verdict: ParsedVerdict,
  attempts: number,
  model: string | null
): Promise<boolean> {
  const admin = createServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from('cases')
    .update({
      status: 'closed',
      ai_verdict: verdict.verdict,
      ai_verdict_line: verdict.headline,
      ai_roast: verdict.roast,
      ai_summary: verdict.summary,
      toxicity_score: verdict.toxicity,
      is_split_verdict: verdict.verdict === 'split',
      split_verdict_badge: verdict.verdict === 'split',
      judge_model: model,
      verdict_attempts: attempts,
      closed_at: now,
      updated_at: now,
    })
    .in('status', ['live', 'judging'])
    // Second half of the no-overwrite guard: even if a concurrent worker wrote a
    // verdict between our SELECT and this UPDATE, we lose the race harmlessly
    // instead of clobbering a ruling that may already be public.
    .is('ai_verdict', null)
    .eq('id', caseId)
    .select('id');

  if (error) {
    console.error('[gavel] failed to persist verdict:', error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** `judge_persona` is free text in the DB; fall back rather than trust it. */
function normalisePersona(value: string | null): JudgePersona {
  if (value === 'judge_calm' || value === 'judge_petty' || value === 'judge_roast') {
    return value;
  }
  return DEFAULT_PERSONA;
}

/**
 * Lazy safety net for a single overdue case, called on read.
 *
 * An external scheduler can miss a window; without this a visitor could land on a
 * case that looks frozen past its deadline. Deliberately handles one case only,
 * so a page render never turns into a batch job.
 */
export async function closeCaseIfDue(publicId: string): Promise<boolean> {
  const admin = createServiceClient();

  const { data } = await admin
    .from('cases')
    .select(DUE_COLUMNS)
    .eq('public_id', publicId)
    .in('status', ['live', 'judging'])
    // Mirrors findDueCases: never re-judge a case that already has a ruling.
    .is('ai_verdict', null)
    .maybeSingle();

  if (!data) return false;

  const row = data as unknown as DueCase;
  if (!isDue(row)) return false;

  const result = await closeCase(row);
  return result.outcome === 'closed' || result.outcome === 'hung_jury';
}
