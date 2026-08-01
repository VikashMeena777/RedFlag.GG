import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { verifyWebhookSignature } from '@/lib/billing/cashfree';
import { createServiceClient } from '@/lib/supabase/service';
import { PRO_PRICE_INR } from '@/lib/types';

/**
 * Cashfree webhook — the ONLY place Pro is granted or revoked.
 *
 * Hardening, in order:
 *  1. Raw-body signature verification. `request.text()` is mandatory: parsing to
 *     JSON first changes the bytes and invalidates the HMAC.
 *  2. Idempotency via `x-idempotency-header` (unique per payload), stored in
 *     `payments.event_id` with a unique index. Cashfree uses at-least-once
 *     delivery, so a replayed CANCELLED event must not re-revoke a tier the user
 *     has since repurchased.
 *  3. Service role for all writes, because `is_pro` / `pro_expires_at` are
 *     trigger-guarded against every other role.
 *
 * A forged request fails at step 1 and never touches the database.
 */

export const dynamic = 'force-dynamic';

/** Events that grant entitlement. */
const ACTIVATING = new Set([
  'SUBSCRIPTION_STATUS_CHANGE_ACTIVE',
  'SUBSCRIPTION_AUTH_STATUS_SUCCESS',
  'SUBSCRIPTION_PAYMENT_SUCCESS',
  'SUBSCRIPTION_NEW_PAYMENT_SUCCESS',
]);

/** Events that end it. */
const TERMINATING = new Set([
  'SUBSCRIPTION_STATUS_CHANGE_CANCELLED',
  'SUBSCRIPTION_STATUS_CHANGE_COMPLETED',
  'SUBSCRIPTION_STATUS_CHANGE_EXPIRED',
  'SUBSCRIPTION_STATUS_CHANGE_ON_HOLD',
]);

interface CashfreeWebhookPayload {
  type?: string;
  event_time?: string;
  data?: {
    subscription_details?: {
      subscription_id?: string;
      cf_subscription_id?: string;
      subscription_status?: string;
      next_schedule_date?: string | null;
    };
    subscription_payment_details?: {
      payment_status?: string;
      next_schedule_date?: string | null;
      payment_amount?: number;
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
  const details = payload.data?.subscription_details;
  const subscriptionRef = details?.subscription_id;

  if (!subscriptionRef) {
    // Nothing to attribute. Ack so Cashfree stops retrying.
    return NextResponse.json({ received: true, ignored: 'no_subscription_id' });
  }

  const admin = createServiceClient();

  /*
   * Idempotency key. Prefer Cashfree's own header; older webhook versions predate
   * it, so fall back to a hash of the already-verified body.
   */
  const eventId =
    request.headers.get('x-idempotency-header') ??
    createHash('sha256').update(rawBody).digest('hex');

  // Attribute to a user via the reference we generated at checkout.
  const { data: profile } = await admin
    .from('profiles')
    .select('id, is_pro')
    .eq('cf_subscription_ref', subscriptionRef)
    .maybeSingle();

  /*
   * The insert doubles as the dedupe: `payments_event_id_uniq` rejects a replay,
   * and the row is the audit trail. Done before the entitlement change so a
   * duplicate delivery cannot re-apply it.
   */
  const { error: dedupeError } = await admin.from('payments').insert({
    user_id: profile?.id ?? null,
    provider: 'cashfree',
    cashfree_subscription_id: details?.cf_subscription_id ?? null,
    amount_inr:
      payload.data?.subscription_payment_details?.payment_amount ??
      (ACTIVATING.has(eventType) ? PRO_PRICE_INR : null),
    status: `${eventType}:${details?.subscription_status ?? 'unknown'}`,
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
    console.warn(`[cashfree] no profile for subscription ${subscriptionRef}`);
    return NextResponse.json({
      received: true,
      ignored: 'unknown_subscription',
    });
  }

  try {
    if (ACTIVATING.has(eventType)) {
      await grantPro(
        profile.id,
        details?.subscription_status ?? 'ACTIVE',
        payload.data?.subscription_payment_details?.next_schedule_date ??
          details?.next_schedule_date ??
          null
      );
    } else if (TERMINATING.has(eventType)) {
      await revokePro(profile.id, details?.subscription_status ?? 'CANCELLED');
    } else {
      // Record the status but leave entitlement alone.
      await admin
        .from('profiles')
        .update({
          cf_subscription_status: details?.subscription_status ?? eventType,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);
    }
  } catch (error) {
    console.error(`[cashfree] handling ${eventType} failed:`, error);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Grants Pro through the next scheduled debit.
 *
 * `pro_expires_at` is the grace boundary: `getViewer()` degrades to verified past
 * this instant even if a cancellation webhook never arrives, so a lapsed mandate
 * cannot leave someone on a paid tier indefinitely.
 */
async function grantPro(
  userId: string,
  status: string,
  nextScheduleDate: string | null
) {
  const admin = createServiceClient();

  const expiresAt = nextScheduleDate
    ? addGrace(new Date(nextScheduleDate))
    : addGrace(monthFromNow());

  const { error } = await admin
    .from('profiles')
    .update({
      is_pro: true,
      cf_subscription_status: status,
      pro_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw new Error(`grant failed: ${error.message}`);
}

/** Ends Pro. The account stays verified — they still hold a real account. */
async function revokePro(userId: string, status: string) {
  const admin = createServiceClient();

  const { error } = await admin
    .from('profiles')
    .update({
      is_pro: false,
      cf_subscription_status: status,
      pro_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .eq('is_pro', true);

  if (error) throw new Error(`revoke failed: ${error.message}`);
}

function monthFromNow(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}

/** Two days of slack so a retried debit does not briefly lock a paying user out. */
function addGrace(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + 2);
  return d;
}
