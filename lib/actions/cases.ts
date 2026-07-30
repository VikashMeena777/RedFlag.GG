'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { nanoid } from 'nanoid';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getViewer, FILE_BLOCKED_MESSAGES } from '@/lib/auth/viewer';
import { clientIp } from '@/lib/auth/fingerprint';
import { checkLimit, limitMessage } from '@/lib/rate-limit';
import { fileCaseSchema, fieldErrors, sanitizeText } from '@/lib/validation';
import { redact, rejectionMessage } from '@/lib/moderation/redact';
import { scanProfanity, SEVERE_MESSAGE } from '@/lib/moderation/profanity';
import { closeCaseIfDue } from '@/lib/court/gavel';
import { verdictSchema } from '@/lib/ai/verdict-schema';
import type { CaseView, Verdict, VoteChoice } from '@/lib/types';
import type { Database } from '@/lib/supabase/database.types';

type CaseRow = Database['public']['Tables']['cases']['Row'];

export interface FileCaseResult {
  ok: boolean;
  slug?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Files a new case.
 *
 * Pipeline order is deliberate and must not be reordered:
 *   auth/tier → rate limit → Zod → redact (reject hard PII) → profanity →
 *   sanitize → insert
 *
 * Redaction runs before anything is persisted or sent to an LLM, so raw contact
 * details never leave this function.
 */
export async function fileCase(formData: FormData): Promise<FileCaseResult> {
  const viewer = await getViewer();

  // Gate 1 of 3 on the verified-only rule. RLS `WITH CHECK` and a DB trigger are
  // the other two — this one exists to produce a useful message.
  if (!viewer.canFile) {
    return {
      ok: false,
      error: viewer.fileBlockedReason
        ? FILE_BLOCKED_MESSAGES[viewer.fileBlockedReason]
        : 'You cannot file a case right now.',
    };
  }

  const ip = clientIp(await headers());
  const limit = await checkLimit('case:create', `${viewer.userId}:${ip}`);
  if (!limit.ok) return { ok: false, error: limitMessage(limit) };

  const parsed = fileCaseSchema.safeParse({
    category: formData.get('category'),
    title: formData.get('title'),
    body: formData.get('body'),
    acceptedRules: formData.get('acceptedRules') === 'on',
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }

  const { category, title, body } = parsed.data;

  // Hard PII check across both fields. Rejecting beats silently redacting: the
  // author learns the rule instead of assuming it posted fine.
  const titleCheck = redact(title);
  const bodyCheck = redact(body);
  const rejections = [
    ...new Set([...titleCheck.rejections, ...bodyCheck.rejections]),
  ];
  if (rejections.length > 0) {
    return {
      ok: false,
      fieldErrors: {
        body: rejectionMessage(rejections),
      },
    };
  }

  const combined = `${title}\n${body}`;
  const profanity = scanProfanity(combined);
  if (profanity.hasSevere) {
    return { ok: false, fieldErrors: { body: SEVERE_MESSAGE } };
  }

  const cleanTitle = sanitizeText(titleCheck.text);
  const cleanBody = sanitizeText(bodyCheck.text);

  // Sanitizing can shorten text; re-check the floor so an empty case can't slip in.
  if (cleanTitle.length < 8 || cleanBody.length < 60) {
    return {
      ok: false,
      fieldErrors: { body: 'That did not survive cleanup. Rewrite it as plain text.' },
    };
  }

  const supabase = await createClient();
  const slug = nanoid(10);

  // Inserted with the user's own client, so RLS verifies the tier again.
  const { error } = await supabase.from('cases').insert({
    slug,
    author_id: viewer.userId!,
    category,
    title: cleanTitle,
    body: cleanBody,
  });

  if (error) {
    // The DB guards surface as specific codes; translate rather than leak SQL.
    if (error.message.includes('VERIFICATION_REQUIRED')) {
      return { ok: false, error: FILE_BLOCKED_MESSAGES.not_verified };
    }
    console.error('[cases] insert failed:', error.message);
    return { ok: false, error: 'Could not file the case. Try again.' };
  }

  // Profanity does not block, but it does queue the case for a human look.
  if (profanity.hasProfanity) {
    const admin = createServiceClient();
    await admin.from('cases').update({ needs_review: true }).eq('slug', slug);
  }

  revalidatePath('/');
  return { ok: true, slug };
}

/** Files a case and redirects to it. Used by the form's submit handler. */
export async function fileCaseAndRedirect(formData: FormData): Promise<void> {
  const result = await fileCase(formData);
  if (result.ok && result.slug) {
    redirect(`/case/${result.slug}`);
  }
  // On failure the form re-renders with errors via its own state; nothing to do.
}

// ── Reads ────────────────────────────────────────────────────────────────

/** Parses the stored verdict JSON, discarding anything that fails the contract. */
function readVerdict(raw: CaseRow['verdict']): Verdict | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = verdictSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function toCaseView(
  row: CaseRow,
  viewerId: string | null,
  myVote: VoteChoice | null
): CaseView {
  return {
    id: row.id,
    caseNo: row.case_no,
    slug: row.slug,
    category: row.category,
    title: row.title,
    body: row.body,
    status: row.status,
    closesAt: row.closes_at,
    createdAt: row.created_at,
    redVotes: row.red_votes,
    greenVotes: row.green_votes,
    redWeight: row.red_weight,
    greenWeight: row.green_weight,
    verdict: readVerdict(row.verdict),
    toxicity: row.toxicity,
    isAuthor: viewerId !== null && row.author_id === viewerId,
    myVote,
  };
}

const CASE_COLUMNS =
  'id, case_no, slug, author_id, category, title, body, status, closes_at, ' +
  'vote_target, red_votes, green_votes, red_weight, green_weight, verdict, ' +
  'toxicity, verdict_attempts, verdict_generated_at, is_hidden, needs_review, ' +
  'flag_count, created_at, heat';

/**
 * The docket feed: open cases first (they still need jurors), then recently
 * closed ones. RLS already filters hidden and removed cases.
 */
export async function getDocket(limit = 20): Promise<CaseView[]> {
  const supabase = await createClient();
  const viewer = await getViewer();

  const { data, error } = await supabase
    .from('cases')
    .select(CASE_COLUMNS)
    .neq('status', 'removed')
    .order('status', { ascending: true }) // 'closed' < 'in_session' alphabetically…
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[cases] docket query failed:', error.message);
    return [];
  }

  // Supabase cannot infer row types from a runtime column string, so it widens
  // to GenericStringError[]. The shape is guaranteed by CASE_COLUMNS.
  const rows = (data ?? []) as unknown as CaseRow[];

  // …so sort in_session to the top explicitly rather than relying on enum order.
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'in_session' ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });

  const votes = await getMyVotes(rows.map((r) => r.id), viewer.userId);
  return rows.map((row) => toCaseView(row, viewer.userId, votes.get(row.id) ?? null));
}

