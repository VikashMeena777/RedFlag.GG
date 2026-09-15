import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { serverEnv } from '@/lib/env';

/**
 * Rate limiting.
 *
 * Four distinct states, and conflating the first two caused a real outage:
 *
 *  1. **Upstash never configured** (no `UPSTASH_*` env vars) → fall back to the
 *     Postgres limiter (`public.consume_rate_limit`). Enforcement stays on with
 *     zero external services; only the latency of the check is worse.
 *  2. **No limiter at all** (Upstash unset AND the database fallback
 *     unavailable — migration not applied, env vars missing, database down) →
 *     allow, and warn once per limit. This is a misconfiguration, not an
 *     attack. Previously this case failed closed in production, which silently
 *     disabled signup: `auth:otp` rejected every request before it reached
 *     Supabase and the user got an error page.
 *  3. **Configured but failing** (Upstash network error, throw) → fail closed
 *     on client-reachable write paths, because an outage is exactly when an
 *     abuse wave is cheapest to run.
 *  4. **Working and over budget** → reject with a retry hint.
 *
 * Read-only paths (share cards) and trusted server-side work (`verdict:global`)
 * fail open in state 3 as well, since blocking them takes a feature offline
 * rather than merely slowing an attacker down.
 */

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;

  const url = serverEnv.upstashUrl;
  const token = serverEnv.upstashToken;

  // Validate before constructing — the Redis constructor throws on invalid URLs
  // and that throw happens outside checkLimit's try-catch.
  if (!url || !token || !url.startsWith('https')) {
    if (url && !url.startsWith('https')) {
      console.error(
        `[rate-limit] UPSTASH_REDIS_REST_URL is invalid (must start with https, got "${url.slice(0, 8)}…"). Falling back to the database limiter.`
      );
    }
    redis = null;
    return redis;
  }

  try {
    redis = new Redis({ url, token });
  } catch (err) {
    console.error('[rate-limit] Failed to create Redis client:', err);
    redis = null;
  }
  return redis;
}

export type LimitName =
  | 'case:create'
  | 'vote'
  | 'flag'
  | 'verdict:global'
  | 'card:download'
  | 'auth:otp'
  | 'checkout'
  | 'anon:mint'
  | 'sync:status'
  | 'account:delete';

