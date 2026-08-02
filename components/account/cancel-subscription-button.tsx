'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { XCircle } from 'lucide-react';
import { cancelProSubscription } from '@/lib/actions/billing';
import { NeonButton } from '@/components/ui/neon';

/**
 * Cancels RedFlag Pro.
 *
 * Deliberately does not downgrade immediately — they paid for the current
 * period, so `pro_expires_at` continues to bound access and the webhook confirms
 * the final state. Requires a confirmation step because cancelling a mandate is
 * not something to trigger on a stray tap.
 */
export function CancelSubscriptionButton() {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="self-start text-xs font-medium text-ink-faint underline-offset-4 transition-colors hover:text-verdict-red hover:underline"
      >
        Cancel membership
      </button>
    );
  }

  return (
    <div className="panel-flat p-5">
      <p className="text-sm font-medium text-ink">
        Cancel RedFlag Pro? You keep access until the end of the period you have
        already paid for.
      </p>
      <div className="mt-4 flex flex-wrap gap-2.5">
        <NeonButton
          size="sm"
          variant="red"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await cancelProSubscription();
              if (!result.ok) {
                toast.error(result.error ?? 'Could not cancel.');
                return;
              }
              toast.success('Membership cancelled.');
              setConfirming(false);
            })
          }
        >
          <XCircle className="size-4" strokeWidth={2} aria-hidden />
          {isPending ? 'Cancelling…' : 'Confirm cancellation'}
        </NeonButton>
        <NeonButton size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Keep it
        </NeonButton>
      </div>
    </div>
  );
}
