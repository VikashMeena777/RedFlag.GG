/**
 * Public environment values, safe to import from Client Components.
 *
 * Only `NEXT_PUBLIC_*` variables belong here. Anything secret goes in
 * lib/env.ts, which must never be imported into client code.
 */

function requiredPublic(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required public environment variable: ${name}. See .env.example.`
    );
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return requiredPublic(
      'NEXT_PUBLIC_SUPABASE_URL',
      process.env.NEXT_PUBLIC_SUPABASE_URL
    );
  },
  get supabaseAnonKey() {
    return requiredPublic(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  },
  get siteUrl() {
    const raw =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.NEXT_PUBLIC_VERCEL_URL
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        : undefined) ||
      'http://localhost:3000';
    return raw.replace(/\/+$/, '');
  },
  /*
   * There is deliberately no cashfreeMode here.
   *
   * The browser checkout SDK needs to know sandbox vs production, but the
   * server already knows — so the server component that renders the button
   * passes the mode as a prop. One env var (CASHFREE_ENV, server-side), no
   * NEXT_PUBLIC duplicate that can drift out of sync and silently break
   * checkout.
   */
} as const;
