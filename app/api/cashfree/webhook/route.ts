import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { verifyWebhookSignature } from '@/lib/billing/cashfree';
import { createServiceClient } from '@/lib/supabase/service';
import { PRO_PRICE_INR, PRO_DURATION_DAYS } from '@/lib/types';
import { plusDays } from '@/lib/utils';

/**
 * Cashfree webhook — the ONLY place Pro is granted.
 *
 * Hardening, in order:
 *  1. Raw-body signature verification. `request.text()` is mandatory: parsing to
 *     JSON first changes the bytes and invalidates the HMAC.
 *  2. Idempotency, twice over:
 *     - `x-idempotency-header` (unique per delivery) in `payments.event_id`
 *       catches Cashfree's at-least-once retries of the same event.
 *     - a partial unique index (`payments_order_paid_uniq`, migration 008) on
 *       the order reference catches a *different* event for the same payment —
 *     e.g. both ORDER_PAID and PAYMENT_SUCCESS configured — so one purchase can
 *     never grant twice.
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

  const admin = createServiceClient();

  /*
   * Idempotency key. Prefer Cashfree's own header; older webhook versions
   * predate it, so fall back to a hash of the already-verified body.
   */
  const eventId =
    request.headers.get('x-idempotency-header') ??
    createHash('sha256').update(rawBody).digest('hex');

  // Attribute to a user via the reference we generated at checkout.
  const { data: profile } = await admin
    .from('profiles')
    .select('id, is_pro, pro_expires_at')
    .eq('cf_subscription_ref', orderRef)
    .maybeSingle();

  /*
   * The insert doubles as the first dedupe: `payments_event_id_uniq` rejects a
   * redelivery. Done before the entitlement change so a duplicate cannot
   * re-apply it. Paid rows also carry the exact status 'ORDER_PAID', which the
   * second-layer partial unique index keys on.
   */
  const { error: dedupeError } = await admin.from('payments').insert({
    user_id: profile?.id ?? null,
    provider: 'cashfree',
    cashfree_subscription_id: orderRef,
    amount_inr: amount ?? (PAID_EVENTS.has(eventType) ? PRO_PRICE_INR : null),
    status: PAID_EVENTS.has(eventType) ? 'ORDER_PAID' : `failed:${eventType}`,
    raw_event: payload as never,
    event_id: eventId,
  });

  if (dedupeError) {
    if (
      dedupeError.code === '23505' ||
      dedupeError.message.includes('duplicate')
    ) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error('[cashfree] audit insert failed:', dedupeError.message);
    // Fail loudly so Cashfree retries rather than silently dropping the event.
    return NextResponse.json({ error: 'Storage error' }, { status: 500 });
  }

  if (!profile) {
    console.warn(`[cashfree] no profile for order ${orderRef}`);
    return NextResponse.json({
      received: true,
      ignored: 'unknown_order',
    });
  }

  if (!PAID_EVENTS.has(eventType)) {
    // Failure events are audit-only: no entitlement to change.
    return NextResponse.json({ received: true });
  }

  if (amount !== null && amount < PRO_PRICE_INR) {
    // Signature-verified, so the order is genuinely ours; a lower amount means
    // the price changed between order creation and payment. Record and grant
    // anyway — the audit row above preserves the anomaly for reconciliation.
    console.warn(
      `[cashfree] order ${orderRef} paid ${amount}, below current price ${PRO_PRICE_INR} — granting anyway`
    );
  }

  try {
    await grantProFromPayment(profile.id, profile.pro_expires_at);
  } catch (error) {
    console.error(`[cashfree] handling ${eventType} failed:`, error);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Grants 30 days of Pro from a paid order.
 *
 * `pro_expires_at` is the boundary `getViewer()` degrades on, so even a missed
 * webhook cannot leave someone on Pro forever. If Pro is somehow still active
 * (a race between webhook and sync), the new period extends the existing one
 * rather than shortening it.
 */
async function grantProFromPayment(
  userId: string,
  currentExpiry: string | null
): Promise<void> {
  const admin = createServiceClient();

  const base =
    currentExpiry && new Date(currentExpiry) > new Date()
      ? new Date(currentExpiry)
      : new Date();

  const { error } = await admin
    .from('profiles')
    .update({
      is_pro: true,
      pro_expires_at: plusDays(base, PRO_DURATION_DAYS),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw new Error(`grant failed: ${error.message}`);
}
