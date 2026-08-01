/**
 * Ambient types for `@cashfreepayments/cashfree-js`.
 *
 * The package ships no `.d.ts`, so this declares the narrow surface we actually
 * use rather than pulling in `any`. Deliberately minimal: if we start using more
 * of the SDK, extend this instead of widening it.
 *
 * Reference: https://www.cashfree.com/docs/payments/online/checkout/subscriptions
 */
declare module '@cashfreepayments/cashfree-js' {
  export interface CashfreeLoadOptions {
    mode: 'sandbox' | 'production';
  }

  export interface SubscriptionsCheckoutOptions {
    /** `subscription_session_id` returned by the create-subscription API. */
    subsSessionId: string;
    /**
     * `_self` keeps the mandate flow in the same tab. `_blank` risks a popup
     * blocker silently killing checkout, and `_modal` renders an iframe which
     * our CSP `frame-src` must allow.
     */
    redirectTarget?: '_self' | '_blank' | '_top' | '_modal';
  }

  export interface CashfreeCheckoutResult {
    error?: { message?: string };
    redirect?: boolean;
    paymentDetails?: Record<string, unknown>;
  }

  export interface Cashfree {
    subscriptionsCheckout(
      options: SubscriptionsCheckoutOptions
    ): Promise<CashfreeCheckoutResult>;
    checkout(options: Record<string, unknown>): Promise<CashfreeCheckoutResult>;
  }

  export function load(options: CashfreeLoadOptions): Promise<Cashfree>;
}
