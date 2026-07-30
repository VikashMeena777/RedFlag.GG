'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getViewer } from '@/lib/auth/viewer';
import { clientIp, fingerprint } from '@/lib/auth/fingerprint';
import { checkLimit, limitMessage } from '@/lib/rate-limit';
import { voteSchema } from '@/lib/validation';
import { voteSplit } from '@/lib/utils';
import type { VoteChoice } from '@/lib/types';

/**
 * Voting.
 *
 * This is the one write path anonymous users may take, so it carries the most
 * anti-fraud weight:
 *
 *  - `(case_id, voter_id)` unique constraint → one ballot per identity.
 *  - `(case_id, voter_fp)` partial unique index on anonymous rows → clearing
 *    site data to mint a fresh identity does not buy a second vote from the same
 *    device/IP. Verified users are exempt, because a shared household NAT is
 *    legitimate.
 *  - Tier-weighted tallies → an anonymous swarm cannot out-shout real accounts.
 *  - Self-voting and closed-case voting rejected by DB trigger.
 *
 * The weight is read from the server-resolved viewer, never from the request.
 */

export interface VoteResult {
  ok: boolean;
  error?: string;
  /** Fresh tallies so the client can reconcile its optimistic update. */
  tally?: {
    redVotes: number;
    greenVotes: number;
    redPct: number;
    greenPct: number;
    total: number;
  };
  myVote?: VoteChoice;
}

export async function castVote(
  slug: string,
  choice: VoteChoice
): Promise<VoteResult> {
  const parsed = voteSchema.safeParse({ slug, choice });
  if (!parsed.success) {
    return { ok: false, error: 'Invalid ballot.' };
  }

  const viewer = await getViewer();
  if (!viewer.userId) {
    return { ok: false, error: 'Court is still seating you. Try again.' };
  }

  const headerList = await headers();
  const ip = clientIp(headerList);

  const limit = await checkLimit('vote', viewer.userId);
  if (!limit.ok) return { ok: false, error: limitMessage(limit) };

  const supabase = await createClient();

  const { data: caseRow } = await supabase
    .from('cases')
    .select('id, status, author_id')
    .eq('slug', parsed.data.slug)
    .maybeSingle();

  if (!caseRow) return { ok: false, error: 'Case not found.' };
  if (caseRow.status !== 'in_session') {
    return { ok: false, error: 'The gavel already dropped on this one.' };
  }
  if (caseRow.author_id === viewer.userId) {
    return { ok: false, error: 'You cannot vote on your own case.' };
  }

  const isAnonymousVote = !viewer.isVerified;
  const voterFp = isAnonymousVote
    ? fingerprint(ip, headerList.get('user-agent') ?? '')
    : null;

  /*
   * Anonymous fingerprint pre-check.
   *
   * The partial unique index is the real enforcement, but querying first lets us
   * distinguish "you already voted from this device" (a clear message) from an
   * opaque constraint violation. Uses the service client because RLS would not
   * expose another identity's ballot.
   */
  if (isAnonymousVote && voterFp) {
    const admin = createServiceClient();
    const { data: existingFp } = await admin
      .from('votes')
      .select('voter_id, choice')
      .eq('case_id', caseRow.id)
      .eq('voter_fp', voterFp)
      .eq('is_anonymous_vote', true)
      .maybeSingle();

    if (existingFp && existingFp.voter_id !== viewer.userId) {
      return {
        ok: false,
        error: 'This device already voted on this case.',
      };
    }
  }

  const { error } = await supabase.from('votes').upsert(
    {
      case_id: caseRow.id,
      voter_id: viewer.userId,
      choice: parsed.data.choice,
      weight: viewer.voteWeight,
      voter_fp: voterFp,
      is_anonymous_vote: isAnonymousVote,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'case_id,voter_id' }
  );

  if (error) {
    if (error.message.includes('CASE_CLOSED')) {
      return { ok: false, error: 'The gavel already dropped on this one.' };
    }
    if (error.message.includes('SELF_VOTE')) {
      return { ok: false, error: 'You cannot vote on your own case.' };
    }
    if (error.message.includes('votes_anon_fp_idx')) {
      return { ok: false, error: 'This device already voted on this case.' };
    }
    console.error('[votes] upsert failed:', error.message);
    return { ok: false, error: 'Could not record your vote. Try again.' };
  }

  // Read the trigger-maintained tallies back rather than computing them here.
  const { data: updated } = await supabase
    .from('cases')
    .select('red_votes, green_votes, red_weight, green_weight')
    .eq('id', caseRow.id)
    .maybeSingle();

  revalidatePath(`/case/${parsed.data.slug}`);
  revalidatePath('/');

  if (!updated) return { ok: true, myVote: parsed.data.choice };

  // Displayed percentages follow the weighted tally, which is what the verdict
  // and the ranking use. Showing raw counts alongside a weighted bar would lie.
  const split = voteSplit(updated.red_weight, updated.green_weight);

  return {
    ok: true,
    myVote: parsed.data.choice,
    tally: {
      redVotes: updated.red_votes,
      greenVotes: updated.green_votes,
      redPct: split.red,
      greenPct: split.green,
      total: updated.red_votes + updated.green_votes,
    },
  };
}
