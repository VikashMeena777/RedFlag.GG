import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/env';

/**
 * Cashfree Payment Gateway client (one-time orders).
 *
 * Deliberately hand-rolled over `fetch` rather than pulling in `cashfree-pg`:
 * we use exactly two endpoints, the SDK is CommonJS-first and awkward in a
 * Next.js server bundle, and the webhook signature scheme is four lines of
 * crypto. Fewer moving parts in the payment path is worth more than convenience.
 *
 * Pro is a one-time 30-day pass, not a recurring mandate: the account only has
 * the Payment Gateway product (Subscriptions was never enabled), and the site
 * collects no data beyond the verified email — which is all Cashfree's order
 * API needs from us. The API schema does require *a* phone value, so a fixed
 * placeholder is sent; the payer's own UPI/card details are entered by them at
 * checkout and never touch our servers.
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
  // retried create safe rather than duplicating an order.
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

// ── Orders (Payment Gateway) ───────────────────────────────────────────────

export interface CreateOrderInput {
  /** Our own reference; doubles as the order id, so webhooks attribute themselves. */
  orderRef: string;
  /** Stable customer identifier on Cashfree's side. */
  customerId: string;
  customerEmail: string;
  returnUrl: string;
  /** Price in INR (major units). */
  amount: number;
  orderNote: string;
}

export interface OrderEntity {
  cf_order_id: string | number;
  order_id: string;
  /** ACTIVE until paid, then PAID; EXPIRED if never paid. */
  order_status: string;
  order_amount: number;
  /** Handed to the browser's checkout SDK. */
  payment_session_id?: string;
}

/**
 * Creates a one-time payment order.
 *
 * Returns a `payment_session_id`, which the browser hands to Cashfree's
 * drop-in checkout. Note what is absent: nothing here grants the tier — that
 * only happens in the webhook after signature verification.
 */
export async function createProOrder(
  input: CreateOrderInput
): Promise<OrderEntity> {
  return request<OrderEntity>('/orders', {
    method: 'POST',
    // Keyed on our reference so a double-submit cannot create two orders.
    idempotencyKey: input.orderRef,
    body: {
      order_id: input.orderRef,
      order_amount: input.amount,
      order_currency: 'INR',
      order_note: input.orderNote,
      customer_details: {
        customer_id: input.customerId,
        customer_email: input.customerEmail,
        /*
         * The API schema requires a phone value, but this site promises to
         * collect nothing beyond the verified email. A fixed placeholder is
         * sent; the payer enters their own UPI ID / card details at checkout,
         * and those go to Cashfree only.
         */
        customer_phone: '9999999999',
      },
      order_meta: {
        return_url: input.returnUrl,
      },
    },
  });
}

/**
 * Fetches an order's current status.
 *
 * Tries our own reference first; if the account resolves orders only by the
 * Cashfree-generated id (behaviour has varied across accounts and API
 * versions), falls back to `cfOrderId` — stored in the checkout audit row at
 * creation time precisely so this lookup cannot dead-end.
 */
export async function getOrder(
  orderRef: string,
  cfOrderId?: string | number
): Promise<OrderEntity> {
  try {
    return await request<OrderEntity>(
      `/orders/${encodeURIComponent(orderRef)}`,
      { method: 'GET' }
    );
  } catch (err) {
    if (
      err instanceof CashfreeApiError &&
      (err.status === 404 || err.status === 400) &&
      cfOrderId !== undefined
    ) {
      return request<OrderEntity>(
        `/orders/${encodeURIComponent(String(cfOrderId))}`,
        { method: 'GET' }
      );
    }
    throw err;
  }
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
