'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Crown, Smartphone } from 'lucide-react';
import { load } from '@cashfreepayments/cashfree-js';
import { startProSubscription } from '@/lib/actions/billing';
import { NeonButton } from '@/components/ui/neon';
import { env } from '@/lib/public-env';
import { PRO_PRICE_INR } from '@/lib/types';

/**
 * Starts a Cashfree subscription.
 *
 * The action only ever returns a checkout session id — it never grants the tier.
 * That happens in the webhook after HMAC verification, so a user who fakes their
 * way back to `/account?upgraded=1` gains nothing.
 *
 * A phone number is collected because Cashfree requires one to set up a UPI or
 * e-NACH mandate. It is sent to Cashfree and never stored by us.
 */
export function SubscribeButton() {
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function subscribe(formData: FormData) {
    startTransition(async () => {
      setErrors({});
      const result = await startProSubscription(formData);

      if (!result.ok || !result.sessionId) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        if (result.error) toast.error(result.error);
        return;
      }

      try {
        const cashfree = await load({ mode: env.cashfreeMode });
        // `_self` keeps the mandate flow in the same tab: a popup blocker
        // silently killing checkout is a worse failure than a full redirect.
        await cashfree.subscriptionsCheckout({
          subsSessionId: result.sessionId,
          redirectTarget: '_self',
        });
      } catch (error) {
        console.error('[billing] checkout SDK failed:', error);
        toast.error('Could not open checkout. Try again.');
      }
    });
  }

  return (
    <form action={subscribe} className="flex flex-col gap-3">
      <label htmlFor="phone" className="hud">
        Mobile number for the mandate
      </label>

      <div className="flex items-stretch gap-2">
        <span className="panel-sunk flex items-center gap-1.5 px-3.5 font-hud text-sm font-medium text-chalk-dim">
          <Smartphone className="size-4" strokeWidth={2.25} aria-hidden />
          +91
        </span>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={phone}
          onChange={(e) =>
            setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))
          }
          required
          placeholder="9876543210"
          aria-invalid={Boolean(errors.phone)}
          aria-describedby={errors.phone ? 'phone-error' : undefined}
          className="panel-sunk w-full p-3.5 font-hud text-base tracking-[0.08em] text-chalk outline-none transition-colors focus:border-judge"
        />
      </div>

      {errors.phone && (
        <p id="phone-error" className="text-xs font-medium text-flag-red">
          {errors.phone}
        </p>
      )}

      <NeonButton
        type="submit"
        variant="judge"
        disabled={isPending || phone.length !== 10}
      >
        <Crown className="size-4" strokeWidth={2.25} aria-hidden />
        {isPending
          ? 'Opening checkout…'
          : `Upgrade — \u20B9${PRO_PRICE_INR}/month`}
      </NeonButton>

      <p className="text-xs leading-relaxed text-chalk-faint">
        UPI, card, or net banking mandate via Cashfree. Cancel anytime from this
        page. A &#8377;1 authorisation is charged and refunded automatically.
      </p>
    </form>
  );
}
