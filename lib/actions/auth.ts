'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/auth/viewer';
import { clientIp } from '@/lib/auth/fingerprint';
import { checkLimit, limitMessage } from '@/lib/rate-limit';
import { signInSchema, verifyOtpSchema, fieldErrors } from '@/lib/validation';
import { env } from '@/lib/public-env';

/**
 * Auth actions.
 *
 * The trust-tier model in practice:
 *  - Everyone gets an anonymous session on first visit so they can vote.
 *  - Filing requires a verified account, reached by *upgrading* the anonymous
 *    session in place (`updateUser` + OTP), which preserves the vote history.
 *
 * That upgrade path is why we don't just gate the whole site behind a login:
 * a drive-by voter becomes a filer without losing anything.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Ensures the visitor has *some* session, minting an anonymous one if needed.
 *
 * Called from a client provider on mount. Safe to call repeatedly: if a session
 * already exists it is a no-op.
 */
export async function ensureJuror(): Promise<{ signedIn: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) return { signedIn: true };

  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error('[auth] anonymous sign-in failed:', error.message);
    return { signedIn: false };
  }
  return { signedIn: true };
}

/**
 * Sends a 6-digit code to verify an email address.
 *
 * Two distinct flows, because Supabase treats them differently:
 *  - anonymous session present → `updateUser({ email })`, confirmed with
 *    OTP type `email_change`. The user keeps their id and their votes.
 *  - no session → `signInWithOtp`, confirmed with OTP type `email`.
 */
export async function requestVerification(
  formData: FormData
): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  const { email } = parsed.data;

  const ip = clientIp(await headers());
  const limit = await checkLimit('auth:otp', `${ip}:${email}`);
  if (!limit.ok) return { ok: false, error: limitMessage(limit) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAnonymousUpgrade =
    user !== null && user.is_anonymous === true;

  if (isAnonymousUpgrade) {
    const { error } = await supabase.auth.updateUser({ email });
    if (error) {
      // Most common cause: the address already belongs to another account.
      return {
        ok: false,
        error:
          error.message.toLowerCase().includes('already')
            ? 'That email is already registered. Sign in with it instead.'
            : 'Could not send the code. Try again.',
      };
    }
    return { ok: true };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) {
    console.error('[auth] OTP send failed:', error.message);
    return { ok: false, error: 'Could not send the code. Try again.' };
  }
  return { ok: true };
}

/**
 * Confirms the emailed code.
 *
 * Tries `email_change` first (the anonymous-upgrade path) and falls back to
 * `email` (fresh sign-in), because the client does not reliably know which flow
 * it started — and guessing wrong would strand the user on a valid code.
 */
export async function confirmVerification(
  formData: FormData
): Promise<ActionResult> {
  const parsed = verifyOtpSchema.safeParse({
    email: formData.get('email'),
    token: formData.get('token'),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  }
  const { email, token } = parsed.data;

  const ip = clientIp(await headers());
  const limit = await checkLimit('auth:otp', `verify:${ip}`);
  if (!limit.ok) return { ok: false, error: limitMessage(limit) };

  const supabase = await createClient();

  for (const type of ['email_change', 'email'] as const) {
    const { error } = await supabase.auth.verifyOtp({ email, token, type });
    if (!error) {
      // The DB trigger promotes anonymous → verified once the address confirms.
      revalidatePath('/', 'layout');
      return { ok: true };
    }
  }

  return { ok: false, error: 'That code is wrong or expired. Request a new one.' };
}

/** Starts the Google OAuth handshake. Returns a URL for the client to visit. */
export async function startGoogleOAuth(): Promise<
  ActionResult & { url?: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectTo = `${env.siteUrl}/auth/callback`;

  // An anonymous user links Google to their existing id, keeping their votes.
  if (user?.is_anonymous) {
    const { data, error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) {
      console.error('[auth] linkIdentity failed:', error.message);
      return { ok: false, error: 'Could not connect Google. Try again.' };
    }
    return { ok: true, url: data.url };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) {
    console.error('[auth] signInWithOAuth failed:', error.message);
    return { ok: false, error: 'Could not connect Google. Try again.' };
  }
  return { ok: true, url: data.url };
}

/**
 * Signs out and immediately mints a fresh anonymous session, so the visitor can
 * still vote. Signing out of a court should not lock you out of the gallery.
 */
export async function signOut(): Promise<ActionResult> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await supabase.auth.signInAnonymously();
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Server-rendered permission snapshot for client components. */
export async function getViewerSnapshot() {
  const viewer = await getViewer();
  return {
    isSignedIn: viewer.isSignedIn,
    isVerified: viewer.isVerified,
    isPlus: viewer.isPlus,
    canFile: viewer.canFile,
    canFlag: viewer.canFlag,
    fileBlockedReason: viewer.fileBlockedReason,
  };
}
