import Link from 'next/link';
import { Timer, Gavel, Flame, Users, ArrowUpRight } from 'lucide-react';
import { Chip, SplitBar, VerdictBadge, LiveDot } from '@/components/ui/neon';
import { formatCaseNo, voteSplit, compactCount, excerpt, cn } from '@/lib/utils';
import { CATEGORY_LABELS, VERDICT_LABELS, type CaseView } from '@/lib/types';

/**
 * Editorial Case Card.
 *
 * Designed as a high-contrast gazette entry teaser with a vote ratio gauge bar,
 * status badge, hover elevation, and clean typography.
 */
export function CaseCard({
  caseData,
  rank,
  remaining,
}: {
  caseData: CaseView;
  rank?: number;
  remaining?: string | null;
}) {
  const split = voteSplit(caseData.redWeight, caseData.greenWeight);
  const ballots = caseData.redVotes + caseData.greenVotes;
  const verdict = caseData.verdict;
  const isOpen = caseData.status === 'live' || caseData.status === 'judging';

  const tone =
    verdict?.verdict === 'red'
      ? 'red'
      : verdict?.verdict === 'green'
        ? 'green'
        : 'split';

  return (
    <Link
      href={`/case/${caseData.publicId}`}
      className={cn(
        'group relative block bg-surface p-6 rounded-[4px] border border-rule transition-all duration-200',
        'hover:border-rule-strong hover:shadow-md hover:-translate-y-0.5',
        verdict && tone === 'red' && 'edge-red',
        verdict && tone === 'green' && 'edge-green',
        verdict && tone === 'split' && 'edge-split'
      )}
    >
      {/* Header Metadata */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {rank !== undefined && (
            <span className="font-display text-xl font-bold leading-none text-verdict-red">
              #{rank}
            </span>
          )}
          <span className="hud font-semibold text-ink-muted">{formatCaseNo(caseData.publicId)}</span>
          <Chip>{CATEGORY_LABELS[caseData.category]}</Chip>
        </div>

        {isOpen ? (
          <span className="hud inline-flex items-center gap-1.5 font-semibold text-verdict-red bg-verdict-red-soft px-2.5 py-1 rounded-[2px]">
            <LiveDot />
            {caseData.status === 'judging' ? (
              'COURT JUDGING'
            ) : (
              <>
                <Timer className="size-3.5" strokeWidth={2} aria-hidden />
                {remaining ?? 'Closing soon'}
              </>
            )}
          </span>
        ) : (
          <span className="hud inline-flex items-center gap-1.5 text-ink-muted bg-wash px-2.5 py-1 rounded-[2px]">
            <Gavel className="size-3.5 text-verdict-split" strokeWidth={2} aria-hidden />
            VERDICT HANDED DOWN
          </span>
        )}
      </div>

      {/* Case Title */}
      <h2 className="mt-3.5 font-display text-[clamp(1.2rem,3.8vw,1.45rem)] font-bold leading-snug tracking-[-0.02em] text-ink group-hover:text-verdict-red transition-colors flex items-start justify-between gap-2">
        <span>{caseData.title}</span>
        <ArrowUpRight className="size-4 shrink-0 text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
      </h2>

      {/* Toxicity badge if notable */}
      {caseData.toxicity !== null && caseData.toxicity >= 60 && (
        <div className="mt-2 inline-flex items-center gap-1">
          <Chip tone="heat">
            <Flame className="size-3 fill-heat/20" strokeWidth={2} aria-hidden />
            Toxicity {caseData.toxicity}/100
          </Chip>
        </div>
      )}

      {/* Ruling excerpt or case excerpt */}
      {verdict ? (
        <div className="mt-4 p-3.5 rounded-[3px] bg-wash/60 border-l-2 border-verdict-red/40">
          <VerdictBadge tone={tone}>
            {VERDICT_LABELS[verdict.verdict]}
          </VerdictBadge>
          <p className="mt-1.5 font-read text-[14px] italic leading-relaxed text-ink-muted">
            &ldquo;{excerpt(verdict.roast, 130)}&rdquo;
          </p>
        </div>
      ) : (
        <p className="mt-3 font-read text-[15px] leading-relaxed text-ink-muted line-clamp-2">
          {excerpt(caseData.body, 140)}
        </p>
      )}

      {/* Jury split gauge */}
      <div className="mt-5 pt-4 border-t border-rule/60">
        <SplitBar
          redPct={split.red}
          greenPct={split.green}
          hasVotes={split.hasVotes}
          className="h-1.5 rounded-full"
        />
        <div className="mt-2 flex items-center justify-between hud text-[11px]">
          <span className="font-semibold text-verdict-red">
            {split.hasVotes ? `${split.red}% RED FLAG` : 'NO VOTES YET'}
          </span>
          <span className="inline-flex items-center gap-1 text-ink-muted">
            <Users className="size-3" strokeWidth={2} aria-hidden />
            {compactCount(ballots)} {ballots === 1 ? 'juror' : 'jurors'}
          </span>
          <span className="font-semibold text-verdict-green">
            {split.hasVotes ? `${split.green}% GREEN FLAG` : '—'}
          </span>
        </div>
      </div>
    </Link>
  );
}
