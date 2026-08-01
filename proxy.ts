import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { buildContentSecurityPolicy, HSTS_VALUE } from '@/lib/security-headers';

/**
 * Next.js 16 renamed `middleware` to `proxy`. The edge runtime is not supported
 * here — `proxy` always runs on Node.js and that cannot be configured.
 *
 * Two jobs:
 *  1. Refresh the Supabase auth cookie (see lib/supabase/middleware.ts).
 *  2. Apply the TLS-only security headers, which `next.config.ts` cannot decide
 *     because `headers()` is evaluated at build time.
 */
export async function proxy(request: NextRequest) {
  const response = await updateSession(request);

  if (isSecureRequest(request)) {
    // Overwrites the baseline policy from next.config.ts with the TLS variant.
    response.headers.set(
      'Content-Security-Policy',
      buildContentSecurityPolicy({ secure: true })
    );
    response.headers.set('Strict-Transport-Security', HSTS_VALUE);
  }

  return response;
}

/**
 * Whether this request genuinely arrived over TLS.
 *
 * `x-forwarded-proto` is the signal every mainstream proxy sets (Vercel,
 * Cloudflare, nginx), and only the first hop is trusted — later entries are
 * attacker-appendable. `request.nextUrl.protocol` is the fallback for a direct
 * connection with no proxy in front.
 *
 * Getting this wrong in the permissive direction is the dangerous case: claiming
 * HTTPS on a plain-HTTP request emits HSTS, which pins the browser to HTTPS for
 * two years. So anything ambiguous is treated as insecure.
 */
function isSecureRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase();

  if (forwardedProto) return forwardedProto === 'https';

  return request.nextUrl.protocol === 'https:';
}

export const config = {
  matcher: [
    /*
     * Skip static assets, image optimization, and the share-card routes.
     * Share cards are public, cacheable, and must not pay for a session
     * refresh on every social-crawler hit.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/card|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|ttf|woff2?)$).*)',
  ],
};
