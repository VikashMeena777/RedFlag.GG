import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/public-env';

/**
 * OAuth / magic-link return leg.
 *
 * Handles both OAuth code exchange and magic link token/hash verification.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash') || searchParams.get('token');
  const type = (searchParams.get('type') as EmailOtpType | null) || 'email';
  const next = safeNext(searchParams.get('next'));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${env.siteUrl}${next}?verified=1`);
    }
    console.error('[auth] callback code exchange failed:', error.message);
  }

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) {
      return NextResponse.redirect(`${env.siteUrl}${next}?verified=1`);
    }
    console.error('[auth] callback verifyOtp failed:', error.message);
    return NextResponse.redirect(`${env.siteUrl}/account?error=link_expired`);
  }

  if (!code && !tokenHash) {
    return NextResponse.redirect(`${env.siteUrl}/account?error=missing_code`);
  }

  return NextResponse.redirect(`${env.siteUrl}/account?error=verify_failed`);
}

/** Only same-origin relative paths. Anything else falls back to /account. */
function safeNext(candidate: string | null): string {
  if (!candidate || !candidate.startsWith('/')) return '/account';
  if (candidate.startsWith('//') || /[\r\n\t]/.test(candidate)) return '/account';
  return candidate;
}
