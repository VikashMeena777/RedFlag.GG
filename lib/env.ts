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
  get geminiApiKey() {
    return optional('GEMINI_API_KEY');
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
  get stripeSecretKey() {
    return required('STRIPE_SECRET_KEY');
  },
  get stripeWebhookSecret() {
    return required('STRIPE_WEBHOOK_SECRET');
  },
  get stripePlusPriceId() {
    return required('STRIPE_PLUS_PRICE_ID');
  },
  get siteUrl() {
    return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  },
  /** Admin allowlist. Empty array means nobody has admin access. */
  get adminUserIds(): string[] {
    return (process.env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },
} as const;
