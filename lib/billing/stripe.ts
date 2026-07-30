import 'server-only';
import Stripe from 'stripe';
import { serverEnv } from '@/lib/env';

/**
 * Stripe client.
 *
 * Lazily constructed so importing this module does not throw when Stripe is
 * unconfigured (local dev without billing).
 */
let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  stripe ??= new Stripe(serverEnv.stripeSecretKey, {
    apiVersion: '2025-10-29.clover',
    typescript: true,
  });
  return stripe;
}

export const PLUS_PRICE_LOOKUP = 'redflag_plus_monthly';
