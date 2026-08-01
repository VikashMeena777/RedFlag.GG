import { Gavel, Flame, Users, Scale } from 'lucide-react';
import { VerdictBadge, SplitBar, HeatBar, Rule, Chip } from '@/components/ui/neon';
import { formatCaseNo, voteSplit, compactCount, cn } from '@/lib/utils';
import {
  CATEGORY_LABELS,
  VERDICT_LABELS,
  PERSONA_LABELS,
  type CaseView,
} from '@/lib/types';

/**
 * The verdict card: the shareable unit.
 *
 * Mirrors lib/og/verdict-card.tsx so the on-screen version and the exported PNG
 * read as the same object.
 *
 * The share controls deliberately live outside this component — nothing in here
 * should appear in a screenshot except the ruling itself.
 */
export function VerdictCard({ caseData }: { caseData: CaseView }) {
  const verdict = caseData.verdict;
  if (!verdict) return null;

  const split = voteSplit(caseData.redWeight, caseData.greenWeight);
  const ballots = caseData.redVotes + caseData.greenVotes;

  // `split` is a real verdict in this schema, not a failure mode, so it gets the
  // judge's own cyan rather than error styling.
  const tone =
    verdict.verdict === 'red'
      ? 'red'
      : verdict.verdict === 'green'
        ? 'green'
        : 'judge';

  return (
    <article
      className={cn(
        'panel relative overflow-hidden p-6 sm:p-8',
        tone === 'red' && 'edge-red',
        tone === 'green' && 'edge-green',
        tone === 'judge' && 'edge-judge'
      )}
    >
      {/* Verdict-coloured bloom behind the ruling. */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-24 left-1/2 h-56 w-[130%] -translate-x-1/2 rounded-full opacity-25 blur-3xl',
          tone === 'red' && 'bg-flag-red',
          tone === 'green' && 'bg-flag-green',
          tone === 'judge' && 'bg-judge'
        )}
      />

      {/* Header */}
      <div className="relative flex items-start justify-between gap-3">
        <span className="hud">{formatCaseNo(caseData.publicId)}</span>
        <span className="hud">
          {CATEGORY_LABELS[caseData.category]}
        </span>
      </div>

      {/* The story under review */}
      <h1 className="relative mt-5 text-base font-semibold leading-snug text-chalk-dim sm:text-lg">
        {caseData.title}
      </h1>

      {/* The ruling */}
      <p className="relative mt-7 font-hud text-[10px] font-medium uppercase tracking-[0.22em] text-chalk-faint">
        The court finds
      </p>

      <h2
        className={cn(
          'relative mt-2 animate-verdict-in font-display text-[clamp(2rem,9vw,3.4rem)] font-extrabold leading-[0.95] tracking-[-0.045em]',
          tone === 'red' && 'text-flag-red glow-red',
          tone === 'green' && 'text-flag-green glow-green',
          tone === 'judge' && 'text-judge glow-judge'
        )}
      >
        {verdict.headline}
      </h2>

      <div className="relative mt-4">
        <VerdictBadge tone={tone} animate>
          <Gavel className="size-3.5" strokeWidth={2.5} aria-hidden />
          {VERDICT_LABELS[verdict.verdict]}
        </VerdictBadge>
      </div>

      {/* The roast — the quotable part */}
      <blockquote className="panel-sunk relative mt-6 p-4 text-[15px] leading-relaxed text-chalk sm:text-base">
        {verdict.roast}
      </blockquote>

      <Rule className="relative my-7" />

      {/* Jury split */}
      <div className="relative">
        <div className="mb-2 flex items-center justify-between font-hud text-[10px] font-medium uppercase tracking-[0.16em]">
          <span className="text-flag-red">
            {split.hasVotes ? `${split.red}% red` : 'no jury'}
          </span>
          <span className="flex items-center gap-1.5 text-chalk-faint">
            <Users className="size-3" strokeWidth={2.5} aria-hidden />
            {compactCount(ballots)} jurors
          </span>
          <span className="text-flag-green">
            {split.hasVotes ? `${split.green}% green` : '—'}
          </span>
        </div>
        <SplitBar
          redPct={split.red}
          greenPct={split.green}
          hasVotes={split.hasVotes}
          className="h-3"
        />
      </div>

      {/* Footer: toxicity + record + which judge heard it */}
      <div className="relative mt-7 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-hud text-[10px] font-medium uppercase tracking-[0.2em] text-chalk-faint">
            <Flame className="size-3" strokeWidth={2.5} aria-hidden />
            Toxicity {verdict.toxicity}/100
          </p>
          <HeatBar value={verdict.toxicity} className="mt-2 max-w-[180px]" />
        </div>

        <Chip tone="judge">
          <Scale className="size-3" strokeWidth={2.5} aria-hidden />
          {PERSONA_LABELS[caseData.persona]}
        </Chip>
      </div>

      {verdict.summary && (
        <p className="relative mt-5 text-sm font-medium text-chalk-dim">
          {verdict.summary}
        </p>
      )}

      <p className="chrome relative mt-6 text-center font-display text-base font-bold tracking-[-0.04em]">
        RedFlag.gg
      </p>
    </article>
  );
}
