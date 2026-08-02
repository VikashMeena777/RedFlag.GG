'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { nanoid } from 'nanoid';
import {
  createSubscription,
  cancelSubscription,
  getSubscription,
  CashfreeApiError,
} from '@/lib/billing/cashfree';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/auth/viewer';
import { clientIp } from '@/lib/auth/fingerprint';
import { checkLimit, limitMessage } from '@/lib/rate-limit';
import { serverEnv } from '@/lib/env';
import { PRO_PRICE_INR, PRO_MAX_CYCLES } from '@/lib/types';
import type { Database } from '@/lib/supabase/database.types';
import { z } from 'zod';

/**
 * Billing actions (Cashfree).
 *
 * Note what is absent: nothing here grants Pro. Creating a subscription only
 * returns a checkout session; `is_pro` is written exclusively by the webhook
 * after HMAC verification. A client that fakes its way back to
 * `/account?upgraded=1` gains nothing — `syncSubscriptionStatus()` re-reads the
 * truth from Cashfree rather than trusting the redirect.
 */

export interface CheckoutResult {
  ok: boolean;
  /** Cashfree session id, handed to the hosted checkout by the browser. */
  sessionId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Indian mobile number, required by Cashfree for a UPI/e-NACH mandate.
 * Accepts an optional +91 prefix and normalises to ten digits.
 */
const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^(?:\+?91)/, ''))
  .pipe(
    z
      .string()
      .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number.')
  );

export async function startProSubscription(
  formData: FormData
): Promise<CheckoutResult> {
  try {
    const viewer = await getViewer();

    // Subscribing requires a verified account: an anonymous session can vanish
    // with a cleared cookie, which would orphan a paid mandate.
    if (!viewer.isVerified) {
      return { ok: false, error: 'Verify your account before subscribing.' };
    }
    if (viewer.isPro) {
      return { ok: false, error: 'You are already on RedFlag Pro.' };
    }

    const parsedPhone = phoneSchema.safeParse(formData.get('phone') ?? '');
    if (!parsedPhone.success) {
      return {
        ok: false,
        fieldErrors: {
          phone: parsedPhone.error.issues[0]?.message ?? 'Invalid phone number.',
        },
      };
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

    // A fresh reference per attempt. Cashfree rejects a duplicate subscription_id,
    // and reusing one across abandoned attempts would wedge the user permanently.
    const subscriptionRef = `rfgg_${viewer.userId!.replace(/-/g, '').slice(0, 12)}_${nanoid(8)}`;

    const subscription = await createSubscription({
      subscriptionRef,
      customerEmail: user.email,
      customerPhone: parsedPhone.data,
      returnUrl: `${serverEnv.siteUrl}/account?upgraded=1`,
      amount: PRO_PRICE_INR,
      planName: 'RedFlag Pro',
      maxCycles: PRO_MAX_CYCLES,
    });

    if (!subscription.subscription_session_id) {
      console.error('[billing] Cashfree returned no session id');
      return { ok: false, error: 'Could not start checkout. Try again.' };
    }

    // Record the pending attempt so the webhook can attribute the event.
    // `is_pro` is deliberately NOT set here.
    await admin
      .from('profiles')
      .update({
        cf_subscription_ref: subscriptionRef,
        cf_subscription_status: subscription.subscription_status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', viewer.userId!);

    // Audit row for the attempt. Status mirrors Cashfree, not our entitlement.
    await admin.from('payments').insert({
      user_id: viewer.userId!,
      provider: 'cashfree',
      cashfree_subscription_id: subscription.cf_subscription_id,
      amount_inr: PRO_PRICE_INR,
      status: `initiated:${subscription.subscription_status}`,
    });

    return { ok: true, sessionId: subscription.subscription_session_id };
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
          error: 'Cashfree rejected those details. Check your phone number.',
        };
      }
      if (error.status === 404) {
        return {
          ok: false,
          error:
            'Subscriptions are not enabled on this merchant account yet.',
        };
      }
    } else {
      console.error('[billing] create failed:', error);
    }
    return { ok: false, error: 'Could not start checkout. Try again.' };
  }
}

/** Cancels Pro. Access continues until the paid period ends. */
export async function cancelProSubscription(): Promise<CheckoutResult> {
  try {
    const viewer = await getViewer();
    if (!viewer.userId) return { ok: false, error: 'Not signed in.' };

    const admin = createServiceClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('cf_subscription_ref')
      .eq('id', viewer.userId)
      .maybeSingle();

    if (!profile?.cf_subscription_ref) {
      return { ok: false, error: 'No subscription on file.' };
    }

    const result = await cancelSubscription(profile.cf_subscription_ref);

    // Do not clear `is_pro` here — they paid for the current period.
    // `pro_expires_at` already bounds access, and the webhook confirms the state.
    await admin
      .from('profiles')
      .update({
        cf_subscription_status: result.subscription_status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', viewer.userId);

    await admin.from('payments').insert({
      user_id: viewer.userId,
      provider: 'cashfree',
      cashfree_subscription_id: result.cf_subscription_id,
      status: `cancelled:${result.subscription_status}`,
    });

    revalidatePath('/account');
    return { ok: true };
  } catch (error) {
    console.error('[billing] cancel failed:', error);
    return { ok: false, error: 'Could not cancel. Contact support.' };
  }
}

/**
 * Reconciles local state with Cashfree on demand.
 *
 * Called when the user lands back on `/account?upgraded=1`. The webhook is the
 * source of truth, but it can arrive seconds after the redirect — this stops the
 * account page from showing a stale "not subscribed" immediately after payment.
 *
 * Safe because it reads from Cashfree rather than trusting the query parameter.
 */
export async function syncSubscriptionStatus(): Promise<{ ok: boolean }> {
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

    const subscription = await getSubscription(profile.cf_subscription_ref);
    const isActive = ['ACTIVE', 'AUTHENTICATED'].includes(
      subscription.subscription_status
    );

    const update: Database['public']['Tables']['profiles']['Update'] = {
      cf_subscription_status: subscription.subscription_status,
      updated_at: new Date().toISOString(),
    };

    if (isActive && !profile.is_pro) {
      update.is_pro = true;
      update.pro_expires_at = nextMonthIso();
    }

    await admin.from('profiles').update(update).eq('id', viewer.userId);
    revalidatePath('/account');
    return { ok: true };
  } catch (error) {
    console.error('[billing] sync failed:', error);
    return { ok: false };
  }
}

/** One month out, plus two days of grace for retry windows. */
function nextMonthIso(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(d.getDate() + 2);
  return d.toISOString();
}
