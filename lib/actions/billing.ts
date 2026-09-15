'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { nanoid } from 'nanoid';
import {
  createProOrder,
  getOrder,
  CashfreeApiError,
} from '@/lib/billing/cashfree';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/auth/viewer';
import { clientIp } from '@/lib/auth/fingerprint';
import { checkLimit, limitMessage } from '@/lib/rate-limit';
import { serverEnv } from '@/lib/env';
import { plusDays } from '@/lib/utils';
import { PRO_PRICE_INR, PRO_DURATION_DAYS } from '@/lib/types';
import type { Database } from '@/lib/supabase/database.types';

type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

/**
 * Billing actions (Cashfree Payment Gateway — one-time orders).
 *
 * Note what is absent: nothing here grants Pro. Creating an order only returns
 * a checkout session; `is_pro` is written exclusively by the webhook after
 * HMAC verification. A client that fakes its way back to `/account?upgraded=1`
 * gains nothing — `syncProStatus()` re-reads the truth from Cashfree rather
 * than trusting the redirect.
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
      returnUrl: `${serverEnv.siteUrl}/account?upgraded=1`,
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
 * Called when the user lands back on `/account?upgraded=1`. The webhook is the
 * source of truth, but it can arrive seconds after the redirect — this stops
 * the account page from showing a stale "not subscribed" immediately after
 * payment.
 *
 * Safe because it reads from Cashfree rather than trusting the query parameter.
 */
export async function syncProStatus(): Promise<{ ok: boolean }> {
  try {
    const viewer = await getViewer();
    if (!viewer.userId) return { ok: false };

    const admin = createServiceClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('cf_subscription_ref, is_pro')
      .eq('id', viewer.userId)
      .maybeSingle();

    if (!profile?.cf_subscription_ref) return { ok: false };

    const order = await getOrder(profile.cf_subscription_ref);
    const paid = order.order_status === 'PAID';

    const update: ProfileUpdate = {
      cf_subscription_status: order.order_status,
      updated_at: new Date().toISOString(),
    };

    if (paid && !profile.is_pro) {
      update.is_pro = true;
      update.pro_expires_at = plusDays(new Date(), PRO_DURATION_DAYS);
    }

    await admin.from('profiles').update(update).eq('id', viewer.userId);
    revalidatePath('/account');
    return { ok: true };
  } catch (error) {
    console.error('[billing] sync failed:', error);
    return { ok: false };
  }
}
