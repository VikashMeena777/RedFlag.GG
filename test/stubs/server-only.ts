/**
 * Test stub for Next.js's `server-only` package.
 *
 * The real module throws at build time if a server module is pulled into a
 * client bundle. That guard is valuable in the app but meaningless under Vitest,
 * which has no client/server split — so the alias in vitest.config.mts points
 * here and the import becomes a no-op.
 *
 * Note this does not weaken the production guard: `next build` still resolves the
 * real package.
 */
export {};
