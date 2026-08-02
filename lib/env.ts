/**
 * Server-side environment access.
 *
 * Every secret is read through a helper that throws a clear, named error when
 * missing, rather than letting `undefined` propagate into an SDK and surface as
 * a confusing 401 at runtime. Import these only from server code.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : undefined;
}

export const serverEnv = {
  get supabaseUrl() {
    return required('NEXT_PUBLIC_SUPABASE_URL');
  },
  get supabaseAnonKey() {
    return required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  },
  get supabaseServiceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  get groqApiKey() {
    return optional('GROQ_API_KEY');
  },
  /** NVIDIA NIM — OpenAI-compatible fallback provider. */
  get nvidiaApiKey() {
    return optional('NVIDIA_API_KEY');
  },

  /*
   * There is deliberately no `emailSendsCode` here.
   *
   * It existed to tell the UI whether the Supabase email template contained
   * `{{ .Token }}` (a code) or `{{ .ConfirmationURL }}` (a link). Verification is
   * now magic-link only, which works with the stock template, so the flag and the
   * class of "app looks broken because the email disagrees with the UI" bug it
   * papered over are both gone.
   */

  /** Cashfree Payment Gateway. */
  get cashfreeEnv() {
    return optional('CASHFREE_ENV') || 'sandbox';
  },
  get cashfreeAppId() {
    return required('CASHFREE_APP_ID');
  },
  get cashfreeSecretKey() {
    return required('CASHFREE_SECRET_KEY');
  },
  get upstashUrl() {
    return optional('UPSTASH_REDIS_REST_URL');
  },
  get upstashToken() {
    return optional('UPSTASH_REDIS_REST_TOKEN');
  },
  get voteFingerprintSalt() {
    return required('VOTE_FP_SALT');
  },
  get cronSecret() {
    return optional('CRON_SECRET');
  },
  // Cashfree accessors are declared above, next to the other provider keys.
  get siteUrl() {
    return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  },
  /*
   * There is deliberately no `adminUserIds` here.
   *
   * Admin access is `profiles.is_admin`, a database flag read by `getViewer()`.
   * The former `ADMIN_USER_IDS` env allowlist was removed because granting admin
   * then required a redeploy, and the two sources could disagree about who is an
   * admin — which is the worst possible ambiguity for a privileged check.
   */
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },
} as const;
