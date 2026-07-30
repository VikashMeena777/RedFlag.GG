import type { NextConfig } from 'next';

/** One year in seconds — the standard "immutable" cache window. */
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Static assets served from `/public`; safe to cache aggressively at the edge. */
const STATIC_ASSET_MATCHER =
  '/:all*(svg|jpg|jpeg|png|gif|webp|avif|ico|woff|woff2|ttf|otf)';

/**
 * Content Security Policy — defense-in-depth behind DOMPurify sanitization and
 * Postgres RLS.
 *
 * - `script-src` needs `'unsafe-inline'`/`'unsafe-eval'`: the App Router injects
 *   inline bootstrap scripts and React Refresh uses eval in development. A
 *   nonce-based policy requires per-request work in `proxy.ts` and is deferred.
 * - `connect-src` allows Supabase REST + the Realtime WebSocket, and Stripe for
 *   Checkout redirects.
 * - `frame-src` allows Stripe's hosted Checkout/portal frames.
 * - `frame-ancestors 'none'` mirrors `X-Frame-Options: DENY` — verdict cards are
 *   meant to be screenshotted, never iframed into someone else's site.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const nextConfig: NextConfig = {
  // This project lives inside a folder that also contains sibling projects and a
  // stray parent lockfile. Pin the root so Turbopack does not infer upward.
  turbopack: {
    root: __dirname,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: ONE_YEAR_SECONDS,
    remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
      {
        source: STATIC_ASSET_MATCHER,
        headers: [
          {
            key: 'Cache-Control',
            value: `public, max-age=${ONE_YEAR_SECONDS}, immutable`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
