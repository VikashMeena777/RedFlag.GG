'use server';

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAdmin } from '@/lib/auth/viewer';
import { MAX_STRIKES } from '@/lib/types';

/**
 * Admin moderation actions.
 *
 * Every mutation is gated by `requireAdmin()`, which checks the server-side
 * ADMIN_USER_IDS allowlist. Writes use the service client because `is_hidden`,
 * `status` and `strikes` are trigger-guarded against every other role.
 *
 * Audit ordering matters: the `moderation_actions` row is written BEFORE the
 * case mutation, because the FK is `on delete set null` and we want the record
 * to survive regardless of what happens to the case.
 */

export interface AdminResult {
  ok: boolean;
  error?: string;
}

export interface FlaggedCase {
  id: string;
  caseNo: number;
  slug: string;
  title: string;
  body: string;
  status: string;
  isHidden: boolean;
  needsReview: boolean;
  flagCount: number;
  createdAt: string;
  authorId: string;
  reasons: string[];
}

/** The review queue: anything flagged, hidden, or auto-marked for review. */
export async function getReviewQueue(limit = 50): Promise<FlaggedCase[]> {
  await requireAdmin();
  const admin = createServiceClient();

  const { data: cases, error } = await admin
    .from('cases')
    .select(
      'id, case_no, slug, title, body, status, is_hidden, needs_review, flag_count, created_at, author_id'
    )
    .or('needs_review.eq.true,is_hidden.eq.true,flag_count.gt.0')
    .neq('status', 'removed')
    .order('flag_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[admin] queue query failed:', error.message);
    return [];
  }

  const rows = cases ?? [];
  if (rows.length === 0) return [];

  // Flag reasons have no client SELECT policy at all, so they are only readable
  // here, through the service role.
  const { data: flags } = await admin
    .from('flags')
    .select('case_id, reason')
    .in(
      'case_id',
      rows.map((r) => r.id)
    );

  const reasonsByCase = new Map<string, string[]>();
  for (const flag of flags ?? []) {
    const list = reasonsByCase.get(flag.case_id) ?? [];
    list.push(flag.reason);
    reasonsByCase.set(flag.case_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    caseNo: row.case_no,
    slug: row.slug,
    title: row.title,
    body: row.body,
    status: row.status,
    isHidden: row.is_hidden,
    needsReview: row.needs_review,
    flagCount: row.flag_count,
    createdAt: row.created_at,
    authorId: row.author_id,
    reasons: reasonsByCase.get(row.id) ?? [],
  }));
}

/** Hides a case without removing it. Reversible. */
export async function hideCase(caseId: string): Promise<AdminResult> {
  const viewer = await requireAdmin();
  const admin = createServiceClient();

  await audit(caseId, 'hide', viewer.userId);

  const { error } = await admin
    .from('cases')
    .update({ is_hidden: true, needs_review: false })
    .eq('id', caseId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/docket');
  revalidatePath('/');
  return { ok: true };
}

/** Restores a case and clears its review mark. */
export async function restoreCase(caseId: string): Promise<AdminResult> {
  const viewer = await requireAdmin();
  const admin = createServiceClient();

  await audit(caseId, 'restore', viewer.userId);

  const { error } = await admin
    .from('cases')
    .update({ is_hidden: false, needs_review: false })
    .eq('id', caseId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/docket');
  revalidatePath('/');
  return { ok: true };
}

/**
 * Removes a case and strikes the author.
 *
 * This is the accountability half of the trust-tier model: filing requires a
 * verified account precisely so that a removal can attach to someone. At
 * MAX_STRIKES the account loses filing rights permanently — voting is untouched.
 */
export async function removeCase(
  caseId: string,
  note?: string
): Promise<AdminResult> {
  const viewer = await requireAdmin();
  const admin = createServiceClient();

  const { data: caseRow } = await admin
    .from('cases')
    .select('author_id, case_no')
    .eq('id', caseId)
    .maybeSingle();

  if (!caseRow) return { ok: false, error: 'Case not found.' };

  await audit(caseId, 'remove', viewer.userId, note, caseRow.case_no);

  const { error } = await admin
    .from('cases')
    .update({ status: 'removed', is_hidden: true, needs_review: false })
    .eq('id', caseId);

  if (error) return { ok: false, error: error.message };

  // Strike the author. Read-then-write is acceptable here: admin actions are
  // low-volume and single-operator, so there is no realistic race.
  const { data: profile } = await admin
    .from('profiles')
    .select('strikes')
    .eq('id', caseRow.author_id)
    .maybeSingle();

  if (profile) {
    const strikes = profile.strikes + 1;
    await admin
      .from('profiles')
      .update({
        strikes,
        filing_banned: strikes >= MAX_STRIKES,
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseRow.author_id);
  }

  revalidatePath('/admin/docket');
  revalidatePath('/');
  return { ok: true };
}

/** Dismisses reports as unfounded and leaves the case published. */
export async function dismissReports(caseId: string): Promise<AdminResult> {
  const viewer = await requireAdmin();
  const admin = createServiceClient();

  await audit(caseId, 'dismiss_reports', viewer.userId);

  await admin.from('flags').delete().eq('case_id', caseId);

  const { error } = await admin
    .from('cases')
    .update({ is_hidden: false, needs_review: false, flag_count: 0 })
    .eq('id', caseId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/docket');
  revalidatePath('/');
  return { ok: true };
}

/** Writes the audit row. Always called before the mutation it describes. */
async function audit(
  caseId: string,
  action: string,
  actorId: string | null,
  note?: string,
  caseNo?: number
) {
  const admin = createServiceClient();
  const { error } = await admin.from('moderation_actions').insert({
    case_id: caseId,
    case_no_snapshot: caseNo ?? null,
    action,
    actor_id: actorId,
    note: note ?? null,
  });
  if (error) {
    console.error('[admin] audit write failed:', error.message);
  }
}
