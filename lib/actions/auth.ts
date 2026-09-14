'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/auth/viewer';
import { clientIp } from '@/lib/auth/fingerprint';
import { checkLimit, limitMessage } from '@/lib/rate-limit';
import { signInSchema, fieldErrors } from '@/lib/validation';
import { env } from '@/lib/public-env';

/**
 * Auth actions.
 *
 * **Verification is magic-link only.** The 6-digit code flow was removed: it
 * relied on the Supabase email template containing `{{ .Token }}`, which is not
 * the default, so users routinely received a link while the UI demanded a code —
 * an app that looks broken through no fault of theirs. A link works with the
 * stock template and needs no dashboard configuration.
 *
 * There is no phone/SMS auth anywhere in this app: sign-in is the emailed magic
 * link or Google OAuth, and the only phone field (Cashfree checkout) is the
 * payment provider's own requirement. No OTP provider is needed.
 *
 * Anonymous sessions are minted by `castVote` on a visitor's first ballot; the
 * paths below upgrade such a session in place when the user later verifies.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Maps Supabase auth errors to copy a user can act on.
 *
 * The important one is the email rate limit: Supabase's built-in mail service
 * sends at most a couple of emails per hour (project-wide) until custom SMTP is
 * configured. Surfacing the raw "Email rate limit exceeded" reads as a bug;
 * pointing at the Google button gives the user a working alternative.
 */
function friendlyAuthError(error: {
  message: string;
  status?: number;
  code?: string;
}): string {
  const msg = error.message.toLowerCase();
  const limited =
    error.code === 'over_email_send_rate_limit' ||
    error.status === 429 ||
    msg.includes('rate limit');
  if (limited) {
    return 'We can only send a few emails per hour right now. Use "Continue with Google", or request a link again later.';
  }
  if (msg.includes('not allowed') || msg.includes('disabled')) {
    return 'Email sign-in is unavailable right now. Use "Continue with Google".';
  }
  if (msg.includes('invalid') || msg.includes('unable')) {
    return 'That email address was rejected. Check it and try again.';
  }
  console.error('[auth] magic link send failed:', error.message);
  return 'Could not send the link. Please try again.';
}

/**
 * Emails a verification link.
 *
 * Uses `signInWithOtp` which sends a magic link. The link lands on
 * `/auth/confirm`, which finalises the session.
 */
export async function requestVerification(
  formData: FormData
): Promise<ActionResult> {
  try {
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

    const redirectTo = `${env.siteUrl}/auth/confirm?next=/account`;

    // If user has an anonymous session, upgrade it in place.
    if (user?.is_anonymous === true) {
      const { error } = await supabase.auth.updateUser(
        { email },
        { emailRedirectTo: redirectTo }
      );
      if (error) {
        return {
          ok: false,
          error: error.message.toLowerCase().includes('already')
            ? 'That email is already registered. Use the link we send to sign in.'
            : friendlyAuthError(error),
        };
      }
      return { ok: true };
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
    });
    if (error) {
      return { ok: false, error: friendlyAuthError(error) };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[auth] requestVerification crashed:', msg, err);
    return { ok: false, error: `Login error: ${msg}` };
  }
}

/** Starts the Google OAuth handshake. Returns a URL for the client to visit. */
export async function startGoogleOAuth(): Promise<
  ActionResult & { url?: string }
> {
  try {
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[auth] startGoogleOAuth crashed:', msg, err);
    return { ok: false, error: `Google login error: ${msg}` };
  }
}

/**
 * Signs out. No new anonymous session is re-minted here: the next ballot the
 * user casts will seat a fresh one (see `castVote`), which is the only moment
 * an identity is actually needed.
 */
export async function signOut(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[auth] signOut crashed:', msg, err);
    return { ok: false, error: 'Could not sign out. Please try again.' };
  }
}

/** Server-rendered permission snapshot for client components. */
export async function getViewerSnapshot() {
  try {
    const viewer = await getViewer();
    return {
      isSignedIn: viewer.isSignedIn,
      isVerified: viewer.isVerified,
      isPro: viewer.isPro,
      canFile: viewer.canFile,
      canReport: viewer.canReport,
      fileBlockedReason: viewer.fileBlockedReason,
    };
  } catch (err) {
    console.error('[auth] getViewerSnapshot crashed:', err);
    return {
      isSignedIn: false,
      isVerified: false,
      isPro: false,
      canFile: false,
      canReport: false,
      fileBlockedReason: 'not_signed_in' as const,
    };
  }
}
