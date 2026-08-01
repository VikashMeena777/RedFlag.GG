/**
 * Security headers, shared between the build-time config and the runtime proxy.
 *
 * The split is not stylistic. `headers()` in `next.config.ts` runs at **build**
 * time and its output is frozen into `.next/routes-manifest.json`, so any header
 * that depends on how the app is actually being *served* — HTTPS or plain HTTP —
 * cannot be decided there. Those two are applied per-request in `proxy.ts`.
 *
 * Why it matters: with `NEXT_PUBLIC_SITE_URL` pointing at the deployed https
 * domain, a build made on a laptop bakes `upgrade-insecure-requests` into every
 * response. WebKit then honours that on `http://localhost` (Chromium exempts
 * localhost), rewriting every asset to `https://localhost:3000` where nothing is
 * listening — the page renders with no CSS and no fonts. Deciding at request time
 * means the headers describe reality instead of a guess.
 */

/**
 * Directives safe to freeze at build time.
 *
 * - `script-src` needs `'unsafe-inline'`/`'unsafe-eval'`: the App Router injects
 *   inline bootstrap scripts and React Refresh uses eval in development. A
 *   nonce-based policy requires per-request work and is deferred.
 * - `connect-src` allows Supabase REST + the Realtime WebSocket, and Cashfree for
 *   the checkout SDK's own API calls.
 * - `sdk.cashfree.com` serves the Drop-in checkout script; `payments.cashfree.com`
 *   and the sandbox host serve the hosted payment frames.
 * - `frame-ancestors 'none'` mirrors `X-Frame-Options: DENY` — verdict cards are
 *   meant to be screenshotted, never iframed into someone else's site.
 */
export const CSP_BASE_DIRECTIVES: readonly string[] = [
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
];

/**
 * Builds the policy. `upgrade-insecure-requests` is appended only for a request
 * genuinely arriving over TLS, because on plain HTTP it makes the page
 * unloadable rather than merely unenforced.
 */
export function buildContentSecurityPolicy(options: { secure: boolean }): string {
  return [
    ...CSP_BASE_DIRECTIVES,
    ...(options.secure ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

/**
 * Two years, subdomains included, preload-eligible.
 *
 * Sent only over TLS. Emitting it on plain HTTP would teach the browser to force
 * HTTPS on `localhost:3000` for two years, breaking every other local project
 * that ever uses that port — a genuinely hard mistake to undo.
 */
export const HSTS_VALUE = 'max-age=63072000; includeSubDomains; preload';
