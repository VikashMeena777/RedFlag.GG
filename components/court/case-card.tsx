import Link from 'next/link';
import { Timer, Gavel, Users } from 'lucide-react';
import { BrutCard, Tape, Stamp, SplitBar } from '@/components/ui/brut';
import {
  formatCaseNo,
  voteSplit,
  timeRemaining,
  excerpt,
  compactCount,
} from '@/lib/utils';
import { CATEGORY_LABELS, type CaseView } from '@/lib/types';

/**
 * A case as it appears on the docket: a manila file with a countdown, an excerpt,
 * and the live jury split. Whole card is one link target — the feed is for
 * scanning, the case page is for deciding.
 */
export function CaseCard({ caseData }: { caseData: CaseView }) {
  const split = voteSplit(caseData.redWeight, caseData.greenWeight);
  const remaining = timeRemaining(caseData.closesAt);
  const isOpen = caseData.status === 'in_session';
  const verdict = caseData.verdict;

  return (
    <BrutCard as="article" className="brut-hover-lift relative">
      <Link href={`/case/${caseData.slug}`} className="block p-4 sm:p-5">
        {/* Header row */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <span className="font-docket text-[11px] font-bold tracking-[0.14em] text-ink">
            {formatCaseNo(caseData.caseNo)}
          </span>

          {isOpen ? (
            <span className="flex items-center gap-1.5 font-docket text-[11px] font-bold tracking-[0.12em] text-flag-red">
              <Timer className="size-3.5" strokeWidth={2.75} aria-hidden />
              {remaining ?? 'CLOSING'}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 font-docket text-[11px] font-bold tracking-[0.12em] text-ink-soft">
              <Gavel className="size-3.5" strokeWidth={2.75} aria-hidden />
              CLOSED
            </span>
          )}
        </div>

        <Tape className="mb-3">{CATEGORY_LABELS[caseData.category]}</Tape>

        <h2 className="mt-2 text-xl leading-tight text-ink sm:text-2xl">
          {caseData.title}
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {excerpt(caseData.body, 168)}
        </p>

        {/* Verdict headline for closed cases — the reason to click a decided case */}
        {!isOpen && verdict && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Stamp
              tone={
                verdict.verdict === 'RED_FLAG'
                  ? 'red'
                  : verdict.verdict === 'GREEN_FLAG'
                    ? 'green'
                    : 'judge'
              }
            >
              {verdict.verdict.replace('_', ' ')}
            </Stamp>
            <span className="font-display text-base tracking-tight text-ink">
              {verdict.headline}
            </span>
          </div>
        )}

        {/* Jury split */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between font-docket text-[10px] font-bold tracking-[0.12em]">
            <span className="text-flag-red">
              {split.hasVotes ? `${split.red}% RED` : 'NO VOTES YET'}
            </span>
            <span className="flex items-center gap-1 text-ink-soft">
              <Users className="size-3" strokeWidth={2.75} aria-hidden />
              {compactCount(caseData.redVotes + caseData.greenVotes)}
            </span>
            <span className="text-flag-green">
              {split.hasVotes ? `${split.green}% GREEN` : ''}
            </span>
          </div>
          <SplitBar
            redPct={split.red}
            greenPct={split.green}
            hasVotes={split.hasVotes}
            className="h-4"
          />
        </div>

        {/* The viewer's own ballot */}
        {caseData.myVote && (
          <p className="mt-2.5 font-docket text-[10px] font-bold tracking-[0.12em] text-ink-soft">
            YOU VOTED {caseData.myVote === 'red' ? 'RED FLAG' : 'GREEN FLAG'}
          </p>
        )}
        {caseData.isAuthor && (
          <p className="mt-2.5 font-docket text-[10px] font-bold tracking-[0.12em] text-judge">
            YOUR CASE
          </p>
        )}
      </Link>
    </BrutCard>
  );
}
