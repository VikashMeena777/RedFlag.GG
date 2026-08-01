import type { NextConfig } from 'next';

/** One year in seconds — the standard "immutable" cache window. */
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Static assets served from `/public`; safe to cache aggressively at the edge. */
const STATIC_ASSET_MATCHER =
  '/:all*(svg|jpg|jpeg|png|gif|webp|avif|ico|woff|woff2|ttf|otf)';

/**
 * Whether this deployment is actually served over HTTPS.
 *
 * Deliberately NOT `NODE_ENV === 'production'`: `next start` sets that even for a
 * local HTTP run, so keying TLS-only headers off it would still break localhost.
 * The reliable signal is the site's own origin — set `NEXT_PUBLIC_SITE_URL` to an
 * `https://` URL in deployment and these headers switch on.
 */
const IS_HTTPS_DEPLOYMENT = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
).startsWith('https://');

/**
 * Content Security Policy — defense-in-depth behind DOMPurify sanitization and
 * Postgres RLS.
 *
 * - `script-src` needs `'unsafe-inline'`/`'unsafe-eval'`: the App Router injects
 *   inline bootstrap scripts and React Refresh uses eval in development. A
 *   nonce-based policy requires per-request work in `proxy.ts` and is deferred.
 * - `connect-src` allows Supabase REST + the Realtime WebSocket, and Cashfree
 *   for the checkout SDK's own API calls.
 * - `sdk.cashfree.com` serves the Drop-in checkout script; `payments.cashfree.com`
 *   and the sandbox host serve the hosted payment frames.
 * - `frame-ancestors 'none'` mirrors `X-Frame-Options: DENY` — verdict cards are
 *   meant to be screenshotted, never iframed into someone else's site.
 *
 * `upgrade-insecure-requests` is applied **only on an HTTPS deployment**, and
 * that is not a convenience: Safari/WebKit honours it on `http://localhost`
 * (Chromium exempts localhost), rewriting every asset to `https://localhost:3000`
 * where there is no TLS listener. The result is a page with no CSS and no fonts —
 * which is exactly how this was found, via a WebKit e2e run.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.cashfree.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://*.supabase.co https://*.cashfree.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.cashfree.com https://sandbox.cashfree.com https://sdk.cashfree.com",
  "frame-src https://sdk.cashfree.com https://payments.cashfree.com https://payments-test.cashfree.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self' https://payments.cashfree.com https://payments-test.cashfree.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  ...(IS_HTTPS_DEPLOYMENT ? ['upgrade-insecure-requests'] : []),
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
          /*
           * HSTS is sent only on an HTTPS deployment, for the same reason as
           * `upgrade-insecure-requests`: sending it over plain HTTP on localhost
           * teaches the browser to force HTTPS on `localhost:3000` for two years,
           * which then breaks every other local project on that port.
           */
          ...(IS_HTTPS_DEPLOYMENT
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
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
