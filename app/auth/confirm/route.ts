import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/lib/public-env';

/**
 * Magic-link / email-confirmation landing route.
 *
 * Handles PKCE exchange (`code` query param), direct OTP token verification
 * (`token_hash` / `token` and `type` params), or any fallback auth parameter.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash') || searchParams.get('token');
  const type = (searchParams.get('type') as EmailOtpType | null) || 'email';
  const next = safeNext(searchParams.get('next'));

  const supabase = await createClient();

  // 1. Try PKCE code exchange first (Standard Next.js @supabase/ssr flow)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${env.siteUrl}${next}?verified=1`);
    }
    console.error('[auth] PKCE code exchange failed in confirm route:', error.message);
  }

  // 2. Try OTP token / token_hash verification
  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) {
      return NextResponse.redirect(`${env.siteUrl}${next}?verified=1`);
    }
    console.error('[auth] token_hash verification failed:', error.message);
    return NextResponse.redirect(`${env.siteUrl}/account?error=link_expired`);
  }

  // 3. Fallback if neither parameter worked
  if (!code && !tokenHash) {
    console.error('[auth] confirm route missing code and token_hash. params:', Array.from(searchParams.entries()));
    return NextResponse.redirect(`${env.siteUrl}/account?error=invalid_link`);
  }

  return NextResponse.redirect(`${env.siteUrl}/account?error=verify_failed`);
}

/**
 * Only same-origin relative paths.
 */
function safeNext(candidate: string | null): string {
  if (!candidate || !candidate.startsWith('/')) return '/account';
  if (candidate.startsWith('//') || /[\r\n\t]/.test(candidate)) return '/account';
  return candidate;
}
