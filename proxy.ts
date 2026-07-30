import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Next.js 16 renamed `middleware` to `proxy`. The edge runtime is not supported
 * here — `proxy` always runs on Node.js and that cannot be configured.
 *
 * Its only job is refreshing the Supabase auth cookie. No gating: see
 * lib/supabase/middleware.ts for why.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
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
