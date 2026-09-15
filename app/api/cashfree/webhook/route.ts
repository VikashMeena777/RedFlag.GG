import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { verifyWebhookSignature } from '@/lib/billing/cashfree';
import {
  grantProForPaidOrder,
  recordFailedOrderEvent,
} from '@/lib/billing/grant';
import { createServiceClient } from '@/lib/supabase/service';
import { PRO_PRICE_INR } from '@/lib/types';

/**
 * Cashfree webhook — one of exactly two paths that can grant Pro, and both
 * funnel through the same one-paid-row-per-order lock.
 *
 * Hardening, in order:
 *  1. Raw-body signature verification. `request.text()` is mandatory: parsing to
 *     JSON first changes the bytes and invalidates the HMAC.
 *  2. Idempotency, twice over:
 *     - `x-idempotency-header` (unique per delivery) in `payments.event_id`
 *       catches Cashfree's at-least-once retries of the same event.
 *     - the `payments_order_paid_uniq` partial index (migration 008) catches
 *       any *other* confirmation of the same order — a second event shape, or
 *       the post-checkout sync having already granted — so one purchase can
 *       never grant twice.
 *  3. Service role for all writes, because `is_pro` / `pro_expires_at` are
 *     trigger-guarded against every other role.
 *
 * A forged request fails at step 1 and never touches the database.
 */

export const dynamic = 'force-dynamic';

/** Events that mean money actually arrived. */
const PAID_EVENTS = new Set(['ORDER_PAID', 'PAYMENT_SUCCESS']);

/** Terminal failures worth keeping in the audit trail, no entitlement change. */
const FAILED_EVENTS = new Set([
  'PAYMENT_FAILED',
  'PAYMENT_USER_DROPPED',
  'PAYMENT_WEBHOOK_VALIDATION_FAILED',
]);

interface CashfreeWebhookPayload {
  type?: string;
  data?: {
    order?: {
      order_id?: string;
      cf_order_id?: string | number;
      order_amount?: number;
      order_status?: string;
    };
    payment?: {
      order_id?: string;
      cf_payment_id?: string | number;
      payment_status?: string;
      payment_amount?: number;
      payment_group?: string;
    };
  };
}

export async function POST(request: NextRequest) {
  // Raw body, byte-for-byte, or the signature check is meaningless.
  const rawBody = await request.text();
  const signature = request.headers.get('x-webhook-signature');
  const timestamp = request.headers.get('x-webhook-timestamp');

  if (!verifyWebhookSignature(signature, rawBody, timestamp)) {
    console.error('[cashfree] signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: CashfreeWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
  }

  const eventType = payload.type ?? 'UNKNOWN';

  /*
   * Cashfree has shipped two payload generations: current events nest the
   * order under data.order, while the older PAYMENT_SUCCESS shape carries the
   * order reference inside data.payment. Read both; the order id is our own
   * reference and the attribution key.
   */
  const orderRef =
    payload.data?.order?.order_id ?? payload.data?.payment?.order_id ?? null;

  if (!orderRef) {
    // Nothing to attribute. Ack so Cashfree stops retrying.
    return NextResponse.json({ received: true, ignored: 'no_order_id' });
  }

  if (!PAID_EVENTS.has(eventType) && !FAILED_EVENTS.has(eventType)) {
    // Unknown but signature-verified: record nothing, ack, and let the audit
    // trail stay limited to meaningful events.
    return NextResponse.json({ received: true, ignored: eventType });
  }

  const amount =
    payload.data?.order?.order_amount ??
    payload.data?.payment?.payment_amount ??
    null;

  // Attribute to a user via the reference we generated at checkout.
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('cf_subscription_ref', orderRef)
    .maybeSingle();

  if (!profile) {
    console.warn(`[cashfree] no profile for order ${orderRef}`);
    return NextResponse.json({ received: true, ignored: 'unknown_order' });
  }

  /*
   * Idempotency key. Prefer Cashfree's own header; older webhook versions
   * predate it, so fall back to a hash of the already-verified body.
   */
  const eventId =
    request.headers.get('x-idempotency-header') ??
    createHash('sha256').update(rawBody).digest('hex');

  try {
    if (PAID_EVENTS.has(eventType)) {
      if (amount !== null && amount < PRO_PRICE_INR) {
        // Signature-verified, so the order is genuinely ours; a lower amount
        // means the price changed between order creation and payment. Grant
        // anyway — the marker row preserves the anomaly for reconciliation.
        console.warn(
          `[cashfree] order ${orderRef} paid ${amount}, below current price ${PRO_PRICE_INR} — granting anyway`
        );
      }

      const result = await grantProForPaidOrder(
        profile.id,
        orderRef,
        amount,
        eventId,
        payload
      );
      return NextResponse.json({
        received: true,
        granted: result.granted,
        duplicate: result.duplicate,
      });
    }

    await recordFailedOrderEvent(
      profile.id,
      orderRef,
      eventId,
      `failed:${eventType}`,
      payload
    );
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[cashfree] handling ${eventType} failed:`, error);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }
}
