import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';

/**
 * Cashfree Payment Gateway client.
 *
 * Deliberately hand-rolled over `fetch` rather than pulling in `cashfree-pg`:
 * we use exactly two endpoints, the SDK is CommonJS-first and awkward in a
 * Next.js server bundle, and the webhook signature scheme is four lines of
 * crypto. Fewer moving parts in the payment path is worth more than convenience.
 *
 * API: https://www.cashfree.com/docs/api-reference/payments/latest
 */

const API_VERSION = '2025-01-01';

function baseUrl(): string {
  return serverEnv.cashfreeEnv === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
}

function authHeaders(idempotencyKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-version': API_VERSION,
    'x-client-id': serverEnv.cashfreeAppId,
    'x-client-secret': serverEnv.cashfreeSecretKey,
  };
  // Cashfree replays the original response for a repeated key, which makes a
  // retried create safe rather than duplicating a subscription.
  if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;
  return headers;
}

export interface CashfreeError {
  message: string;
  code?: string;
  type?: string;
}

export class CashfreeApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, body: CashfreeError) {
    super(body.message || `Cashfree request failed (${status})`);
    this.name = 'CashfreeApiError';
    this.status = status;
    this.code = body.code;
  }
}

async function request<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string }
): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    method: init.method,
    headers: authHeaders(init.idempotencyKey),
    body: init.body ? JSON.stringify(init.body) : undefined,
    // Billing calls must never be served from a cache.
    cache: 'no-store',
  });

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new CashfreeApiError(response.status, {
      message: 'Cashfree returned a non-JSON response',
    });
  }

  if (!response.ok) {
    throw new CashfreeApiError(response.status, parsed as CashfreeError);
  }

  return parsed as T;
}

// ── Subscriptions ─────────────────────────────────────────────────────────

export interface CreateSubscriptionInput {
  /** Our own reference; Cashfree treats this as the subscription's primary id. */
  subscriptionRef: string;
  customerEmail: string;
  customerPhone: string;
  customerName?: string;
  returnUrl: string;
  /** Monthly price in INR (major units). */
  amount: number;
  planName: string;
  /** Cap on total debits before the subscription auto-completes. */
  maxCycles: number;
}

export interface SubscriptionEntity {
  cf_subscription_id: string;
  subscription_id: string;
  subscription_status: string;
  subscription_session_id?: string;
  next_schedule_date?: string | null;
  plan_details?: {
    plan_recurring_amount?: number;
    plan_max_cycles?: number;
  };
}

/**
 * Creates a PERIODIC monthly subscription.
 *
 * Returns a `subscription_session_id`, which the browser hands to Cashfree's
 * hosted checkout. Note that nothing here grants the tier — that only happens
 * in the webhook after signature verification.
 */
export async function createSubscription(
  input: CreateSubscriptionInput
): Promise<SubscriptionEntity> {
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 10);

  return request<SubscriptionEntity>('/subscriptions', {
    method: 'POST',
    // Keyed on our reference so a double-submit cannot create two subscriptions.
    idempotencyKey: input.subscriptionRef,
    body: {
      subscription_id: input.subscriptionRef,
      customer_details: {
        customer_name: input.customerName || 'RedFlag Juror',
        customer_email: input.customerEmail,
        customer_phone: input.customerPhone,
      },
      plan_details: {
        plan_name: input.planName,
        plan_type: 'PERIODIC',
        plan_currency: 'INR',
        plan_amount: input.amount,
        plan_max_amount: input.amount,
        plan_max_cycles: input.maxCycles,
        plan_intervals: 1,
        plan_interval_type: 'MONTH',
        plan_note: 'RedFlag+ monthly membership',
      },
      authorization_details: {
        // ₹1 auth, refunded automatically — standard UPI mandate setup.
        authorization_amount: 1,
        authorization_amount_refund: true,
        payment_methods: ['upi', 'card', 'enach'],
      },
      subscription_meta: {
        return_url: input.returnUrl,
        notification_channel: ['EMAIL'],
      },
      subscription_expiry_time: expiry.toISOString(),
    },
  });
}

export async function getSubscription(
  subscriptionRef: string
): Promise<SubscriptionEntity> {
  return request<SubscriptionEntity>(
    `/subscriptions/${encodeURIComponent(subscriptionRef)}`,
    { method: 'GET' }
  );
}

/** Cancels a subscription. Cashfree stops all future debits. */
export async function cancelSubscription(
  subscriptionRef: string
): Promise<SubscriptionEntity> {
  return request<SubscriptionEntity>(
    `/subscriptions/${encodeURIComponent(subscriptionRef)}/manage`,
    {
      method: 'POST',
      body: { action: 'CANCEL' },
    }
  );
}

// ── Webhook signature ─────────────────────────────────────────────────────

/**
 * Verifies a Cashfree webhook.
 *
 * Scheme (from Cashfree's docs):
 *   signature = base64( HMAC-SHA256( timestamp + rawBody, clientSecret ) )
 *
 * Two things that are easy to get wrong and both break verification silently:
 *  - The body must be the **raw** request text. Parsing to JSON and
 *    re-stringifying changes byte order and whitespace.
 *  - The timestamp is prepended to the body, not sent as a separate field.
 *
 * Compared in constant time so a mismatched signature cannot be discovered by
 * timing the response.
 */
export function verifyWebhookSignature(
  signature: string | null,
  rawBody: string,
  timestamp: string | null
): boolean {
  if (!signature || !timestamp) return false;

  // Reject stale deliveries: a captured webhook should not be replayable
  // indefinitely. Cashfree retries within minutes, so an hour is generous.
  const ts = Number(timestamp);
  if (Number.isFinite(ts)) {
    // Cashfree sends epoch seconds; tolerate milliseconds defensively.
    const ms = ts > 1e12 ? ts : ts * 1000;
    if (Math.abs(Date.now() - ms) > 60 * 60 * 1000) return false;
  }

  const expected = createHmac('sha256', serverEnv.cashfreeSecretKey)
    .update(`${timestamp}${rawBody}`)
    .digest('base64');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
