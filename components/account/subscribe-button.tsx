'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Crown } from 'lucide-react';
import { createCheckoutSession } from '@/lib/actions/billing';
import { BrutButton } from '@/components/ui/brut';

/**
 * Starts Stripe Checkout.
 *
 * The action only ever returns a URL — it never grants the tier. That happens in
 * the webhook after signature verification, so a user who fakes their way back
 * to `/account?upgraded=1` gains nothing.
 */
export function SubscribeButton() {
  const [isPending, startTransition] = useTransition();

  function subscribe() {
    startTransition(async () => {
      const result = await createCheckoutSession();
      if (!result.ok || !result.url) {
        toast.error(result.error ?? 'Could not start checkout.');
        return;
      }
      window.location.href = result.url;
    });
  }

  return (
    <BrutButton variant="judge" onClick={subscribe} disabled={isPending}>
      <Crown className="size-4" strokeWidth={2.75} aria-hidden />
      {isPending ? 'Opening checkout…' : 'Upgrade to RedFlag+'}
    </BrutButton>
  );
}
