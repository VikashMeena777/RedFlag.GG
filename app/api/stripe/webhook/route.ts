import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/billing/stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { serverEnv } from '@/lib/env';

/**
 * Stripe webhook — the ONLY place a paid tier is granted or revoked.
 *
 * Hardening, in order:
 *  1. Raw body signature verification. `request.text()` is mandatory: parsing the
 *     JSON first would change the bytes and invalidate the signature.
 *  2. Event-ID idempotency via the `stripe_events` table. Stripe retries
 *     aggressively, and a replayed `deleted` event must not re-revoke a tier the
 *     user has since repurchased.
 *  3. Service role for all writes, because `profiles.tier` is trigger-guarded
 *     against every other role.
 *
 * A forged request fails at step 1 and never reaches the database.
 */

export const dynamic = 'force-dynamic';

const HANDLED_EVENTS = new Set<Stripe.Event['type']>([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  // Raw body, byte-for-byte, or the signature check is meaningless.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      serverEnv.stripeWebhookSecret
    );
  } catch (error) {
    console.error('[stripe] signature verification failed:', error);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const admin = createServiceClient();

  // Idempotency: the primary key makes a duplicate insert fail, which tells us
  // this event was already applied.
  const { error: dedupeError } = await admin
    .from('stripe_events')
    .insert({ id: event.id, type: event.type });

  if (dedupeError) {
    if (dedupeError.code === '23505' || dedupeError.message.includes('duplicate')) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error('[stripe] idempotency insert failed:', dedupeError.message);
    // Fail loudly so Stripe retries rather than silently skipping the update.
    return NextResponse.json({ error: 'Storage error' }, { status: 500 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = await resolveUserId(session.client_reference_id, session.customer);
        if (userId && session.subscription) {
          const subscription = await getStripe().subscriptions.retrieve(
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id
          );
          await applySubscription(userId, subscription);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userId = await resolveUserId(
          subscription.metadata?.supabase_user_id ?? null,
          subscription.customer
        );
        if (userId) await applySubscription(userId, subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = await resolveUserId(
          subscription.metadata?.supabase_user_id ?? null,
          subscription.customer
        );
        if (userId) await revokePlus(userId);
        break;
      }
    }
  } catch (error) {
    console.error(`[stripe] handling ${event.type} failed:`, error);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Maps a Stripe event to a Supabase user.
 *
 * Prefers the explicit reference we set at checkout, then falls back to the
 * stored customer id. Returns null rather than guessing — an unattributable
 * event must not mutate anyone's tier.
 */
async function resolveUserId(
  reference: string | null,
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): Promise<string | null> {
  if (reference) return reference;

  const customerId =
    typeof customer === 'string' ? customer : (customer?.id ?? null);
  if (!customerId) return null;

  const admin = createServiceClient();
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  return data?.id ?? null;
}

/** Grants or extends RedFlag+ based on the subscription's real state. */
async function applySubscription(
  userId: string,
  subscription: Stripe.Subscription
) {
  const admin = createServiceClient();

  // Only these states are actually paid-and-current.
  const isActive =
    subscription.status === 'active' || subscription.status === 'trialing';

  if (!isActive) {
    await revokePlus(userId);
    return;
  }

  // `plus_until` is the grace boundary: the tier degrades to verified after this
  // instant even if a cancellation webhook never arrives.
  const periodEnd = subscription.items.data[0]?.current_period_end;
  const plusUntil = periodEnd
    ? new Date(periodEnd * 1000).toISOString()
    : new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await admin
    .from('profiles')
    .update({
      tier: 'plus',
      stripe_subscription_id: subscription.id,
      stripe_customer_id:
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id,
      plus_until: plusUntil,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw new Error(`profile upgrade failed: ${error.message}`);
}

/** Drops to verified, never to anonymous — they still hold a real account. */
async function revokePlus(userId: string) {
  const admin = createServiceClient();
  const { error } = await admin
    .from('profiles')
    .update({
      tier: 'verified',
      plus_until: null,
      stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .eq('tier', 'plus');

  if (error) throw new Error(`profile downgrade failed: ${error.message}`);
}
