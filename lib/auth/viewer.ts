import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { serverEnv } from '@/lib/env';
import {
  MIN_ACCOUNT_AGE_MINUTES,
  MAX_STRIKES,
  TIER_VOTE_WEIGHT,
  type Tier,
} from '@/lib/types';

/**
 * The authenticated caller, as resolved on the server.
 *
 * Nothing here is ever taken from the client. `tier` comes from the profiles
 * table, not from a cookie or a form field, and every permission flag is
 * derived from it. Client components receive only the booleans they need to
 * render — never the raw tier as an authority.
 */
export interface Viewer {
  userId: string | null;
  tier: Tier;
  isSignedIn: boolean;
  isAnonymous: boolean;
  isVerified: boolean;
  isPlus: boolean;
  isAdmin: boolean;
  /** Jury weight this viewer's ballot carries. */
  voteWeight: number;
  /** May file a case: verified, unbanned, under the strike limit, past cooldown. */
  canFile: boolean;
  /** Reason filing is blocked, for a useful UI message. */
  fileBlockedReason: FileBlockedReason | null;
  canFlag: boolean;
  strikes: number;
}

export type FileBlockedReason =
  | 'not_signed_in'
  | 'not_verified'
  | 'account_too_new'
  | 'banned'
  | 'too_many_strikes';

const ANONYMOUS_VIEWER: Viewer = {
  userId: null,
  tier: 'anonymous',
  isSignedIn: false,
  isAnonymous: true,
  isVerified: false,
  isPlus: false,
  isAdmin: false,
  voteWeight: TIER_VOTE_WEIGHT.anonymous,
  canFile: false,
  fileBlockedReason: 'not_signed_in',
  canFlag: false,
  strikes: 0,
};

/**
 * Resolves the current viewer.
 *
 * Uses `getUser()` rather than `getSession()`: the former validates the JWT
 * against the auth server, the latter trusts whatever is in the cookie.
 */
export async function getViewer(): Promise<Viewer> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return ANONYMOUS_VIEWER;

  // Read the profile with the service client: `profiles` is only self-readable
  // under RLS, and this avoids a policy round-trip on every page render.
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('tier, strikes, filing_banned, plus_until, created_at')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    // Auth user exists but the profile trigger hasn't landed yet. Treat as
    // anonymous — deny by default rather than assuming privileges.
    return { ...ANONYMOUS_VIEWER, userId: user.id, isSignedIn: true };
  }

  // Expired RedFlag+ silently degrades to verified; mirrors effective_tier().
  const plusExpired =
    profile.tier === 'plus' &&
    profile.plus_until !== null &&
    new Date(profile.plus_until) < new Date();
  const tier: Tier = plusExpired ? 'verified' : profile.tier;

  const isVerified = tier === 'verified' || tier === 'plus';
  const accountAgeMs = Date.now() - new Date(profile.created_at).getTime();
  const isOldEnough = accountAgeMs >= MIN_ACCOUNT_AGE_MINUTES * 60_000;

  let fileBlockedReason: FileBlockedReason | null = null;
  if (!isVerified) fileBlockedReason = 'not_verified';
  else if (profile.filing_banned) fileBlockedReason = 'banned';
  else if (profile.strikes >= MAX_STRIKES) fileBlockedReason = 'too_many_strikes';
  else if (!isOldEnough) fileBlockedReason = 'account_too_new';

  return {
    userId: user.id,
    tier,
    isSignedIn: true,
    isAnonymous: tier === 'anonymous',
    isVerified,
    isPlus: tier === 'plus',
    isAdmin: serverEnv.adminUserIds.includes(user.id),
    voteWeight: TIER_VOTE_WEIGHT[tier],
    canFile: fileBlockedReason === null,
    fileBlockedReason,
    canFlag: isVerified,
    strikes: profile.strikes,
  };
}

/** Throws unless the viewer is an allowlisted admin. Use in admin routes. */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer.isAdmin) {
    throw new Error('FORBIDDEN');
  }
  return viewer;
}

export const FILE_BLOCKED_MESSAGES: Record<FileBlockedReason, string> = {
  not_signed_in: 'Sign in to file a case.',
  not_verified:
    'Filing a case requires a verified account. Voting stays anonymous.',
  account_too_new: `New accounts can file ${MIN_ACCOUNT_AGE_MINUTES} minutes after verification.`,
  banned: 'Your filing privileges have been revoked.',
  too_many_strikes:
    'Too many of your cases were removed. Filing is disabled on this account.',
};
