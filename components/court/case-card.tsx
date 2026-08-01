import Link from 'next/link';
import { Timer, Gavel, Flame, Users } from 'lucide-react';
import { Chip, SplitBar, VerdictBadge, LiveDot } from '@/components/ui/neon';
import { formatCaseNo, voteSplit, compactCount, excerpt, cn } from '@/lib/utils';
import { CATEGORY_LABELS, VERDICT_LABELS, type CaseView } from '@/lib/types';

/**
 * One row on the docket.
 *
 * Two presentations from one component: an open case leads with the story and a
 * countdown, a closed case leads with the neon verdict. Keeping them together
 * means the feed never looks like two different products.
 *
 * The whole card is one link target — the feed is for scanning, the case page is
 * for deciding.
 */
export function CaseCard({
  caseData,
  rank,
  remaining,
}: {
  caseData: CaseView;
  /** 1-indexed position on the trending docket, if ranked. */
  rank?: number;
  /** Precomputed on the server so this stays a server component. */
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
        : 'judge';

  return (
    <Link
      href={`/case/${caseData.publicId}`}
      className={cn(
        'panel group relative block overflow-hidden p-5 transition-transform duration-200',
        'hover:-translate-y-0.5 active:scale-[0.995]',
        verdict && tone === 'red' && 'edge-red',
        verdict && tone === 'green' && 'edge-green',
        verdict && tone === 'judge' && 'edge-judge'
      )}
    >
      {/* Live cases get a slow scanline: "session in progress". */}
      {isOpen && <span className="scanline" />}

      {/* Header row */}
      <div className="relative flex items-start justify-between gap-3">
        <span className="flex items-center gap-2">
          {rank !== undefined && (
            <span className="flex size-6 items-center justify-center rounded-full bg-surface-3 font-hud text-[10px] font-bold text-chalk">
              {rank}
            </span>
          )}
          <span className="hud">{formatCaseNo(caseData.publicId)}</span>
        </span>

        {isOpen ? (
          <span className="flex items-center gap-1.5 font-hud text-[10px] font-medium uppercase tracking-[0.16em] text-flag-red">
            <LiveDot />
            {caseData.status === 'judging' ? (
              'judging'
            ) : (
              <>
                <Timer className="size-3" strokeWidth={2.5} aria-hidden />
                {remaining ?? 'closing'}
              </>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 font-hud text-[10px] font-medium uppercase tracking-[0.16em] text-chalk-faint">
            <Gavel className="size-3" strokeWidth={2.5} aria-hidden />
            ruled
          </span>
        )}
      </div>

      <div className="relative mt-3 flex flex-wrap items-center gap-2">
        <Chip>{CATEGORY_LABELS[caseData.category]}</Chip>
        {caseData.toxicity !== null && caseData.toxicity >= 70 && (
          <Chip tone="heat">
            <Flame className="size-3" strokeWidth={2.5} aria-hidden />
            {caseData.toxicity}
          </Chip>
        )}
      </div>

      <h2 className="relative mt-3 font-display text-[clamp(1.3rem,4.6vw,1.6rem)] font-bold leading-[1.06] tracking-[-0.035em] text-chalk">
        {caseData.title}
      </h2>

      {/* Closed cases lead with the ruling; open cases show the story. */}
      {verdict ? (
        <div className="relative mt-4">
          <VerdictBadge tone={tone}>
            {VERDICT_LABELS[verdict.verdict]}
          </VerdictBadge>
          <p className="mt-3 border-l-2 border-judge/50 pl-3 text-sm leading-relaxed text-chalk-dim">
            {excerpt(verdict.roast, 132)}
          </p>
        </div>
      ) : (
        <p className="relative mt-2.5 text-sm leading-relaxed text-chalk-dim">
          {excerpt(caseData.body, 152)}
        </p>
      )}

      {/* Jury split */}
      <div className="relative mt-5">
        <div className="mb-2 flex items-center justify-between font-hud text-[10px] font-medium uppercase tracking-[0.16em]">
          <span className="text-flag-red">
            {split.hasVotes ? `${split.red}%` : '—'}
          </span>
          <span className="flex items-center gap-1.5 text-chalk-faint">
            <Users className="size-3" strokeWidth={2.5} aria-hidden />
            {compactCount(ballots)}
          </span>
          <span className="text-flag-green">
            {split.hasVotes ? `${split.green}%` : '—'}
          </span>
        </div>
        <SplitBar
          redPct={split.red}
          greenPct={split.green}
          hasVotes={split.hasVotes}
        />
      </div>

      {/* Where the viewer stands */}
      {(caseData.myVote || caseData.isAuthor) && (
        <p className="relative mt-3 font-hud text-[10px] font-medium uppercase tracking-[0.16em] text-chalk-faint">
          {caseData.isAuthor
            ? 'your case'
            : `you voted ${caseData.myVote === 'red' ? 'red flag' : 'green flag'}`}
        </p>
      )}
    </Link>
  );
}
