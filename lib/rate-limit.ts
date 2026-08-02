import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { serverEnv } from '@/lib/env';

/**
 * Rate limiting.
 *
 * Three distinct states, and conflating the first two caused a real outage:
 *
 *  1. **Never configured** (no `UPSTASH_*` env vars) → allow, and warn once per
 *     limit. This is a misconfiguration, not an attack. Previously this failed
 *     closed in production, which silently disabled signup: `auth:otp` rejected
 *     every request before it reached Supabase and the user got an error page.
 *  2. **Configured but failing** (network error, throw) → fail closed on
 *     client-reachable write paths, because an outage is exactly when an abuse
 *     wave is cheapest to run. This is the case the fail-closed rule is *for*.
 *  3. **Working and over budget** → reject with a retry hint.
 *
 * Read-only paths (share cards) and trusted server-side work (`verdict:global`)
 * fail open in state 2 as well, since blocking them takes a feature offline
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
        `[rate-limit] UPSTASH_REDIS_REST_URL is invalid (must start with https, got "${url.slice(0, 8)}…"). Rate limiting disabled.`
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
  | 'checkout';

interface LimitSpec {
  requests: number;
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`;
  /**
   * What to do when the limiter itself is unavailable.
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
   * meant that with Upstash unconfigured, every case returned `retry_later`
   * forever and no verdict was ever generated — the limiter silently disabled the
   * core feature. Provider cost is still bounded by `MAX_VERDICT_ATTEMPTS` and the
   * cron's own batch and time budget.
   */
  'verdict:global': { requests: 60, window: '1 m', failOpen: true },
  'card:download': { requests: 20, window: '1 m', failOpen: true },
  'auth:otp': { requests: 5, window: '15 m', failOpen: false },
  checkout: { requests: 10, window: '1 h', failOpen: false },
};

const limiters = new Map<LimitName, Ratelimit>();

/**
 * Tracks which limits have already warned, so an unconfigured deployment logs
 * once per limit instead of once per request.
 */
const warned = new Set<LimitName>();

function warnUnconfigured(name: LimitName): void {
  if (warned.has(name)) return;
  warned.add(name);

  const where = serverEnv.isProduction
    ? 'PRODUCTION — set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in your hosting environment'
    : 'set UPSTASH_* in .env.local to exercise real throttling';

  console.warn(
    `[rate-limit] Upstash not configured; "${name}" is NOT enforced (${where}).`
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
  const limiter = getLimiter(name);
  const spec = LIMITS[name];

  /*
   * Upstash is not configured at all.
   *
   * This is a *misconfiguration*, not an attack, and the two cases must be
   * distinguished. Treating "no limiter exists" the same as "the limiter said no"
   * meant that deploying without UPSTASH_* silently disabled signup entirely:
   * `auth:otp` fails closed, so `requestVerification` rejected every request
   * before it ever reached Supabase, and the user saw a generic error page.
   *
   * A never-configured limiter therefore allows the request and logs loudly.
   * Deliberate fail-closed behaviour is preserved for the case that actually
   * matters — a configured limiter that is failing or throwing (see the catch
   * below), which is the real "outage during an abuse wave" scenario.
   */
  if (!limiter) {
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
