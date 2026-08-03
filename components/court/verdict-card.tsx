import { Flame, Scale, Users, ShieldCheck, Quote } from 'lucide-react';
import { VerdictBadge, SplitBar, HeatBar, Rule, Chip } from '@/components/ui/neon';
import { formatCaseNo, voteSplit, compactCount, cn } from '@/lib/utils';
import {
  CATEGORY_LABELS,
  VERDICT_LABELS,
  PERSONA_LABELS,
  type CaseView,
} from '@/lib/types';

/**
 * Official Judicial Decree / Verdict Card.
 *
 * Styled as an official court decree with seal, pull quote, toxicity meter,
 * and jury breakdown.
 */
export function VerdictCard({ caseData }: { caseData: CaseView }) {
  const verdict = caseData.verdict;
  if (!verdict) return null;

  const split = voteSplit(caseData.redWeight, caseData.greenWeight);
  const ballots = caseData.redVotes + caseData.greenVotes;

  const tone =
    verdict.verdict === 'red'
      ? 'red'
      : verdict.verdict === 'green'
        ? 'green'
        : 'split';

  return (
    <article className="panel relative overflow-hidden px-6 py-8 sm:px-10 sm:py-10 rounded-[6px] border border-rule-strong shadow-xs">
      {/* Official Court Seal Header */}
      <div className="flex items-center justify-between border-b border-rule pb-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-[2px] bg-ink text-page">
            <Scale className="size-4" strokeWidth={2.2} />
          </div>
          <div>
            <p className="hud font-bold text-ink tracking-widest text-[11px]">THE OFFICIAL VERDICT</p>
            <p className="text-[11px] text-ink-muted">{formatCaseNo(caseData.publicId)} • {CATEGORY_LABELS[caseData.category]}</p>
          </div>
        </div>

        <Chip tone={tone === 'red' ? 'red' : tone === 'green' ? 'green' : 'split'} className="font-bold uppercase tracking-wider px-3 py-1">
          {VERDICT_LABELS[verdict.verdict]}
        </Chip>
      </div>

      {/* Case Headline */}
      <h1 className="mt-6 font-read text-[18px] sm:text-[20px] font-medium leading-snug text-ink-muted">
        {caseData.title}
      </h1>

      <Rule strong className="mt-6 mb-6" />

      {/* RULING STATEMENT */}
      <div className="relative">
        <p className="hud text-[11px] font-semibold text-ink-faint tracking-widest">THE COURT FINDS</p>

        <h2
          className={cn(
            'mt-2 animate-fade-up font-display text-[clamp(2.2rem,8vw,3.5rem)] font-bold leading-[1.02] tracking-[-0.035em]',
            tone === 'red' && 'text-verdict-red',
            tone === 'green' && 'text-verdict-green',
            tone === 'split' && 'text-verdict-split'
          )}
        >
          {verdict.headline}
        </h2>
      </div>

      {/* Judicial Roast Pull-Quote */}
      <div className="relative mt-7 rounded-[4px] bg-wash/80 p-5 sm:p-6 border-l-4 border-verdict-red">
        <Quote className="absolute right-4 top-4 size-6 text-rule-strong opacity-40" />
        <p className="font-read text-[17px] sm:text-[19px] italic leading-relaxed text-ink font-medium">
          &ldquo;{verdict.roast}&rdquo;
        </p>
      </div>

      {/* Jury Verdict Split Bar */}
      <div className="mt-8 pt-6 border-t border-rule">
        <div className="flex items-center justify-between mb-2 hud text-[11px]">
          <span className="font-bold text-verdict-red">{split.red}% RED FLAG</span>
          <span className="inline-flex items-center gap-1.5 font-medium text-ink-muted">
            <Users className="size-3.5" strokeWidth={2} />
            {compactCount(ballots)} JURORS VOTED
          </span>
          <span className="font-bold text-verdict-green">{split.green}% GREEN FLAG</span>
        </div>
        <SplitBar
          redPct={split.red}
          greenPct={split.green}
          hasVotes={split.hasVotes}
          className="h-2 rounded-full"
        />
      </div>

      {/* Toxicity & Presiding Judge Details */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-6 p-4 rounded-[4px] bg-sunk border border-rule/80">
        <div className="min-w-[160px] flex-1">
          <p className="hud inline-flex items-center gap-1.5 text-[11px] font-semibold text-heat">
            <Flame className="size-3.5" strokeWidth={2} />
            TOXICITY SCORE: {verdict.toxicity}/100
          </p>
          <HeatBar value={verdict.toxicity} className="mt-2 h-1.5 rounded-full" />
        </div>

        <div className="flex items-center gap-2">
          <span className="hud text-[10px] text-ink-faint">PRESIDING JUDGE:</span>
          <Chip tone="split" className="font-semibold">
            <Scale className="size-3 text-verdict-split" />
            {PERSONA_LABELS[caseData.persona]}
          </Chip>
        </div>
      </div>

      {verdict.summary && (
        <p className="mt-6 font-read text-[15px] italic leading-relaxed text-ink-muted">
          {verdict.summary}
        </p>
      )}

      <hr className="hairline mt-8 mb-4" />

      <p className="text-center font-display text-base font-bold tracking-tight text-ink-faint">
        RedFlag<span className="text-verdict-red">.gg</span> • Official Court Record
      </p>
    </article>
  );
}
