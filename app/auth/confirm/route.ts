import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/public-env';

/**
 * Magic-link / email-confirmation landing route.
 *
 * Why this exists: Supabase sends **one template** for both magic links and email
 * OTPs. The default template contains `{{ .ConfirmationURL }}`, so users receive a
 * *link* even though the app asks for a 6-digit code. Adding `{{ .Token }}` to the
 * template fixes that (see docs/SETUP.md), but a link is still the default and
 * still arrives for password recovery and email-change flows.
 *
 * So both paths work: the in-app form accepts a typed code, and this route accepts
 * a clicked link. Neither depends on the other being configured.
 *
 * Note the caveat for the anonymous→verified upgrade: a link opened in a
 * different browser than the one holding the anonymous session cannot upgrade that
 * session, because the session cookie is not there. It signs the user in as a
 * fresh verified account instead, and their earlier votes stay with the abandoned
 * anonymous id. Typing the code never has this problem, which is why the UI leads
 * with the code.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNext(searchParams.get('next'));

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      `${env.siteUrl}/account?error=invalid_link`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error) {
    console.error('[auth] token_hash verification failed:', error.message);
    return NextResponse.redirect(`${env.siteUrl}/account?error=link_expired`);
  }

  // The profile trigger has already provisioned the row; getViewer() will now
  // resolve this session as verified.
  return NextResponse.redirect(`${env.siteUrl}${next}?verified=1`);
}

/**
 * Only same-origin relative paths.
 *
 * Reflecting an attacker-supplied absolute URL here would turn a link in a
 * legitimate-looking auth email into an open redirect, which is a classic
 * phishing primitive.
 */
function safeNext(candidate: string | null): string {
  if (!candidate || !candidate.startsWith('/')) return '/account';
  if (candidate.startsWith('//') || /[\r\n\t]/.test(candidate)) return '/account';
  return candidate;
}
