'use server';

import { headers } from 'next/headers';
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
      // The reference is embedded literally — no {order_id} placeholder to
      // depend on Cashfree substituting.
      returnUrl: `${serverEnv.siteUrl}/account/success?order_id=${orderRef}`,
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
    // The create response rides along in raw_event: its cf_order_id is what
    // the sync falls back to when an order cannot be fetched by our reference.
    await admin.from('payments').insert({
      user_id: viewer.userId!,
      provider: 'cashfree',
      cashfree_subscription_id: orderRef,
      amount_inr: PRO_PRICE_INR,
      status: `order_created:${order.order_status}`,
      raw_event: {
        cf_order_id: order.cf_order_id,
        order_id: order.order_id,
        order_status: order.order_status,
        order_amount: order.order_amount,
      } as never,
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
 * How far back a checkout attempt can still be reconciled. Long enough to
 * cover "paid Friday night, opened the site Sunday"; short enough that the
 * account page's self-heal stops calling Cashfree for ancient abandoned
 * checkouts on its own.
 */
const RECENT_ORDER_WINDOW_HOURS = 48;
/** Orders checked per sync — a buyer mid-retry-spree should not fan out. */
const MAX_SYNC_CANDIDATES = 8;

/** Pulls Cashfree's generated id out of the stored checkout audit row. */
function readCfOrderId(raw: unknown): string | number | undefined {
  if (raw && typeof raw === 'object' && 'cf_order_id' in raw) {
    const value = (raw as { cf_order_id?: unknown }).cf_order_id;
    if (typeof value === 'string' || typeof value === 'number') return value;
  }
  return undefined;
}

/**
 * Reconciles local state with Cashfree on demand.
 *
 * Called by the success page's poller (with the order id from the return URL)
 * and by the account page's self-heal. The webhook remains the source of
 * truth; this exists so the buyer sees Pro within seconds even when the
 * webhook is delayed or not yet registered.
 *
 * Two hardening rules learned from a real stuck payment (2026-09-15):
 *  - **Every recent attempt is checked, newest first** — a buyer who paid the
 *    first order and then started a second checkout must still have the first
 *    confirmed; the profile's single reference points at the newest only.
 *  - **The `orderRef` parameter is never trusted directly** — it is honoured
 *    only when one of the caller's own checkout rows ties it to them.
 *
 * Outcomes land in `profiles.cf_subscription_status` (internal, never
 * displayed) so a failure is diagnosable straight from the database — the
 * project's Vercel account is personal and team tokens cannot read its logs.
 */
export async function syncProStatus(orderRef?: string | null): Promise<{
  ok: boolean;
  paid?: boolean;
}> {
  try {
    const viewer = await getViewer();
    if (!viewer.userId) return { ok: false };

    const admin = createServiceClient();
    const since = new Date(
      Date.now() - RECENT_ORDER_WINDOW_HOURS * 60 * 60 * 1000
    ).toISOString();

    const { data: attempts } = await admin
      .from('payments')
      .select('cashfree_subscription_id, raw_event, created_at')
      .eq('user_id', viewer.userId)
      .like('status', 'order_created:%')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(MAX_SYNC_CANDIDATES);

    // The success page's order id goes first — but only once a checkout row
    // has tied it to this user.
    const rows = attempts ?? [];
    const candidates: Array<{ ref: string; cfOrderId?: string | number }> = [];
    if (orderRef) {
      const row = rows.find(
        (r) => r.cashfree_subscription_id === orderRef
      );
      if (row) {
        candidates.push({
          ref: orderRef,
          cfOrderId: readCfOrderId(row.raw_event),
        });
      }
    }
    for (const row of rows) {
      if (!row.cashfree_subscription_id) continue;
      if (candidates.some((c) => c.ref === row.cashfree_subscription_id)) {
        continue;
      }
      candidates.push({
        ref: row.cashfree_subscription_id,
        cfOrderId: readCfOrderId(row.raw_event),
      });
    }

    if (candidates.length === 0) return { ok: false };

    let lastStatus: string | null = null;
    for (const candidate of candidates) {
      try {
        const order = await getOrder(candidate.ref, candidate.cfOrderId);
        if (order.order_status === 'PAID') {
          await grantProForPaidOrder(
            viewer.userId,
            candidate.ref,
            order.order_amount ?? PRO_PRICE_INR,
            `sync:${candidate.ref}`
          );
          return { ok: true, paid: true };
        }
        lastStatus = order.order_status;
      } catch (error) {
        const detail =
          error instanceof CashfreeApiError
            ? `${error.status}:${error.code ?? error.message}`
            : error instanceof Error
              ? error.message
              : String(error);
        console.error(
          `[billing] order check failed for ${candidate.ref}: ${detail}`
        );
        lastStatus = `sync_error:${detail}`.slice(0, 100);
      }
    }

    // Nothing paid. Record what we saw so the outcome is readable from the
    // database and the account page shows the freshest state.
    if (lastStatus) {
      await admin
        .from('profiles')
        .update({
          cf_subscription_status: lastStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', viewer.userId);
    }
    return { ok: true, paid: false };
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
