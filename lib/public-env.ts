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
    return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  },
  /**
   * Cashfree environment, needed by the browser SDK to pick sandbox vs production.
   * Not a secret — the app id and secret stay server-side.
   */
  get cashfreeMode(): 'sandbox' | 'production' {
    return process.env.NEXT_PUBLIC_CASHFREE_ENV === 'production'
      ? 'production'
      : 'sandbox';
  },
} as const;
