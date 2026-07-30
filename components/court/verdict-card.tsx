import { Gavel, Flame } from 'lucide-react';
import { Stamp, SplitBar, DocketRule } from '@/components/ui/brut';
import { formatCaseNo, voteSplit, compactCount } from '@/lib/utils';
import { CATEGORY_LABELS, type CaseView } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * The verdict card: the shareable unit.
 *
 * Mirrors lib/og/verdict-card.tsx so the on-screen version and the exported PNG
 * read as the same object. Fixed 4:5-ish proportions on mobile, because that is
 * what a story crop expects.
 *
 * The share controls deliberately live outside this component — nothing in here
 * should appear in a screenshot except the ruling itself.
 */
export function VerdictCard({ caseData }: { caseData: CaseView }) {
  const verdict = caseData.verdict;
  if (!verdict) return null;

  const split = voteSplit(caseData.redWeight, caseData.greenWeight);
  const ballots = caseData.redVotes + caseData.greenVotes;

  const tone =
    verdict.verdict === 'RED_FLAG'
      ? 'red'
      : verdict.verdict === 'GREEN_FLAG'
        ? 'green'
        : 'judge';

  return (
    <article
      className={cn(
        'brut brut-shadow-lg halftone relative bg-paper-bright p-5 sm:p-7',
        tone === 'red' && 'shadow-flag-red',
        tone === 'green' && 'shadow-flag-green'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <span className="font-docket text-[11px] font-bold tracking-[0.14em] text-ink">
          {formatCaseNo(caseData.caseNo)}
        </span>
        <span className="font-docket text-[11px] font-bold tracking-[0.14em] text-ink-soft">
          {CATEGORY_LABELS[caseData.category].toUpperCase()}
        </span>
      </div>

      <div className="mt-3 h-[3px] bg-ink" />

      {/* The story under review */}
      <h1 className="mt-4 font-sans text-base font-semibold leading-snug text-ink-soft sm:text-lg">
        {caseData.title}
      </h1>

      {/* The ruling */}
      <p className="mt-6 font-docket text-[11px] font-bold tracking-[0.16em] text-ink-soft">
        THE COURT FINDS
      </p>

      <h2 className="mt-2 font-display text-[clamp(2.25rem,11vw,4rem)] leading-[0.92] tracking-tight text-ink">
        {verdict.headline}
      </h2>

      <div className="mt-4">
        <Stamp tone={tone} className="animate-stamp-in text-sm">
          <Gavel className="size-4" strokeWidth={2.75} aria-hidden />
          {verdict.verdict.replace('_', ' ')}
        </Stamp>
      </div>

      {/* The roast — the quotable part */}
      <blockquote className="mt-6 border-l-[6px] border-judge pl-4 text-[15px] leading-relaxed text-ink sm:text-base">
        {verdict.roast}
      </blockquote>

      <DocketRule className="my-6" />

      {/* Jury split */}
      <div>
        <div className="mb-1.5 flex items-center justify-between font-docket text-[10px] font-bold tracking-[0.12em]">
          <span className="text-flag-red">
            {split.hasVotes ? `${split.red}% RED` : 'NO JURY'}
          </span>
          <span className="text-ink-soft">{compactCount(ballots)} JURORS</span>
          <span className="text-flag-green">
            {split.hasVotes ? `${split.green}% GREEN` : '—'}
          </span>
        </div>
        <SplitBar
          redPct={split.red}
          greenPct={split.green}
          hasVotes={split.hasVotes}
        />
      </div>

      {/* Footer: sentence + toxicity */}
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-docket text-[10px] font-bold tracking-[0.16em] text-ink-soft">
            SENTENCE
          </p>
          <p className="mt-0.5 font-display text-xl tracking-tight text-ink">
            {verdict.sentence}
          </p>
        </div>

        <div className="text-right">
          <p className="flex items-center justify-end gap-1 font-docket text-[10px] font-bold tracking-[0.16em] text-ink-soft">
            <Flame className="size-3" strokeWidth={2.75} aria-hidden />
            TOXICITY
          </p>
          <p className="mt-0.5 font-display text-xl tracking-tight text-ink">
            {verdict.toxicity}/100
          </p>
        </div>
      </div>

      <p className="mt-5 text-center font-display text-lg tracking-tight text-ink-faint">
        REDFLAG.GG
      </p>
    </article>
  );
}
