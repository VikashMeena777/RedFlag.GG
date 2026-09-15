'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Crown } from 'lucide-react';
import { load } from '@cashfreepayments/cashfree-js';
import { startProCheckout } from '@/lib/actions/billing';
import { NeonButton } from '@/components/ui/neon';
import { PRO_PRICE_INR, PRO_DURATION_DAYS } from '@/lib/types';

/**
 * Starts the Cashfree Payment Gateway checkout.
 *
 * The action only ever returns a payment session id — it never grants the
 * tier. That happens after payment confirmation, so a user who fakes their way
 * to the success page gains nothing.
 *
 * No data is collected here beyond what the verified account already holds:
 * the email goes to Cashfree with the order; a phone number is neither asked
 * for nor stored.
 *
 * `mode` arrives as a prop from the server component — there is exactly one
 * Cashfree env var (CASHFREE_ENV, server-side), so the browser SDK can never
 * be pointed at a different environment than the API calls.
 */
export function SubscribeButton({ mode }: { mode: 'sandbox' | 'production' }) {
  const [isPending, startTransition] = useTransition();

  function pay() {
    startTransition(async () => {
      const result = await startProCheckout();

      if (!result.ok || !result.sessionId) {
        toast.error(result.error ?? 'Could not start checkout.');
        return;
      }

      try {
        const cashfree = await load({ mode });
        // `_self` keeps the payment in the same tab: a popup blocker silently
        // killing checkout is a worse failure than a full redirect.
        await cashfree.checkout({
          paymentSessionId: result.sessionId,
          redirectTarget: '_self',
        });
      } catch (error) {
        console.error('[billing] checkout SDK failed:', error);
        toast.error('Could not open checkout. Try again.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <NeonButton
        type="button"
        variant="ink"
        disabled={isPending}
        onClick={pay}
        className="self-start px-6"
      >
        <Crown className="size-4" strokeWidth={2} aria-hidden />
        {isPending
          ? 'Opening checkout…'
          : `Get Pro — \u20B9${PRO_PRICE_INR} for ${PRO_DURATION_DAYS} days`}
      </NeonButton>

      <p className="text-xs leading-relaxed text-ink-faint">
        One-time payment via UPI, card, or net banking. No auto-renewal, no
        mandate, no phone number — when it ends, pay again only if you want to.
      </p>
    </div>
  );
}
