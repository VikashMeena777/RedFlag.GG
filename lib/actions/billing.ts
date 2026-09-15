'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { nanoid } from 'nanoid';
import {
  createProOrder,
  getOrder,
  CashfreeApiError,
} from '@/lib/billing/cashfree';
import { grantProForPaidOrder } from '@/lib/billing/grant';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/auth/viewer';
import { clientIp } from '@/lib/auth/fingerprint';
import { checkLimit, limitMessage } from '@/lib/rate-limit';
import { serverEnv } from '@/lib/env';
import { PRO_PRICE_INR } from '@/lib/types';

/**
 * Billing actions (Cashfree Payment Gateway — one-time orders).
 *
 * Note what is absent: nothing here grants Pro directly. The only grant path is
 * `grantProForPaidOrder`, which inserts the ORDER_PAID marker row first — the
 * unique partial index on it means the webhook, this reconciliation, or both
 * can race to confirm a payment and it is still granted exactly once.
 *
 * Pro is deliberately NOT a recurring mandate: the account has only the
 * Payment Gateway product, and the site collects no data beyond the verified
 * email (Cashfree's schema requires a phone value; a placeholder is sent and
 * the payer's own instrument details are entered at checkout, never stored
 * here).
 */

export interface CheckoutResult {
  ok: boolean;
  /** Cashfree session id, handed to the drop-in checkout by the browser. */
  sessionId?: string;
  error?: string;
}

export async function startProCheckout(): Promise<CheckoutResult> {
  try {
    const viewer = await getViewer();

    // Paying requires a verified account: an anonymous session can vanish with
    // a cleared cookie, and Cashfree needs the email for the order anyway.
    // This is the only data the flow uses — no phone is collected, ever.
    if (!viewer.isVerified) {
      return { ok: false, error: 'Verify your account before buying Pro.' };
    }
    if (viewer.isPro) {
      return { ok: false, error: 'You are already on RedFlag Pro.' };
    }

    const ip = clientIp(await headers());
    const limit = await checkLimit('checkout', `${viewer.userId}:${ip}`);
    if (!limit.ok) return { ok: false, error: limitMessage(limit) };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return { ok: false, error: 'No email on file. Verify your account first.' };
    }

    const admin = createServiceClient();

    // A fresh reference per attempt. Cashfree rejects a duplicate order_id, and
    // reusing one across abandoned attempts would wedge the user permanently.
    // The reference is also the attribution key when the webhook arrives.
    const orderRef = `rfgg_${viewer.userId!.replace(/-/g, '').slice(0, 12)}_${nanoid(8)}`;

    const order = await createProOrder({
      orderRef,
      customerId: `rfgg_${viewer.userId!.replace(/-/g, '').slice(0, 16)}`,
      customerEmail: user.email,
      // Cashfree substitutes {order_id} in the return URL, so the success page
      // knows exactly which order to reconcile.
      returnUrl: `${serverEnv.siteUrl}/account/success?order_id={order_id}`,
      amount: PRO_PRICE_INR,
      orderNote: 'RedFlag Pro — 30 days',
    });

    if (!order.payment_session_id) {
      console.error('[billing] Cashfree returned no payment session id');
      return { ok: false, error: 'Could not start checkout. Try again.' };
    }

    // Record the pending attempt so the webhook can attribute the event.
    // `is_pro` is deliberately NOT set here. (The cf_subscription_* columns
    // predate the switch to one-time orders and now hold the order reference —
    // renaming them would mean touching the guard trigger for no gain.)
    await admin
      .from('profiles')
      .update({
        cf_subscription_ref: orderRef,
        cf_subscription_status: order.order_status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', viewer.userId!);

    // Audit row for the attempt. Status mirrors Cashfree, not our entitlement.
    await admin.from('payments').insert({
      user_id: viewer.userId!,
      provider: 'cashfree',
      cashfree_subscription_id: orderRef,
      amount_inr: PRO_PRICE_INR,
      status: `order_created:${order.order_status}`,
    });

    return { ok: true, sessionId: order.payment_session_id };
  } catch (error) {
    if (error instanceof CashfreeApiError) {
      console.error(
        `[billing] Cashfree create failed (${error.status} ${error.code ?? '-'}):`,
        error.message
      );
      // Surface validation problems, hide everything else.
      if (error.status === 400 || error.status === 422) {
        return {
          ok: false,
          error: 'Cashfree could not start this payment. Try again shortly.',
        };
      }
      if (error.status === 404) {
        return {
          ok: false,
          error: 'Payments are not enabled on this merchant account yet.',
        };
      }
    } else {
      console.error('[billing] create failed:', error);
    }
    return { ok: false, error: 'Could not start checkout. Try again.' };
  }
}

/**
 * Reconciles local state with Cashfree on demand.
 *
 * Called by the success page's poller (with the order id from the return URL)
 * and by `/account?upgraded=1` (legacy links, no id). The webhook remains the
 * source of truth; this exists so the buyer sees Pro within seconds even when
 * the webhook is delayed or not yet registered. Safe to call repeatedly: the
 * grant funnels through the same one-paid-row-per-order lock as the webhook.
 *
 * The `orderRef` parameter is never trusted directly — it is only honoured
 * when a checkout-attempt row ties that order to the calling user.
 */
export async function syncProStatus(orderRef?: string | null): Promise<{
  ok: boolean;
  paid?: boolean;
}> {
  try {
    const viewer = await getViewer();
    if (!viewer.userId) return { ok: false };

    const admin = createServiceClient();

    let ref: string | null = null;

    if (orderRef) {
      const { data: attempt } = await admin
        .from('payments')
        .select('cashfree_subscription_id')
        .eq('cashfree_subscription_id', orderRef)
        .eq('user_id', viewer.userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (attempt) ref = attempt.cashfree_subscription_id;
    }

    if (!ref) {
      const { data: profile } = await admin
        .from('profiles')
        .select('cf_subscription_ref')
        .eq('id', viewer.userId)
        .maybeSingle();
      ref = profile?.cf_subscription_ref ?? null;
    }

    if (!ref) return { ok: false };

    const order = await getOrder(ref);
    const paid = order.order_status === 'PAID';

    if (paid) {
      await grantProForPaidOrder(
        viewer.userId,
        ref,
        order.order_amount ?? PRO_PRICE_INR,
        `sync:${ref}`
      );
    } else {
      await admin
        .from('profiles')
        .update({
          cf_subscription_status: order.order_status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', viewer.userId);
    }

    revalidatePath('/account');
    return { ok: true, paid };
  } catch (error) {
    console.error('[billing] sync failed:', error);
    return { ok: false };
  }
}

/**
 * The success page's poll: reconcile once, then report what the viewer
 * actually holds. Rate-limited so a hand-crafted client cannot drive a loop of
 * Cashfree lookups; the limit failing open is deliberate — a limiter outage
 * must not block payment confirmation, and Cashfree rate-limits its own API.
 */
export async function confirmProStatus(orderRef: string | null): Promise<{
  isPro: boolean;
  proExpiresAt: string | null;
}> {
  const viewer = await getViewer();
  if (!viewer.userId) return { isPro: false, proExpiresAt: null };

  const limit = await checkLimit('sync:status', viewer.userId);
  if (limit.ok) {
    await syncProStatus(orderRef);
  }

  const fresh = await getViewer();
  return { isPro: fresh.isPro, proExpiresAt: fresh.proExpiresAt };
}
