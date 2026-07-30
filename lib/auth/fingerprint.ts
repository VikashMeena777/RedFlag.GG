import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';

/**
 * Device fingerprint for anonymous ballots.
 *
 * The loophole: clearing site data mints a fresh anonymous identity, which
 * defeats the `(case_id, voter_id)` unique constraint. So anonymous votes also
 * carry an HMAC of (IP + user-agent), and the DB has a partial unique index on
 * `(case_id, voter_fp)` for anonymous rows only.
 *
 * Privacy: this is a keyed one-way hash. The raw IP is never stored, never
 * logged, and cannot be recovered from the digest without the salt. Verified
 * users are exempt from fingerprint dedupe, because several housemates behind
 * one NAT are all legitimate voters.
 */
export function fingerprint(ip: string, userAgent: string): string {
  return createHmac('sha256', serverEnv.voteFingerprintSalt)
    .update(`${normalizeIp(ip)}|${userAgent.slice(0, 200)}`)
    .digest('hex');
}

/**
 * Client IP from proxy headers.
 *
 * Only the first hop of `x-forwarded-for` is trusted, since later entries are
 * client-controllable. Returns `'unknown'` when absent, which still produces a
 * stable fingerprint — a coarse bucket is better than skipping the check.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Strips an IPv6 zone/port suffix so the same device hashes consistently. */
function normalizeIp(ip: string): string {
  return ip.replace(/%.*$/, '').replace(/^\[|\]$/g, '').toLowerCase();
}

/**
 * Constant-time secret comparison for the cron endpoint.
 * Length is compared first because `timingSafeEqual` throws on a mismatch.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
