import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  MIN_ACCOUNT_AGE_MINUTES,
  MAX_STRIKES,
  TIER_VOTE_WEIGHT,
  type Tier,
} from '@/lib/types';

/**
 * The authenticated caller, as resolved on the server.
 *
 * Nothing here is ever taken from the client. The tier is *derived* rather than
 * stored: `profiles` carries `is_pro` / `is_admin` / `is_banned`, and whether the
 * session is anonymous comes from `auth.users.is_anonymous`. Client components
 * receive only the booleans they need to render — never a tier they could forge.
 */
export interface Viewer {
  userId: string | null;
  tier: Tier;
  handle: string | null;
  isSignedIn: boolean;
  isAnonymous: boolean;
  isVerified: boolean;
  isPro: boolean;
  /** When the current 30-day Pro pass ends; null when not Pro. */
  proExpiresAt: string | null;
  /**
   * A Cashfree order reference exists for this account (a checkout was
   * started). Drives the account page's payment self-heal — never exposed to
   * the client.
   */
  hasPaymentRef: boolean;
  isAdmin: boolean;
  /** Jury weight this viewer's ballot carries. */
  voteWeight: number;
  /** May file a case: verified, unbanned, under the strike limit, past cooldown. */
  canFile: boolean;
  /** Reason filing is blocked, for a useful UI message. */
  fileBlockedReason: FileBlockedReason | null;
  canReport: boolean;
  strikes: number;
  karma: number;
  /**
   * Shadow-banned users see their own content as normal but nobody else does.
   * Surfaced so writes can be accepted-then-hidden rather than rejected.
   */
  isShadowBanned: boolean;
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
  handle: null,
  isSignedIn: false,
  isAnonymous: true,
  isVerified: false,
  isPro: false,
  proExpiresAt: null,
  hasPaymentRef: false,
  isAdmin: false,
  voteWeight: TIER_VOTE_WEIGHT.anonymous,
  canFile: false,
  fileBlockedReason: 'not_signed_in',
  canReport: false,
  strikes: 0,
  karma: 0,
  isShadowBanned: false,
};

/**
 * Resolves the current viewer.
 *
 * Uses `getUser()` rather than `getSession()`: the former validates the JWT
 * against the auth server, the latter trusts whatever is in the cookie.
 */
export async function getViewer(): Promise<Viewer> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return ANONYMOUS_VIEWER;

    // Read the profile with the service client: `profiles` is self-readable only
    // under RLS, and this avoids a policy round-trip on every render.
    const admin = createServiceClient();
    const { data: profile } = await admin
      .from('profiles')
      .select(
        'handle, karma, is_admin, is_pro, pro_expires_at, is_banned, is_shadow_banned, strikes, created_at, cf_subscription_ref'
      )
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      // Auth user exists but the provisioning trigger hasn't landed yet. Deny by
      // default rather than assuming privileges.
      return { ...ANONYMOUS_VIEWER, userId: user.id, isSignedIn: true };
    }

    /*
     * Anonymity comes from the auth record, not the profile. Supabase sets
     * `is_anonymous` on sessions created by `signInAnonymously()`, and clears it
     * once an email or OAuth identity is linked and confirmed — which is exactly
     * the upgrade path that lets a drive-by voter keep their history.
     */
    const isAnonymous = user.is_anonymous === true;

    // Expired Pro silently degrades to verified.
    const proExpired =
      profile.is_pro &&
      profile.pro_expires_at !== null &&
      new Date(profile.pro_expires_at) < new Date();
    const isPro = profile.is_pro && !proExpired;

    const tier: Tier = isAnonymous ? 'anonymous' : isPro ? 'pro' : 'verified';
    const isVerified = !isAnonymous;

    const accountAgeMs = Date.now() - new Date(profile.created_at).getTime();
    const isOldEnough = accountAgeMs >= MIN_ACCOUNT_AGE_MINUTES * 60_000;

    let fileBlockedReason: FileBlockedReason | null = null;
    if (!isVerified) fileBlockedReason = 'not_verified';
    else if (profile.is_banned) fileBlockedReason = 'banned';
    else if (profile.strikes >= MAX_STRIKES) fileBlockedReason = 'too_many_strikes';
    else if (!isOldEnough) fileBlockedReason = 'account_too_new';

    return {
      userId: user.id,
      tier,
      handle: profile.handle,
      isSignedIn: true,
      isAnonymous,
      isVerified,
      isPro,
      proExpiresAt: profile.pro_expires_at ?? null,
      hasPaymentRef: profile.cf_subscription_ref !== null,
      // Admin comes from the database flag, not an env allowlist, so access can be
      // granted without a redeploy.
      isAdmin: profile.is_admin === true,
      voteWeight: TIER_VOTE_WEIGHT[tier],
      canFile: fileBlockedReason === null,
      fileBlockedReason,
      canReport: isVerified && !profile.is_banned,
      strikes: profile.strikes,
      karma: profile.karma,
      isShadowBanned: profile.is_shadow_banned === true,
    };
  } catch (err) {
    /*
     * Next's static-generation probe calls the page without a request, so
     * `cookies()` throws "Dynamic server usage" — expected control flow that
     * marks the route dynamic, not a crash worth logging. Anything else is.
     */
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('Dynamic server usage')) {
      console.error('[viewer] getViewer crashed:', message);
    }
    return ANONYMOUS_VIEWER;
  }
}

/** Throws unless the viewer is an admin. Use in admin routes and actions. */
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
