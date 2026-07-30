'use server';

import { headers } from 'next/headers';
import { getStripe } from '@/lib/billing/stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/auth/viewer';
import { clientIp } from '@/lib/auth/fingerprint';
import { checkLimit, limitMessage } from '@/lib/rate-limit';
import { serverEnv } from '@/lib/env';

/**
 * Billing actions.
 *
 * Note what is absent: nothing here grants a tier. Checkout only creates a
 * session; the tier is written exclusively by the webhook after signature
 * verification. A client that fakes a "success" return gains nothing.
 */

export interface CheckoutResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/** Creates a Stripe Checkout session for RedFlag+. */
export async function createCheckoutSession(): Promise<CheckoutResult> {
  const viewer = await getViewer();

  // Subscribing requires a verified account: an anonymous session can vanish
  // with a cleared cookie, which would orphan a paid subscription.
  if (!viewer.isVerified) {
    return {
      ok: false,
      error: 'Verify your account before subscribing.',
    };
  }
  if (viewer.isPlus) {
    return { ok: false, error: 'You are already on RedFlag+.' };
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
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', viewer.userId!)
    .maybeSingle();

  try {
    const stripe = getStripe();

    // Reuse the customer if one exists, so billing history stays in one place.
    let customerId = profile?.stripe_customer_id ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        // The user id is the join key the webhook trusts.
        metadata: { supabase_user_id: viewer.userId! },
      });
      customerId = customer.id;
      await admin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', viewer.userId!);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: serverEnv.stripePlusPriceId, quantity: 1 }],
      success_url: `${serverEnv.siteUrl}/account?upgraded=1`,
      cancel_url: `${serverEnv.siteUrl}/account`,
      // Carried into the webhook event so the subscription can be attributed
      // even if the customer record is somehow missing metadata.
      subscription_data: {
        metadata: { supabase_user_id: viewer.userId! },
      },
      client_reference_id: viewer.userId!,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return { ok: false, error: 'Could not start checkout.' };
    }
    return { ok: true, url: session.url };
  } catch (error) {
    console.error('[billing] checkout failed:', error);
    return { ok: false, error: 'Could not start checkout. Try again.' };
  }
}

/** Opens the Stripe billing portal so users can cancel without emailing us. */
export async function createPortalSession(): Promise<CheckoutResult> {
  const viewer = await getViewer();
  if (!viewer.userId) return { ok: false, error: 'Not signed in.' };

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', viewer.userId)
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    return { ok: false, error: 'No subscription on file.' };
  }

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${serverEnv.siteUrl}/account`,
    });
    return { ok: true, url: session.url };
  } catch (error) {
    console.error('[billing] portal failed:', error);
    return { ok: false, error: 'Could not open billing portal.' };
  }
}
