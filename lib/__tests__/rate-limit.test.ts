import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Rate limiter tests.
 *
 * These exist because of a real production outage: with `UPSTASH_*` unset and
 * no fallback, the `auth:otp` limit failed closed, so `requestVerification`
 * rejected every signup before it ever reached Supabase. Users saw a generic
 * "Something broke" page and could not create an account at all.
 *
 * The distinctions that matter:
 *
 *  - Upstash never configured → the Postgres fallback enforces the limit.
 *  - No limiter at all (Upstash unset AND fallback unavailable — missing env
 *    vars, migration not applied) → a *misconfiguration*: allow, warn loudly.
 *  - Upstash configured but failing → a genuine outage: fail closed on
 *    client-reachable writes.
 *
 * Conflating the last two is what took auth offline, so every branch is pinned
 * here.
 *
 * Env is manipulated per-test because the module caches its Redis client and its
 * warn-once set at module scope, so each case needs a fresh import.
 */

const UPSTASH_KEYS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

/*
 * checkLimit dynamically imports the service client for the Postgres fallback.
 * Mocking it keeps these tests free of Supabase env vars and makes the fallback
 * contract (the RPC's return shape) explicit.
 */
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ rpc: rpcMock }),
}));

/** Standard reset: no Upstash, fresh module. The rpc mock is NOT touched here —
 *  tests configure it before calling this, and resetting it would wipe their setup. */
async function freshLimiter() {
  vi.resetModules();
  return await import('../rate-limit');
}

describe('checkLimit — no limiter at all (Upstash unset, fallback unavailable)', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of UPSTASH_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // By default the mocked RPC returns nothing, i.e. the fallback is down.
    rpcMock.mockReset();
    rpcMock.mockReturnValue(undefined);
  });

  afterEach(() => {
    for (const k of UPSTASH_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  /*
   * The regression itself. `auth:otp` is `failOpen: false`, and before the fix
   * an unconfigured limiter in production returned `ok: false` here — which is
   * what silently disabled signup.
   */
  it('allows a fail-closed limit when no limiter is available', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { checkLimit } = await freshLimiter();

    const result = await checkLimit('auth:otp', 'ip:test@example.com');

    expect(result.ok).toBe(true);
    // Flagged as degraded so callers can tell enforcement is not happening.
    expect(result.degraded).toBe(true);
  });

  it('allows a fail-open limit when no limiter is available', async () => {
    const { checkLimit } = await freshLimiter();

    const result = await checkLimit('verdict:global', 'all');

    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
  });

  it('allows when the fallback RPC itself throws (missing migration, bad env)', async () => {
    rpcMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const { checkLimit } = await freshLimiter();

    const result = await checkLimit('vote', 'user-1');

    // Misconfiguration, not attack: allow and warn rather than fail closed.
    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
  });

  it('warns once per limit, not once per request', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { checkLimit } = await freshLimiter();

    await checkLimit('auth:otp', 'a');
    await checkLimit('auth:otp', 'b');
    await checkLimit('auth:otp', 'c');

    const authWarnings = warn.mock.calls.filter((c) =>
      String(c[0]).includes('auth:otp')
    );
    expect(authWarnings).toHaveLength(1);
  });

  it('names the missing variables so the fix is obvious from the log', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { checkLimit } = await freshLimiter();

    await checkLimit('case:create', 'user:ip');

    const message = String(warn.mock.calls[0]?.[0] ?? '');
    // A log that says only "not enforced" sends the reader hunting; name the vars.
    expect(message).toContain('UPSTASH_REDIS_REST_URL');
    expect(message).toContain('UPSTASH_REDIS_REST_TOKEN');
    expect(message).toContain('case:create');
  });
});

describe('checkLimit — Postgres fallback (Upstash unconfigured)', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of UPSTASH_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    rpcMock.mockReset();
  });

  afterEach(() => {
    for (const k of UPSTASH_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
    rpcMock.mockReset();
  });

  it('enforces the limit through the fallback and is not degraded', async () => {
    rpcMock.mockResolvedValue({
      data: [{ allowed: true, used: 1, retry_after: 0 }],
      error: null,
    });
    const { checkLimit } = await freshLimiter();

    const result = await checkLimit('vote', 'user-1');

    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(false);
    // vote allows 40/min; one used leaves 39.
    expect(result.remaining).toBe(39);
    // The fallback received the spec's numbers, not arbitrary ones.
    expect(rpcMock).toHaveBeenCalledWith(
      'consume_rate_limit',
      expect.objectContaining({
        p_name: 'vote',
        p_identifier: 'user-1',
        p_limit: 40,
        p_window_seconds: 60,
      })
    );
  });

  it('rejects at the boundary with the window the database reported', async () => {
    rpcMock.mockResolvedValue({
      data: [{ allowed: false, used: 40, retry_after: 47 }],
      error: null,
    });
    const { checkLimit } = await freshLimiter();

    const result = await checkLimit('vote', 'user-1');

    expect(result.ok).toBe(false);
    expect(result.degraded).toBe(false);
    expect(result.retryAfter).toBe(47);
    expect(result.remaining).toBe(0);
  });

  it('accepts the row as an object too (supabase-js shapes vary by return type)', async () => {
    rpcMock.mockResolvedValue({
      data: { allowed: true, used: 5, retry_after: 0 },
      error: null,
    });
    const { checkLimit } = await freshLimiter();

    const result = await checkLimit('case:create', 'user-2');

    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(0); // 3 allowed, 5 used → clamped at 0.
  });

  it('treats an RPC error as "fallback unavailable", not as a rejection', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'function public.consume_rate_limit does not exist' },
    });
    const { checkLimit } = await freshLimiter();

    const result = await checkLimit('vote', 'user-1');

    // A missing migration is a misconfiguration: allow and warn loudly.
    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
  });
});

describe('checkLimit — Upstash configured', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('fails closed on a fail-closed limit when Upstash throws', async () => {
    // A syntactically valid URL + token so the client is constructed, then a
    // network failure at limit() time — the genuine outage case.
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');

    vi.doMock('@upstash/ratelimit', () => ({
      Ratelimit: class {
        constructor() {}
        limit() {
          return Promise.reject(new Error('network down'));
        }
        static slidingWindow() {
          return {};
        }
      },
    }));

    const { checkLimit } = await freshLimiter();
    const result = await checkLimit('vote', 'user-1');

    expect(result.ok).toBe(false);
    expect(result.degraded).toBe(true);
  });
});

describe('limitMessage', () => {
  it('explains a degraded limiter without blaming the user', async () => {
    const { limitMessage } = await freshLimiter();

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
    const { limitMessage } = await freshLimiter();

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
    const { limitMessage } = await freshLimiter();

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
