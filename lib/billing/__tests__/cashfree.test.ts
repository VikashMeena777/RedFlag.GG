import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';

/**
 * Cashfree webhook signature verification.
 *
 * This is the boundary that decides whether an unauthenticated HTTP request can
 * grant a paid tier, so it gets tested harder than anything else in the billing
 * path. The secret is stubbed via the env module.
 */

const SECRET = 'test-cashfree-secret-key';

vi.mock('@/lib/env', () => ({
  serverEnv: {
    get cashfreeSecretKey() {
      return SECRET;
    },
    get cashfreeAppId() {
      return 'TEST_APP_ID';
    },
    get cashfreeEnv() {
      return 'sandbox';
    },
  },
}));

const { verifyWebhookSignature } = await import('../cashfree');

/** Produces a signature the same way Cashfree does. */
function sign(timestamp: string, body: string, secret = SECRET): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}${body}`)
    .digest('base64');
}

const BODY = JSON.stringify({
  type: 'SUBSCRIPTION_STATUS_CHANGE_ACTIVE',
  data: { subscription_details: { subscription_id: 'rfgg_abc_123' } },
});

describe('verifyWebhookSignature', () => {
  let now: string;

  beforeEach(() => {
    now = String(Math.floor(Date.now() / 1000));
  });

  it('accepts a correctly signed payload', () => {
    expect(verifyWebhookSignature(sign(now, BODY), BODY, now)).toBe(true);
  });

  it('rejects a payload signed with the wrong secret', () => {
    const forged = sign(now, BODY, 'attacker-secret');
    expect(verifyWebhookSignature(forged, BODY, now)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const signature = sign(now, BODY);
    const tampered = BODY.replace('rfgg_abc_123', 'rfgg_victim_999');
    expect(verifyWebhookSignature(signature, tampered, now)).toBe(false);
  });

  it('rejects a mismatched timestamp', () => {
    // Signature is bound to the timestamp, so replaying with a different one
    // must fail even though the body is untouched.
    const signature = sign(now, BODY);
    const other = String(Number(now) - 30);
    expect(verifyWebhookSignature(signature, other + '', now)).toBe(false);
    expect(verifyWebhookSignature(signature, BODY, other)).toBe(false);
  });

  it('rejects a missing signature or timestamp', () => {
    expect(verifyWebhookSignature(null, BODY, now)).toBe(false);
    expect(verifyWebhookSignature(sign(now, BODY), BODY, null)).toBe(false);
    expect(verifyWebhookSignature('', BODY, now)).toBe(false);
  });

  it('rejects a stale delivery beyond the replay window', () => {
    // A captured webhook should not stay replayable indefinitely.
    const twoHoursAgo = String(Math.floor(Date.now() / 1000) - 2 * 60 * 60);
    expect(
      verifyWebhookSignature(sign(twoHoursAgo, BODY), BODY, twoHoursAgo)
    ).toBe(false);
  });

  it('accepts a delivery inside the replay window', () => {
    const fiveMinAgo = String(Math.floor(Date.now() / 1000) - 5 * 60);
    expect(
      verifyWebhookSignature(sign(fiveMinAgo, BODY), BODY, fiveMinAgo)
    ).toBe(true);
  });

  it('tolerates millisecond timestamps', () => {
    // Cashfree documents epoch seconds; be defensive about milliseconds.
    const ms = String(Date.now());
    expect(verifyWebhookSignature(sign(ms, BODY), BODY, ms)).toBe(true);
  });

  it('rejects a signature of a different length without throwing', () => {
    // timingSafeEqual throws on length mismatch; the guard must catch that.
    expect(() => verifyWebhookSignature('short', BODY, now)).not.toThrow();
    expect(verifyWebhookSignature('short', BODY, now)).toBe(false);
  });

  it('is sensitive to whitespace, which is why raw body matters', () => {
    // Re-stringifying parsed JSON changes bytes and must invalidate the HMAC.
    const signature = sign(now, BODY);
    const reserialised = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(verifyWebhookSignature(signature, reserialised, now)).toBe(false);
  });

  it('rejects an empty body signed against a different one', () => {
    expect(verifyWebhookSignature(sign(now, BODY), '', now)).toBe(false);
  });

  it('handles a non-numeric timestamp without throwing', () => {
    // Skips the staleness check but still fails the HMAC comparison.
    expect(() => verifyWebhookSignature('abc', BODY, 'not-a-number')).not.toThrow();
    expect(verifyWebhookSignature('abc', BODY, 'not-a-number')).toBe(false);
  });

  it('accepts a valid signature when the timestamp is non-numeric', () => {
    // Staleness cannot be judged, so verification falls back to the HMAC alone.
    const ts = 'not-a-number';
    expect(verifyWebhookSignature(sign(ts, BODY), BODY, ts)).toBe(true);
  });
});
