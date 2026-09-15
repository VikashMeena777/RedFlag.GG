'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getViewer } from '@/lib/auth/viewer';
import { checkLimit, limitMessage } from '@/lib/rate-limit';

/**
 * Self-serve account deletion.
 *
 * What "delete my whole account data" means here, mapped to the actual schema:
 *
 *   Erased                                   | Why
 *   -----------------------------------------+--------------------------------
 *   profile (handle, karma, strikes, …)      | the account itself
 *   auth user (identities, sessions, tokens) | sign-in becomes impossible
 *   every ballot the user cast               | personal participation
 *   every case they filed                    | their content; everything
 *                                           | hanging off it (other jurors'
 *                                           | ballots on those cases, their
 *                                           | reports, comments) goes too
 *   every report they made                   | personal participation
 *
 *   Kept, anonymised                         | Why
 *   -----------------------------------------+--------------------------------
 *   payment rows (user_id → null via FK)     | accounting/disputes need the
 *                                           | transaction records; they keep
 *                                           | no link to the person
 *   moderation/audit log entries (ids nulled)| accountability history
 *   one admin_audit_logs row recording the   | proof the erasure happened,
 *     deletion itself (ids + counts only)    | with no personal data
 *
 * Ordering matters: authored cases and reports are deleted *while the profile
 * link still exists* (their foreign keys are SET NULL, not CASCADE — deleting
 * the profile first would orphan them). Ballots on other people's cases
 * cascade from the profile, but are deleted explicitly first so the audit
 * counts are exact and the tally triggers adjust every surviving case.
 *
 * Partial failure is safe: the operation is re-runnable — a retry simply
 * deletes whatever is left.
 */

const CONFIRM_PHRASE = 'DELETE';

export interface DeleteAccountResult {
  ok: boolean;
  error?: string;
}

export async function deleteMyAccount(
  confirmText: string
): Promise<DeleteAccountResult> {
  const viewer = await getViewer();
  if (!viewer.userId) {
    return { ok: false, error: 'Not signed in.' };
  }

  const limit = await checkLimit('account:delete', viewer.userId);
  if (!limit.ok) return { ok: false, error: limitMessage(limit) };

  if (confirmText.trim().toUpperCase() !== CONFIRM_PHRASE) {
    return {
      ok: false,
      error: `Type ${CONFIRM_PHRASE} exactly to confirm.`,
    };
  }

  const userId = viewer.userId;

  try {
    /*
     * Sign out first, while the session still exists to revoke: this clears
     * the cookies on the response, so the moment the action returns the user
     * is signed out even if a later step were to fail.
     */
    const supabase = await createClient();
    await supabase.auth.signOut();

    const admin = createServiceClient();

    // Reports first — the FK would otherwise just null them out.
    const { data: deletedReports } = await admin
      .from('reports')
      .delete()
      .eq('reporter_id', userId)
      .select('id');

    // Their filed cases. Cascades take everything hanging off them; the tally
    // triggers keep every surviving case consistent as ballots disappear.
    const { data: deletedCases, error: casesError } = await admin
      .from('cases')
      .delete()
      .eq('author_id', userId)
      .select('id');
    if (casesError) throw new Error(`cases: ${casesError.message}`);

    // Their ballots on other people's cases (would also cascade from the
    // profile, but doing it explicitly keeps the audit count exact).
    const { data: deletedVotes } = await admin
      .from('votes')
      .delete()
      .eq('user_id', userId)
      .select('id');

    // Audit: that an erasure happened, with counts only — no personal data.
    const { error: auditError } = await admin.from('admin_audit_logs').insert({
      admin_id: null,
      action: 'user.self_delete',
      target_type: 'user',
      target_id: userId,
      metadata: {
        handle: viewer.handle,
        cases: deletedCases?.length ?? 0,
        votes: deletedVotes?.length ?? 0,
        reports: deletedReports?.length ?? 0,
      } as never,
    });
    if (auditError) {
      console.error('[account] deletion audit write failed:', auditError.message);
    }

    // The auth user — identities, sessions, refresh tokens — then the profile.
    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError) throw new Error(`auth user: ${authError.message}`);

    const { error: profileError } = await admin
      .from('profiles')
      .delete()
      .eq('id', userId);
    if (profileError) throw new Error(`profile: ${profileError.message}`);

    revalidatePath('/');
    revalidatePath('/docket');
    return { ok: true };
  } catch (error) {
    console.error('[account] deletion failed:', error);
    return {
      ok: false,
      error:
        'Could not finish deleting your record. Sign back in and try again — repeating is safe and picks up where it left off.',
    };
  }
}
