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
 * The trust-tier model in practice:
 *  - Everyone gets an anonymous session on first visit so they can vote.
 *  - Filing requires a verified account, reached by *upgrading* the anonymous
 *    session in place, which preserves the vote history.
 *
 * That upgrade path is why the whole site is not gated behind a login: a
 * drive-by voter becomes a filer without losing anything.
 *
 * **Verification is magic-link only.** The 6-digit code flow was removed: it
 * relied on the Supabase email template containing `{{ .Token }}`, which is not
 * the default, so users routinely received a link while the UI demanded a code —
 * an app that looks broken through no fault of theirs. A link works with the
 * stock template and needs no dashboard configuration.
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
  try {
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
  } catch (err) {
    console.error('[auth] ensureJuror crashed:', err);
    return { signedIn: false };
  }
}

/**
 * Emails a verification link.
 *
 * Two distinct flows, because Supabase treats them differently:
 *  - anonymous session present → `updateUser({ email })`. The confirmation link
 *    carries `type=email_change` and the user keeps their id, so votes survive.
 *  - no session → `signInWithOtp`, whose link carries `type=magiclink`.
 *
 * Either way the link lands on `/auth/confirm`, which handles both types.
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

    // Upgrade in place so the anonymous session's votes are preserved.
    if (user?.is_anonymous === true) {
      const { error } = await supabase.auth.updateUser(
        { email },
        { emailRedirectTo: redirectTo }
      );
      if (error) {
        // Most common cause: the address already belongs to another account.
        return {
          ok: false,
          error: error.message.toLowerCase().includes('already')
            ? 'That email is already registered. Use the link we send to sign in.'
            : 'Could not send the link. Try again.',
        };
      }
      return { ok: true };
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
    });
    if (error) {
      console.error('[auth] magic link send failed:', error.message);
      return { ok: false, error: 'Could not send the link. Try again.' };
    }
    return { ok: true };
  } catch (err) {
    console.error('[auth] requestVerification crashed:', err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
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
    console.error('[auth] startGoogleOAuth crashed:', err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

/**
 * Signs out and immediately mints a fresh anonymous session, so the visitor can
 * still vote. Signing out of a court should not lock you out of the gallery.
 */
export async function signOut(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    await supabase.auth.signInAnonymously();
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (err) {
    console.error('[auth] signOut crashed:', err);
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
