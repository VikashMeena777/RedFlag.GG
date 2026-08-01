'use client';

import { useState, useTransition, useOptimistic } from 'react';
import { toast } from 'sonner';
import { Flag, Sparkles } from 'lucide-react';
import { castVote } from '@/lib/actions/votes';
import { SplitBar } from '@/components/ui/neon';
import { cn, voteSplit, compactCount } from '@/lib/utils';
import type { VoteChoice } from '@/lib/types';

/**
 * The jury box: two oversized neon choices.
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
    <div className="flex flex-col gap-4">
      <p className="text-center text-sm font-medium text-chalk-dim">
        {disabled ? disabledReason : 'You are the jury. Call it.'}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <VoteChoiceButton
          tone="red"
          label="Red flag"
          sublabel={shown === 'red' ? 'your call' : 'run'}
          icon={<Flag className="size-6" strokeWidth={2.25} aria-hidden />}
          selected={shown === 'red'}
          disabled={disabled || isPending}
          onClick={() => vote('red')}
        />
        <VoteChoiceButton
          tone="green"
          label="Green flag"
          sublabel={shown === 'green' ? 'your call' : 'they good'}
          icon={<Sparkles className="size-6" strokeWidth={2.25} aria-hidden />}
          selected={shown === 'green'}
          disabled={disabled || isPending}
          onClick={() => vote('green')}
        />
      </div>

      {/* Live split — revealed only once a vote exists, so the first juror is
          not anchored by a meaningless 50/50. */}
      {split.hasVotes && (
        <div>
          <div className="mb-2 flex items-center justify-between font-hud text-[10px] font-medium uppercase tracking-[0.16em]">
            <span className="text-flag-red">{split.red}% red</span>
            <span className="text-chalk-faint">
              {compactCount(ballots)} jurors
            </span>
            <span className="text-flag-green">{split.green}% green</span>
          </div>
          <SplitBar
            redPct={split.red}
            greenPct={split.green}
            hasVotes
            animate
            className="h-3"
          />
        </div>
      )}
    </div>
  );
}

/**
 * One side of the jury box.
 *
 * Unselected is a glass tile with a coloured icon; selected floods with the neon
 * and drops a matching bloom. The difference has to be obvious at a glance,
 * because "did my vote register?" is the one question this UI must never leave open.
 */
function VoteChoiceButton({
  tone,
  label,
  sublabel,
  icon,
  selected,
  disabled,
  onClick,
}: {
  tone: 'red' | 'green';
  label: string;
  sublabel: string;
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
        'group flex flex-col items-center gap-2 rounded-[var(--radius-card)] px-3 py-6',
        'border transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45',
        'active:scale-[0.97]',
        selected
          ? tone === 'red'
            ? 'border-flag-red/70 bg-flag-red text-[#1a0009] shadow-[0_8px_32px_-8px_var(--color-flag-red)]'
            : 'border-flag-green/70 bg-flag-green text-[#101a00] shadow-[0_8px_32px_-8px_var(--color-flag-green)]'
          : tone === 'red'
            ? 'border-line bg-flag-red-deep/40 text-flag-red hover:border-flag-red/60 hover:bg-flag-red-deep'
            : 'border-line bg-flag-green-deep/40 text-flag-green hover:border-flag-green/60 hover:bg-flag-green-deep'
      )}
    >
      {icon}
      <span className="font-display text-lg font-bold tracking-[-0.03em]">
        {label}
      </span>
      <span className="font-hud text-[9px] font-medium uppercase tracking-[0.18em] opacity-80">
        {sublabel}
      </span>
    </button>
  );
}
