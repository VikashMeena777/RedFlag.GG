import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/public-env';

/**
 * OAuth / magic-link return leg.
 *
 * Exchanges the code for a session, which is what promotes an anonymous juror to
 * verified (the DB trigger fires on `email_confirmed_at`).
 *
 * The redirect target is validated as a same-origin relative path. Reflecting an
 * attacker-supplied absolute URL here would turn the callback into an open
 * redirect, which is a classic phishing primitive on auth endpoints.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(`${env.siteUrl}/account?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth] code exchange failed:', error.message);
    return NextResponse.redirect(`${env.siteUrl}/account?error=verify_failed`);
  }

  return NextResponse.redirect(`${env.siteUrl}${next}`);
}

/** Only same-origin relative paths. Anything else falls back to /account. */
function safeNext(candidate: string | null): string {
  if (!candidate) return '/account';
  if (!candidate.startsWith('/')) return '/account';
  // Reject protocol-relative ("//evil.com") and control characters.
  if (candidate.startsWith('//') || /[\r\n\t]/.test(candidate)) return '/account';
  return candidate;
}
