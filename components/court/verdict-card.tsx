import { Flame, Scale, Users } from 'lucide-react';
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
 * Set as a printed ruling rather than a UI card — heavy rule above the verdict,
 * the ruling itself as the largest thing on the page in the display serif, then
 * the roast as a pull-quote. At thumbnail size the *word* is what reads, which is
 * the whole point of the editorial direction.
 *
 * Mirrors lib/og/verdict-card.tsx so the on-screen version and the exported PNG
 * are recognisably the same object.
 *
 * Share controls deliberately live outside this component — nothing in here
 * should appear in a screenshot except the ruling itself.
 */
export function VerdictCard({ caseData }: { caseData: CaseView }) {
  const verdict = caseData.verdict;
  if (!verdict) return null;

  const split = voteSplit(caseData.redWeight, caseData.greenWeight);
  const ballots = caseData.redVotes + caseData.greenVotes;

  // `split` is a real outcome in this schema, not a failure mode.
  const tone =
    verdict.verdict === 'red'
      ? 'red'
      : verdict.verdict === 'green'
        ? 'green'
        : 'split';

  return (
    <article className="panel px-6 py-8 sm:px-9 sm:py-10">
      {/* Slug line */}
      <div className="flex items-center justify-between gap-3">
        <span className="hud">{formatCaseNo(caseData.publicId)}</span>
        <span className="hud">{CATEGORY_LABELS[caseData.category]}</span>
      </div>

      {/* The story under review, as a standfirst */}
      <h1 className="mt-5 font-read text-[17px] leading-snug text-ink-muted">
        {caseData.title}
      </h1>

      <Rule strong className="mt-7" />

      {/* The ruling */}
      <p className="mt-6 hud">The court finds</p>

      <h2
        className={cn(
          'mt-2 animate-fade-up font-display text-[clamp(2rem,8.5vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.03em]',
          tone === 'red' && 'text-verdict-red',
          tone === 'green' && 'text-verdict-green',
          tone === 'split' && 'text-verdict-split'
        )}
      >
        {verdict.headline}
      </h2>

      <div className="mt-3">
        <VerdictBadge tone={tone}>
          {VERDICT_LABELS[verdict.verdict]}
        </VerdictBadge>
      </div>

      {/* The roast — the quotable part, set as a pull-quote */}
      <blockquote className="pullquote mt-7 text-ink">
        {verdict.roast}
      </blockquote>

      <Rule className="my-8" />

      {/* Jury split */}
      <div>
        <SplitBar
          redPct={split.red}
          greenPct={split.green}
          hasVotes={split.hasVotes}
          className="h-1.5"
        />
        <div className="mt-2 flex items-center justify-between hud">
          <span className="text-verdict-red">
            {split.hasVotes ? `${split.red}% red flag` : 'No jury'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-3" strokeWidth={2} aria-hidden />
            {compactCount(ballots)} jurors
          </span>
          <span className="text-verdict-green">
            {split.hasVotes ? `${split.green}% green` : '—'}
          </span>
        </div>
      </div>

      {/* Footer: toxicity, judge, record */}
      <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0 flex-1">
          <p className="hud inline-flex items-center gap-1.5">
            <Flame className="size-3" strokeWidth={2} aria-hidden />
            Toxicity {verdict.toxicity}/100
          </p>
          <HeatBar value={verdict.toxicity} className="mt-2 max-w-[180px]" />
        </div>

        <Chip tone="split">
          <Scale className="size-3" strokeWidth={2} aria-hidden />
          {PERSONA_LABELS[caseData.persona]}
        </Chip>
      </div>

      {verdict.summary && (
        <p className="mt-6 font-read text-[15px] italic leading-relaxed text-ink-muted">
          {verdict.summary}
        </p>
      )}

      <Rule className="mt-8" />

      <p className="mt-4 text-center font-display text-base font-semibold tracking-[-0.025em] text-ink-faint">
        RedFlag<span className="text-verdict-red">.gg</span>
      </p>
    </article>
  );
}
