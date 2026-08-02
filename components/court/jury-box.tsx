'use client';

import { useState, useTransition, useOptimistic } from 'react';
import { toast } from 'sonner';
import { Flag, Leaf, Check } from 'lucide-react';
import { castVote } from '@/lib/actions/votes';
import { SplitBar } from '@/components/ui/neon';
import { cn, voteSplit, compactCount } from '@/lib/utils';
import type { VoteChoice } from '@/lib/types';

/**
 * The jury box: a ballot, not a game controller.
 *
 * Two bordered choices side by side, restrained until picked — a selected ballot
 * fills with its verdict colour and shows a tick. The difference has to be
 * unmistakable, because "did my vote register?" is the one question this UI must
 * never leave open.
 *
 * Optimistic by design — a vote must feel instant or the loop dies. The server
 * returns authoritative weighted tallies and we reconcile; on failure we revert
 * and say why (already voted from this device, case closed, own case).
 *
 * Displayed percentages come from the *weighted* tally, which is what the verdict
 * and ranking use. Showing raw counts under a weighted bar would misrepresent it.
 */
export function JuryBox({
  caseId,
  initialRedWeight,
  initialGreenWeight,
  initialBallots,
  initialVote,
  disabled,
  disabledReason,
}: {
  /** `public_id`, e.g. "CASE-7421". */
  caseId: string;
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
   * percentages, stored directly. One representation avoids double-converting.
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

      const result = await castVote(caseId, choice);

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
      toast.success(choice === 'red' ? 'Logged: red flag' : 'Logged: green flag');
    });
  }

  const shown = optimisticVote ?? myVote;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-center font-read text-[15px] italic text-ink-muted">
        {disabled ? disabledReason : 'You are the jury. Return a verdict.'}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Ballot
          tone="red"
          label="Red flag"
          icon={<Flag className="size-5" strokeWidth={2} aria-hidden />}
          selected={shown === 'red'}
          disabled={disabled || isPending}
          onClick={() => vote('red')}
        />
        <Ballot
          tone="green"
          label="Green flag"
          icon={<Leaf className="size-5" strokeWidth={2} aria-hidden />}
          selected={shown === 'green'}
          disabled={disabled || isPending}
          onClick={() => vote('green')}
        />
      </div>

      {/* Live split — revealed only once a vote exists, so the first juror is
          not anchored by a meaningless 50/50. */}
      {split.hasVotes && (
        <div>
          <SplitBar
            redPct={split.red}
            greenPct={split.green}
            hasVotes
            animate
            className="h-1.5"
          />
          <div className="mt-2 flex items-center justify-between hud">
            <span className="text-verdict-red">{split.red}% red</span>
            <span>{compactCount(ballots)} jurors</span>
            <span className="text-verdict-green">{split.green}% green</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One side of the ballot.
 *
 * Unselected is a plain bordered box with a coloured label; selected fills with
 * the verdict colour. No scale transform or shadow — the fill and the tick carry
 * the state, which keeps the interaction legible without breaking the editorial
 * register.
 */
function Ballot({
  tone,
  label,
  icon,
  selected,
  disabled,
  onClick,
}: {
  tone: 'red' | 'green';
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-[3px] border px-3 py-6',
        'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45',
        selected
          ? tone === 'red'
            ? 'border-verdict-red bg-verdict-red text-white'
            : 'border-verdict-green bg-verdict-green text-white'
          : tone === 'red'
            ? 'border-rule-strong bg-surface text-verdict-red hover:border-verdict-red hover:bg-verdict-red-soft'
            : 'border-rule-strong bg-surface text-verdict-green hover:border-verdict-green hover:bg-verdict-green-soft'
      )}
    >
      {selected ? (
        <Check className="size-5" strokeWidth={2.5} aria-hidden />
      ) : (
        icon
      )}
      <span className="font-display text-base font-semibold tracking-[-0.02em]">
        {label}
      </span>
      <span
        className={cn(
          'text-[11px] font-medium uppercase tracking-[0.1em]',
          selected ? 'opacity-80' : 'text-ink-faint'
        )}
      >
        {selected ? 'Your verdict' : 'Cast'}
      </span>
    </button>
  );
}
