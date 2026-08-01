'use server';

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { requireAdmin } from '@/lib/auth/viewer';
import { MAX_STRIKES } from '@/lib/types';
import type { Database } from '@/lib/supabase/database.types';

type ModerationAction =
  Database['public']['Tables']['moderation_logs']['Row']['action'];

/**
 * Admin moderation actions.
 *
 * Every mutation is gated by `requireAdmin()`, which reads `profiles.is_admin` —
 * a database flag, so access can be granted without a redeploy. Writes use the
 * service client because `status`, `is_pro`, and `strikes` are trigger-guarded
 * against every other role.
 *
 * Two logs, deliberately, because they answer different questions:
 *  - `moderation_logs` — what happened to this content/user (typed action enum)
 *  - `admin_audit_logs` — which admin did what, for accountability
 *
 * Both are written before the mutation they describe, so the record survives even
 * if the mutation then fails.
 */

export interface AdminResult {
  ok: boolean;
  error?: string;
}

export interface QueuedCase {
  id: string;
  publicId: string;
  title: string;
  body: string;
  status: string;
  reportCount: number;
  createdAt: string;
  authorId: string | null;
  authorHandle: string | null;
  authorStrikes: number;
  reports: Array<{ reason: string; details: string | null }>;
}

/**
 * The review queue: reported cases and anything held for pre-publication review.
 *
 * Report details have no client-readable policy at all, so they are only visible
 * here, through the service role.
 */