/** Today's Most Toxic: closed cases from the last 24h, ranked by heat. */
export async function getMostToxic(limit = 10): Promise<CaseView[]> {
  const supabase = await createClient();
  const viewer = await getViewer();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('cases')
    .select(CASE_COLUMNS)
    .eq('status', 'closed')
    .gte('created_at', since)
    .order('heat', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[cases] toxic query failed:', error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as CaseRow[];
  const votes = await getMyVotes(rows.map((r) => r.id), viewer.userId);
  return rows.map((row) => toCaseView(row, viewer.userId, votes.get(row.id) ?? null));
}

/**
 * A single case.
 *
 * Runs the lazy gavel first: if this case is past its deadline but the cron
 * hasn't swept it yet, close it now so the visitor never sees a frozen case.
 */
export async function getCase(slug: string): Promise<CaseView | null> {
  await closeCaseIfDue(slug);

  const supabase = await createClient();
  const viewer = await getViewer();

  const { data, error } = await supabase
    .from('cases')
    .select(CASE_COLUMNS)
    .eq('slug', slug)
    .neq('status', 'removed')
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as CaseRow;
  const votes = await getMyVotes([row.id], viewer.userId);
  return toCaseView(row, viewer.userId, votes.get(row.id) ?? null);
}

/** The viewer's own ballots, so the UI can show which side they picked. */
async function getMyVotes(
  caseIds: string[],
  userId: string | null
): Promise<Map<string, VoteChoice>> {
  const result = new Map<string, VoteChoice>();
  if (!userId || caseIds.length === 0) return result;

  const supabase = await createClient();
  const { data } = await supabase
    .from('votes')
    .select('case_id, choice')
    .eq('voter_id', userId)
    .in('case_id', caseIds);

  for (const vote of data ?? []) {
    result.set(vote.case_id, vote.choice);
  }
  return result;
}

/** Slugs of closed cases, for the sitemap and static params. */
export async function getClosedCaseSlugs(limit = 500): Promise<string[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from('cases')
    .select('slug')
    .eq('status', 'closed')
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => row.slug);
}
