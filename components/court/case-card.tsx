import Link from 'next/link';
import { Timer, Gavel, Flame, Users } from 'lucide-react';
import { Chip, SplitBar, VerdictBadge, LiveDot } from '@/components/ui/neon';
import { formatCaseNo, voteSplit, compactCount, excerpt, cn } from '@/lib/utils';
import { CATEGORY_LABELS, VERDICT_LABELS, type CaseView } from '@/lib/types';

/**
 * One entry in the record.
 *
 * Structured like an article teaser: metadata line, serif headline, standfirst,
 * then the jury data as a footnote. Two presentations from one component — an
 * open case leads with the story, a closed case leads with the ruling — so the
 * feed never looks like two different products.
 *
 * The whole entry is one link target: the feed is for scanning, the case page is
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
        : 'split';

  return (
    <Link
      href={`/case/${caseData.publicId}`}
      className={cn(
        'group block bg-surface px-5 py-6 transition-colors duration-150',
        'hover:bg-sunk',
        // Only ruled cases earn an accent rule; open ones stay neutral so the
        // eye lands on verdicts when scanning.
        verdict && tone === 'red' && 'edge-red',
        verdict && tone === 'green' && 'edge-green',
        verdict && tone === 'split' && 'edge-split'
      )}
    >
      {/* Metadata line */}
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5">
          {rank !== undefined && (
            <span className="font-display text-lg font-semibold leading-none text-verdict-red">
              {rank}
            </span>
          )}
          <span className="hud">{formatCaseNo(caseData.publicId)}</span>
        </span>

        {isOpen ? (
          <span className="hud inline-flex items-center gap-1.5 text-verdict-red">
            <LiveDot />
            {caseData.status === 'judging' ? (
              'Judging'
            ) : (
              <>
                <Timer className="size-3" strokeWidth={2} aria-hidden />
                {remaining ?? 'Closing'}
              </>
            )}
          </span>
        ) : (
          <span className="hud inline-flex items-center gap-1.5">
            <Gavel className="size-3" strokeWidth={2} aria-hidden />
            Ruled
          </span>
        )}
      </div>

      {/* Headline */}
      <h2 className="mt-2.5 font-display text-[clamp(1.25rem,4.2vw,1.5rem)] font-semibold leading-[1.12] tracking-[-0.022em] text-ink underline-offset-[3px] group-hover:underline">
        {caseData.title}
      </h2>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Chip>{CATEGORY_LABELS[caseData.category]}</Chip>
        {caseData.toxicity !== null && caseData.toxicity >= 70 && (
          <Chip tone="heat">
            <Flame className="size-3" strokeWidth={2} aria-hidden />
            {caseData.toxicity}
          </Chip>
        )}
      </div>

      {/* Closed cases lead with the ruling; open cases show the story. */}
      {verdict ? (
        <div className="mt-3.5">
          <VerdictBadge tone={tone}>
            {VERDICT_LABELS[verdict.verdict]}
          </VerdictBadge>
          <p className="mt-1.5 font-read text-[15px] italic leading-relaxed text-ink-muted">
            {excerpt(verdict.roast, 132)}
          </p>
        </div>
      ) : (
        <p className="mt-2.5 font-read text-[15px] leading-relaxed text-ink-muted">
          {excerpt(caseData.body, 152)}
        </p>
      )}

      {/* Jury data, as a footnote */}
      <div className="mt-4">
        <SplitBar
          redPct={split.red}
          greenPct={split.green}
          hasVotes={split.hasVotes}
        />
        <div className="mt-1.5 flex items-center justify-between hud">
          <span className="text-verdict-red">
            {split.hasVotes ? `${split.red}% red` : 'No votes'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-3" strokeWidth={2} aria-hidden />
            {compactCount(ballots)}
          </span>
          <span className="text-verdict-green">
            {split.hasVotes ? `${split.green}% green` : '—'}
          </span>
        </div>
      </div>

      {/* Where the viewer stands */}
      {(caseData.myVote || caseData.isAuthor) && (
        <p className="mt-3 hud">
          {caseData.isAuthor
            ? 'Your case'
            : `You voted ${caseData.myVote === 'red' ? 'red flag' : 'green flag'}`}
        </p>
      )}
    </Link>
  );
}
