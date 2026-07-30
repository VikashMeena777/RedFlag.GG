'use client';

import { useState, useTransition, useOptimistic } from 'react';
import { toast } from 'sonner';
import { Flag, Leaf } from 'lucide-react';
import { castVote } from '@/lib/actions/votes';
import { SplitBar } from '@/components/ui/brut';
import { cn, voteSplit, compactCount } from '@/lib/utils';
import type { VoteChoice } from '@/lib/types';

/**
 * The jury box: two oversized stamp buttons.
 *
 * Optimistic by design — a vote must feel instant or the loop dies. The server
 * returns authoritative weighted tallies and we reconcile; on failure we revert
 * and say why (already voted from this device, case closed, own case).
 *
 * Note the displayed percentages come from the *weighted* tally, which is what
 * the verdict and ranking use. Showing raw counts under a weighted bar would
 * misrepresent the split.
 */
export function JuryBox({
  slug,
  initialRedWeight,
  initialGreenWeight,
  initialBallots,
  initialVote,
  disabled,
  disabledReason,
}: {
  slug: string;
  initialRedWeight: number;
  initialGreenWeight: number;
  initialBallots: number;
  initialVote: VoteChoice | null;
  disabled?: boolean;
  disabledReason?: string;
}) {
  /*
   * Split is stored as percentages, not weights. The initial render derives them
   * from the weights passed in; after a vote the server hands back authoritative
   * percentages, which are stored directly. Keeping one representation avoids
   * converting an already-converted value.
   */
  const [split, setSplit] = useState(() =>
    voteSplit(initialRedWeight, initialGreenWeight)
  );
  const [ballots, setBallots] = useState(initialBallots);
  const [myVote, setMyVote] = useState<VoteChoice | null>(initialVote);
  const [isPending, startTransition] = useTransition();

  const [optimisticVote, applyOptimistic] = useOptimistic(
    myVote,
    (_prev, next: VoteChoice) => next
  );

  function vote(choice: VoteChoice) {
    if (disabled || isPending) return;
    if (myVote === choice) return; // Nothing to change.

    startTransition(async () => {
      applyOptimistic(choice);

      const result = await castVote(slug, choice);

      if (!result.ok) {
        toast.error(result.error ?? 'Could not record your vote.');
        return;
      }

      setMyVote(result.myVote ?? choice);
      if (result.tally) {
        // Server percentages are authoritative; store them as-is.
        setSplit({
          red: result.tally.redPct,
          green: result.tally.greenPct,
          total: result.tally.total,
          hasVotes: result.tally.total > 0,
        });
        setBallots(result.tally.total);
      }
      toast.success(
        choice === 'red' ? 'Logged: RED FLAG' : 'Logged: GREEN FLAG'
      );
    });
  }

  const shown = optimisticVote ?? myVote;

  return (
    <div className="flex flex-col gap-4">
      <p className="docket-label text-center">
        {disabled ? disabledReason : 'The jury is you. Cast your vote.'}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => vote('red')}
          disabled={disabled || isPending}
          aria-pressed={shown === 'red'}
          className={cn(
            'brut brut-press flex flex-col items-center gap-2 px-3 py-6 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            shown === 'red'
              ? 'brut-shadow-red bg-flag-red text-paper-bright'
              : 'brut-shadow bg-flag-red-lo text-flag-red hover:bg-flag-red hover:text-paper-bright'
          )}
        >
          <Flag className="size-7" strokeWidth={2.75} aria-hidden />
          <span className="font-display text-xl tracking-tight">RED FLAG</span>
          <span className="font-docket text-[10px] font-bold tracking-[0.14em]">
            {shown === 'red' ? 'YOUR VOTE' : 'RUN'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => vote('green')}
          disabled={disabled || isPending}
          aria-pressed={shown === 'green'}
          className={cn(
            'brut brut-press flex flex-col items-center gap-2 px-3 py-6 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            shown === 'green'
              ? 'brut-shadow-green bg-flag-green text-paper-bright'
              : 'brut-shadow bg-flag-green-lo text-flag-green hover:bg-flag-green hover:text-paper-bright'
          )}
        >
          <Leaf className="size-7" strokeWidth={2.75} aria-hidden />
          <span className="font-display text-xl tracking-tight">GREEN FLAG</span>
          <span className="font-docket text-[10px] font-bold tracking-[0.14em]">
            {shown === 'green' ? 'YOUR VOTE' : 'THEY GOOD'}
          </span>
        </button>
      </div>

      {/* Live split — only revealed once a vote exists, so the first juror
          isn't anchored by a meaningless 50/50. */}
      {split.hasVotes && (
        <div>
          <div className="mb-1.5 flex items-center justify-between font-docket text-[10px] font-bold tracking-[0.12em]">
            <span className="text-flag-red">{split.red}% RED</span>
            <span className="text-ink-soft">
              {compactCount(ballots)} JURORS
            </span>
            <span className="text-flag-green">{split.green}% GREEN</span>
          </div>
          <SplitBar
            redPct={split.red}
            greenPct={split.green}
            hasVotes
            animate
          />
        </div>
      )}
    </div>
  );
}
