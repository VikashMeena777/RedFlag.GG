import type { NextConfig } from 'next';
import { buildContentSecurityPolicy } from './lib/security-headers';

/** One year in seconds — the standard "immutable" cache window. */
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Static assets served from `/public`; safe to cache aggressively at the edge. */
const STATIC_ASSET_MATCHER =
  '/:all*(svg|jpg|jpeg|png|gif|webp|avif|ico|woff|woff2|ttf|otf)';

/**
 * Baseline CSP, without the TLS-only directives.
 *
 * `headers()` runs at **build** time and its output is frozen into
 * `routes-manifest.json`, so it cannot know whether a given request will arrive
 * over HTTPS. `upgrade-insecure-requests` and HSTS are therefore added
 * per-request in `proxy.ts`, which overwrites this header when the connection is
 * genuinely secure. See lib/security-headers.ts for the full reasoning.
 */
const CONTENT_SECURITY_POLICY = buildContentSecurityPolicy({ secure: false });

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
