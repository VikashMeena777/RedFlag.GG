import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { serverEnv } from '@/lib/env';

/**
 * Rate limiting.
 *
 * Deliberately **fails closed** on write paths. If Upstash is unreachable we
 * reject the write rather than waving it through, because an outage is exactly
 * when an abuse wave is cheapest to run. Read-only paths (share cards) fail
 * open, since blocking them only breaks link previews.
 */

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;

  const url = serverEnv.upstashUrl;
  const token = serverEnv.upstashToken;
  redis = url && token ? new Redis({ url, token }) : null;
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
  /** Reads may proceed when the limiter is unavailable; writes may not. */
  failOpen: boolean;
}

const LIMITS: Record<LimitName, LimitSpec> = {
  'case:create': { requests: 3, window: '1 h', failOpen: false },
  vote: { requests: 40, window: '1 m', failOpen: false },
  flag: { requests: 10, window: '1 h', failOpen: false },
  'verdict:global': { requests: 60, window: '1 m', failOpen: false },
  'card:download': { requests: 20, window: '1 m', failOpen: true },
  'auth:otp': { requests: 5, window: '15 m', failOpen: false },
  checkout: { requests: 10, window: '1 h', failOpen: false },
};

const limiters = new Map<LimitName, Ratelimit>();

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

  if (!limiter) {
    if (spec.failOpen) {
      return { ok: true, remaining: 0, retryAfter: 0, degraded: true };
    }
    if (!serverEnv.isProduction) {
      // Local dev without Upstash: allow, but make the gap obvious.
      console.warn(
        `[rate-limit] Upstash not configured; "${name}" not enforced. Set UPSTASH_* in .env.local.`
      );
      return { ok: true, remaining: 0, retryAfter: 0, degraded: true };
    }
    return { ok: false, remaining: 0, retryAfter: 60, degraded: true };
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