interface LimitSpec {
  requests: number;
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`;
  /**
   * What to do when a *configured* Upstash limiter is unavailable.
   *
   * `false` (fail closed) for anything an untrusted client can trigger — an
   * outage is exactly when an abuse wave is cheapest to run.
   *
   * `true` (fail open) for limits that are cost/throughput smoothing on trusted
   * server-side work, where failing closed would take a *feature* offline rather
   * than merely slow it down.
   */
  failOpen: boolean;
}

const LIMITS: Record<LimitName, LimitSpec> = {
  'case:create': { requests: 3, window: '1 h', failOpen: false },
  vote: { requests: 40, window: '1 m', failOpen: false },
  flag: { requests: 10, window: '1 h', failOpen: false },
  /*
   * Fails OPEN, unlike the other write limits.
   *
   * This throttles the gavel's own AI calls; it is not abuse prevention, because
   * only the cron and the lazy on-read fallback ever reach it. Failing closed
   * meant that with no limiter available, every case returned `retry_later`
   * forever and no verdict was ever generated — the limiter silently disabled the
   * core feature. Provider cost is still bounded by `MAX_VERDICT_ATTEMPTS` and the
   * cron's own batch and time budget.
   */
  'verdict:global': { requests: 60, window: '1 m', failOpen: true },
  'card:download': { requests: 20, window: '1 m', failOpen: true },
  'auth:otp': { requests: 100, window: '1 m', failOpen: true },
  checkout: { requests: 10, window: '1 h', failOpen: false },
  /*
   * Anonymous juror sessions are minted on a visitor's first ballot. Keyed by IP
   * because every mint is a brand-new user id, so a per-user key is useless here.
   * Supabase applies its own 30-per-hour-per-IP anonymous-signup limit; this is
   * the app-side belt so a config change upstream cannot silently open the tap.
   */
  'anon:mint': { requests: 30, window: '1 h', failOpen: false },
  /*
   * The success page's confirmation poll. Fails open on purpose: a limiter
   * outage must not block payment confirmation, Cashfree rate-limits its own
   * API, and the bound (15 polls, client-driven) is what actually stops abuse —
   * this limit just keeps a hand-crafted loop honest.
   */
  'sync:status': { requests: 30, window: '1 m', failOpen: true },
  /*
   * Account deletion. Deliberately fails CLOSED (unlike the other write
   * limits' unconfigured-allow semantics, which this limiter no longer hits
   * thanks to the database fallback): when a limiter is unreachable, refusing
   * a destructive action is the right side to err on.
   */
  'account:delete': { requests: 5, window: '1 h', failOpen: false },
};

/** Window length in seconds, for the database fallback. */
const WINDOW_UNITS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

function windowSeconds(window: LimitSpec['window']): number {
  const [value, unit] = window.split(' ') as [
    string,
    keyof typeof WINDOW_UNITS,
  ];
  return Number(value) * WINDOW_UNITS[unit];
}

const limiters = new Map<LimitName, Ratelimit>();

/**
 * Tracks which limits have already warned, so a deployment without any limiter
 * logs once per limit instead of once per request.
 */
const warned = new Set<LimitName>();

function warnUnconfigured(name: LimitName): void {
  if (warned.has(name)) return;
  warned.add(name);

  const where = serverEnv.isProduction
    ? 'PRODUCTION — set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in your hosting environment'
    : 'set UPSTASH_* in .env.local to exercise real throttling';

  console.warn(
    `[rate-limit] Upstash not configured; "${name}" falls back to the database limiter, which is also unavailable (${where}).`
  );
}

function getLimiter(name: LimitName): Ratelimit | null {
  const client = getRedis();
  if (!client) return null;

  const cached = limiters.get(name);
  if (cached) return cached;

  const spec = LIMITS[name];
  const limiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(spec.requests, spec.window),
    prefix: `rfgg:${name}`,
    // Dampens duplicate hits within a single serverless invocation.
    ephemeralCache: new Map(),
    analytics: false,
  });
  limiters.set(name, limiter);
  return limiter;
}

export interface LimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets; useful for the retry message. */
  retryAfter: number;
  /** True when the limiter itself was unavailable. */
  degraded: boolean;
}

interface DbLimitRow {
  allowed: boolean;
  used: number;
  retry_after: number;
}

/**
 * Postgres fallback: one atomic `INSERT … ON CONFLICT` per check via the
 * service-role client. The row lock on the conflict path serialises concurrent
 * calls for the same key, so counts cannot be lost to a race.
 *
 * Returns null when the fallback itself is unavailable (missing migration, env
 * vars, or database) — the caller then treats it as a misconfiguration, not an
 * attack, per state 2 above.
 */
async function checkDbLimit(
  name: LimitName,
  identifier: string
): Promise<LimitResult | null> {
  const spec = LIMITS[name];
  try {
    // Dynamic import: constructing the service client requires env vars that
    // unit tests deliberately do not set, and it must not happen at module load.
    const { createServiceClient } = await import('@/lib/supabase/service');
    const admin = createServiceClient();
    const { data, error } = await admin.rpc('consume_rate_limit', {
      p_name: name,
      p_identifier: identifier,
      p_limit: spec.requests,
      p_window_seconds: windowSeconds(spec.window),
    });
    if (error) {
      console.error(
        `[rate-limit] database fallback for "${name}" failed:`,
        error.message
      );
      return null;
    }
    const row = (Array.isArray(data) ? data[0] : data) as DbLimitRow;
    if (!row || typeof row.allowed !== 'boolean') {
      console.error(
        `[rate-limit] database fallback for "${name}" returned no row.`
      );
      return null;
    }
    return {
      ok: row.allowed,
      remaining: Math.max(0, spec.requests - row.used),
      retryAfter: row.retry_after,
      degraded: false,
    };
  } catch (err) {
    console.error(`[rate-limit] database fallback for "${name}" crashed:`, err);
    return null;
  }
}

/**
 * Consumes one token for `identifier` against the named limit.
 *
 * `identifier` should be as specific as the abuse you're preventing: user id for
 * per-account limits, IP for anonymous ones, and both joined for filing.
 */
export async function checkLimit(
  name: LimitName,
  identifier: string
): Promise<LimitResult> {
  const spec = LIMITS[name];
  const limiter = getLimiter(name);

  /*
   * Upstash is not configured at all → the database limiter takes over. Only
   * when that is *also* unavailable does the request pass unenforced with a
   * loud warning — the distinction between "misconfigured" and "attacked" that
   * state 2 above exists to preserve.
   */
  if (!limiter) {
    const dbResult = await checkDbLimit(name, identifier);
    if (dbResult) return dbResult;
    warnUnconfigured(name);
    return { ok: true, remaining: 0, retryAfter: 0, degraded: true };
  }

  try {
    const { success, remaining, reset } = await limiter.limit(identifier);
    return {
      ok: success,
      remaining,
      retryAfter: Math.max(0, Math.ceil((reset - Date.now()) / 1000)),
      degraded: false,
    };
  } catch (error) {
    console.error(`[rate-limit] "${name}" check failed:`, error);
    return spec.failOpen
      ? { ok: true, remaining: 0, retryAfter: 0, degraded: true }
      : { ok: false, remaining: 0, retryAfter: 30, degraded: true };
  }
}

/** Human-readable rejection for a throttled write. */
export function limitMessage(result: LimitResult): string {
  if (result.degraded) {
    return 'Court systems are busy right now. Try again in a moment.';
  }
  const mins = Math.ceil(result.retryAfter / 60);
  return result.retryAfter > 90
    ? `Slow down. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`
    : `Slow down. Try again in ${result.retryAfter}s.`;
}
