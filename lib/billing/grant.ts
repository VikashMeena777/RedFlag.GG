import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { PRO_PRICE_INR, PRO_DURATION_DAYS } from '@/lib/types';
import { plusDays } from '@/lib/utils';

/**
 * The single grant path for Pro, shared by the webhook and the post-checkout
 * reconciliation.
 *
 * Centralising it fixes two things at once:
 *
 *  - **One idempotency rule everywhere.** The insert IS the lock: the
 *    `payments_order_paid_uniq` partial index (migration 008) allows exactly
 *    one `ORDER_PAID` row per order reference, so it does not matter whether
 *    the webhook, the sync, or both race to confirm a payment — only the first
 *    one through inserts the marker, and everyone else sees a duplicate and
 *    stops. Before this helper existed, the sync path could grant 30 days and
 *    a late webhook grant 30 more for the same payment.
 *  - **One place that ever sets `is_pro`.**
 *
 * The marker row doubles as the audit trail: `event_id` names the confirming
 * path (`sync:<ref>` or Cashfree's delivery id) and `raw_event` carries the
 * webhook payload when there is one.
 */

export interface GrantResult {
  /** True when this call is what granted the pass. */
  granted: boolean;
  /** True when a prior confirmation already covered this order. */
  duplicate: boolean;
}

export async function grantProForPaidOrder(
  userId: string,
  orderRef: string,
  amountInr: number | null,
  eventId: string,
  rawEvent?: unknown
): Promise<GrantResult> {
  const admin = createServiceClient();

  // Read the current expiry first so an active pass extends instead of
  // shortening (a renewal paid while still Pro).
  const { data: profile } = await admin
    .from('profiles')
    .select('pro_expires_at')
    .eq('id', userId)
    .maybeSingle();

  const { error } = await admin.from('payments').insert({
    user_id: userId,
    provider: 'cashfree',
    cashfree_subscription_id: orderRef,
    amount_inr: amountInr ?? PRO_PRICE_INR,
    status: 'ORDER_PAID',
    event_id: eventId,
    raw_event: (rawEvent ?? null) as never,
  });

  if (error) {
    if (error.code === '23505' || error.message.includes('duplicate')) {
      return { granted: false, duplicate: true };
    }
    throw new Error(`paid-marker insert failed: ${error.message}`);
  }

  const base =
    profile?.pro_expires_at && new Date(profile.pro_expires_at) > new Date()
      ? new Date(profile.pro_expires_at)
      : new Date();

  const { error: grantError } = await admin
    .from('profiles')
    .update({
      is_pro: true,
      pro_expires_at: plusDays(base, PRO_DURATION_DAYS),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (grantError) throw new Error(`grant failed: ${grantError.message}`);
  return { granted: true, duplicate: false };
}

/** Records a non-paid terminal event for the audit trail. No entitlement change. */
export async function recordFailedOrderEvent(
  userId: string | null,
  orderRef: string,
  eventId: string,
  status: string,
  rawEvent: unknown
): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin.from('payments').insert({
    user_id: userId,
    provider: 'cashfree',
    cashfree_subscription_id: orderRef,
    amount_inr: null,
    status,
    event_id: eventId,
    raw_event: rawEvent as never,
  });
  // A duplicate failure event is fine (at-least-once delivery); anything else
  // is logged but must not fail the response — Cashfree would retry forever.
  if (error && error.code !== '23505' && !error.message.includes('duplicate')) {
    console.error('[cashfree] failed-event insert failed:', error.message);
  }
}
