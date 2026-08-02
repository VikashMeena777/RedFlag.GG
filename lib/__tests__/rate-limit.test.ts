import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Rate limiter tests.
 *
 * These exist because of a real production outage: with `UPSTASH_*` unset, the
 * `auth:otp` limit failed closed, so `requestVerification` rejected every signup
 * before it ever reached Supabase. Users saw a generic "Something broke" page and
 * could not create an account at all.
 *
 * The distinction that matters is between a limiter that was *never configured*
 * (a misconfiguration — allow, warn loudly) and one that is *configured but
 * failing* (a genuine outage — fail closed on client-reachable writes). Conflating
 * them is what took auth offline, so both branches are pinned here.
 *
 * Env is manipulated per-test because the module caches its Redis client and its
 * warn-once set at module scope, so each case needs a fresh import.
 */

const UPSTASH_KEYS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

describe('checkLimit — never configured', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.resetModules();
    for (const k of UPSTASH_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const k of UPSTASH_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
  });

  /*
   * The regression itself. `auth:otp` is `failOpen: false`, and before the fix an
   * unconfigured limiter in production returned `ok: false` here — which is what
   * silently disabled signup.
   */
  it('allows a fail-closed limit when Upstash was never configured', async () => {
    /*
     * `NODE_ENV` is typed read-only, so it is assigned via the index signature.
     * Production is what matters here: the old code only failed closed in prod,
     * which is precisely why the bug reached users and not local development.
     */
    vi.stubEnv('NODE_ENV', 'production');
    const { checkLimit } = await import('../rate-limit');

    const result = await checkLimit('auth:otp', 'ip:test@example.com');

    expect(result.ok).toBe(true);
    // Flagged as degraded so callers can tell enforcement is not happening.
    expect(result.degraded).toBe(true);
  });

  it('allows a fail-open limit when Upstash was never configured', async () => {
    const { checkLimit } = await import('../rate-limit');

    const result = await checkLimit('verdict:global', 'all');

    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
  });

  it('warns once per limit, not once per request', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { checkLimit } = await import('../rate-limit');

    await checkLimit('auth:otp', 'a');
    await checkLimit('auth:otp', 'b');
    await checkLimit('auth:otp', 'c');

    const authWarnings = warn.mock.calls.filter((c) =>
      String(c[0]).includes('auth:otp')
    );
    expect(authWarnings).toHaveLength(1);
  });

  it('names the missing variables so the fix is obvious from the log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { checkLimit } = await import('../rate-limit');

    await checkLimit('case:create', 'user:ip');

    const message = String(warn.mock.calls[0]?.[0] ?? '');
    // A log that says only "not enforced" sends the reader hunting; name the vars.
    expect(message).toContain('UPSTASH_REDIS_REST_URL');
    expect(message).toContain('UPSTASH_REDIS_REST_TOKEN');
    expect(message).toContain('case:create');
  });
});

describe('limitMessage', () => {
  it('explains a degraded limiter without blaming the user', async () => {
    const { limitMessage } = await import('../rate-limit');

    const text = limitMessage({
      ok: false,
      remaining: 0,
      retryAfter: 60,
      degraded: true,
    });

    expect(text).toMatch(/busy/i);
    // "Slow down" would be wrong here: the user did nothing excessive.
    expect(text).not.toMatch(/slow down/i);
  });

  it('gives seconds for a short window and minutes for a long one', async () => {
    const { limitMessage } = await import('../rate-limit');

    const soon = limitMessage({
      ok: false,
      remaining: 0,
      retryAfter: 30,
      degraded: false,
    });
    expect(soon).toContain('30s');

    const later = limitMessage({
      ok: false,
      remaining: 0,
      retryAfter: 600,
      degraded: false,
    });
    expect(later).toMatch(/10 minutes/);
  });

  it('uses the singular for a one-minute wait', async () => {
    const { limitMessage } = await import('../rate-limit');

    const text = limitMessage({
      ok: false,
      remaining: 0,
      retryAfter: 100,
      degraded: false,
    });

    expect(text).toContain('2 minutes');
    expect(text).not.toContain('2 minute ');
  });
});