export async function getReviewQueue(limit = 50): Promise<QueuedCase[]> {
  await requireAdmin();
  const admin = createServiceClient();

  const { data: cases, error } = await admin
    .from('cases')
    .select(
      'id, public_id, title, body, status, report_count, created_at, author_id'
    )
    .or('status.eq.pending_review,status.eq.hidden,report_count.gt.0')
    .neq('status', 'deleted')
    .order('report_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[admin] queue query failed:', error.message);
    return [];
  }

  const rows = cases ?? [];
  if (rows.length === 0) return [];

  const caseIds = rows.map((r) => r.id);
  const authorIds = rows
    .map((r) => r.author_id)
    .filter((id): id is string => id !== null);

  const [{ data: reports }, { data: authors }] = await Promise.all([
    admin
      .from('reports')
      .select('target_case_id, reason, details')
      .in('target_case_id', caseIds)
      .eq('status', 'pending'),
    authorIds.length > 0
      ? admin.from('profiles').select('id, handle, strikes').in('id', authorIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const reportsByCase = new Map<
    string,
    Array<{ reason: string; details: string | null }>
  >();
  for (const report of reports ?? []) {
    if (!report.target_case_id) continue;
    const list = reportsByCase.get(report.target_case_id) ?? [];
    list.push({ reason: report.reason, details: report.details });
    reportsByCase.set(report.target_case_id, list);
  }

  const authorById = new Map(
    (authors ?? []).map((a) => [a.id, { handle: a.handle, strikes: a.strikes }])
  );

  return rows.map((row) => {
    const author = row.author_id ? authorById.get(row.author_id) : undefined;
    return {
      id: row.id,
      publicId: row.public_id,
      title: row.title ?? 'Untitled case',
      body: row.body,
      status: row.status,
      reportCount: row.report_count,
      createdAt: row.created_at,
      authorId: row.author_id,
      authorHandle: author?.handle ?? null,
      authorStrikes: author?.strikes ?? 0,
      reports: reportsByCase.get(row.id) ?? [],
    };
  });
}

/** Publishes a case held in `pending_review`. */
export async function approveCase(caseId: string): Promise<AdminResult> {
  const viewer = await requireAdmin();
  const admin = createServiceClient();

  await audit(caseId, 'case.approve', viewer.userId);

  const { error } = await admin
    .from('cases')
    .update({ status: 'live', updated_at: new Date().toISOString() })
    .eq('id', caseId)
    .in('status', ['pending_review', 'hidden']);

  if (error) return { ok: false, error: error.message };
  revalidateAdmin();
  return { ok: true };
}

/** Hides a case without deleting it. Reversible, no strike. */
export async function hideCase(caseId: string): Promise<AdminResult> {
  const viewer = await requireAdmin();
  const admin = createServiceClient();

  const target = await loadCase(caseId);
  if (!target) return { ok: false, error: 'Case not found.' };

  await Promise.all([
    audit(caseId, 'case.hide', viewer.userId),
    moderationLog(caseId, 'content_hidden', target.author_id, 'Hidden by admin'),
  ]);

  const { error } = await admin
    .from('cases')
    .update({ status: 'hidden', updated_at: new Date().toISOString() })
    .eq('id', caseId);

  if (error) return { ok: false, error: error.message };
  revalidateAdmin();
  return { ok: true };
}

/**
 * Soft-deletes a case and strikes the author.
 *
 * This is the accountability half of the trust-tier model: filing requires a
 * verified account precisely so a removal can attach to someone. At MAX_STRIKES
 * the account loses filing rights — voting is untouched.
 *
 * Uses `deleted` rather than a hard DELETE so the audit trail keeps its FK.
 */
export async function removeCase(
  caseId: string,
  note?: string
): Promise<AdminResult> {
  const viewer = await requireAdmin();
  const admin = createServiceClient();

  const target = await loadCase(caseId);
  if (!target) return { ok: false, error: 'Case not found.' };

  await Promise.all([
    audit(caseId, 'case.remove', viewer.userId, { note, publicId: target.public_id }),
    moderationLog(
      caseId,
      'content_deleted',
      target.author_id,
      note ?? 'Removed by admin'
    ),
  ]);

  const { error } = await admin
    .from('cases')
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', caseId);

  if (error) return { ok: false, error: error.message };

  // Resolve the reports; they have been acted on.
  await admin
    .from('reports')
    .update({ status: 'actioned', resolved_at: new Date().toISOString() })
    .eq('target_case_id', caseId)
    .eq('status', 'pending');

  if (target.author_id) {
    await strikeAuthor(target.author_id, viewer.userId);
  }

  revalidateAdmin();
  return { ok: true };
}

/**
 * Increments strikes and bans at the limit.
 *
 * Read-then-write is acceptable here: admin actions are low-volume and
 * single-operator, so there is no realistic race.
 */
async function strikeAuthor(authorId: string, adminId: string | null) {
  const admin = createServiceClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('strikes')
    .eq('id', authorId)
    .maybeSingle();

  if (!profile) return;

  const strikes = profile.strikes + 1;
  const shouldBan = strikes >= MAX_STRIKES;

  await admin
    .from('profiles')
    .update({
      strikes,
      is_banned: shouldBan,
      ban_reason: shouldBan
        ? `${MAX_STRIKES} cases removed for rule violations`
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', authorId);

  await moderationLog(
    authorId,
    shouldBan ? 'ban' : 'warn',
    authorId,
    `Strike ${strikes} of ${MAX_STRIKES}`,
    'user'
  );

  if (shouldBan) {
    await audit(authorId, 'user.ban', adminId, { strikes });
  }
}

/** Dismisses reports as unfounded and restores the case. */
export async function dismissReports(caseId: string): Promise<AdminResult> {
  const viewer = await requireAdmin();
  const admin = createServiceClient();

  await audit(caseId, 'reports.dismiss', viewer.userId);

  // Marking them resolved (not deleting) drops report_count via the trigger
  // while preserving the record of who reported what.
  await admin
    .from('reports')
    .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
    .eq('target_case_id', caseId)
    .eq('status', 'pending');

  const { error } = await admin
    .from('cases')
    .update({ status: 'live', updated_at: new Date().toISOString() })
    .eq('id', caseId)
    .eq('status', 'hidden');

  if (error) return { ok: false, error: error.message };
  revalidateAdmin();
  return { ok: true };
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function loadCase(caseId: string) {
  const admin = createServiceClient();
  const { data } = await admin
    .from('cases')
    .select('id, public_id, author_id')
    .eq('id', caseId)
    .maybeSingle();
  return data;
}

/** Who did what. Written before the mutation it describes. */
async function audit(
  targetId: string,
  action: string,
  adminId: string | null,
  metadata?: Record<string, unknown>
) {
  const admin = createServiceClient();
  const { error } = await admin.from('admin_audit_logs').insert({
    admin_id: adminId,
    action,
    target_type: action.startsWith('user.') ? 'user' : 'case',
    target_id: targetId,
    metadata: (metadata ?? null) as never,
  });
  if (error) console.error('[admin] audit write failed:', error.message);
}

/** What happened to the content or user, with a typed action. */
async function moderationLog(
  targetId: string,
  action: ModerationAction,
  targetUserId: string | null,
  reason: string,
  targetType: 'case' | 'user' = 'case'
) {
  const admin = createServiceClient();
  const { error } = await admin.from('moderation_logs').insert({
    target_type: targetType,
    target_id: targetId,
    target_user_id: targetUserId,
    action,
    reason,
  });
  if (error) console.error('[admin] moderation log failed:', error.message);
}

function revalidateAdmin() {
  revalidatePath('/admin/docket');
  revalidatePath('/');
  revalidatePath('/docket');
}
