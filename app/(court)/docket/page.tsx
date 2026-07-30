import type { Metadata } from 'next';
import Link from 'next/link';
import { Flame, Gavel } from 'lucide-react';
import { getMostToxic } from '@/lib/actions/cases';
import { BrutCard, Stamp, SplitBar, Tape } from '@/components/ui/brut';
import { formatCaseNo, voteSplit, compactCount, excerpt } from '@/lib/utils';
import { CATEGORY_LABELS } from '@/lib/types';

export const metadata: Metadata = {
  title: "Today's Most Toxic",
  description:
    'The most toxic cases the internet court ruled on in the last 24 hours, ranked.',
};

/**
 * Today's Most Toxic.
 *
 * Ranked by `heat` — AI toxicity scaled by log vote volume — so a 95-toxic case
 * with 800 jurors outranks a 98 with six. That weighting is why this page reads
 * as a genuine leaderboard rather than whatever the model scored highest.
 */
export default async function ToxicDocketPage() {
  const cases = await getMostToxic(10);

  return (
    <div className="court-container py-8 sm:py-12">
      <p className="docket-label flex items-center gap-2">
        <Flame className="size-4 text-flag-red" strokeWidth={2.75} aria-hidden />
        LAST 24 HOURS
      </p>

      <h1 className="mt-3 text-[clamp(2.25rem,11vw,4rem)] leading-[0.9] text-ink">
        MOST TOXIC
        <br />
        <span className="text-flag-red">STORIES</span>
      </h1>

      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-soft">
        Ranked by the judge&rsquo;s toxicity score, weighted by how many jurors
        showed up. Closed cases only.
      </p>

      {cases.length === 0 ? (
        <BrutCard className="mt-8 p-8 text-center">
          <Gavel
            className="mx-auto size-10 text-ink-faint"
            strokeWidth={2.75}
            aria-hidden
          />
          <h2 className="mt-4 text-2xl text-ink">No rulings yet today</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-soft">
            Cases need to close before they can be ranked. Check the docket for
            what the jury is still deciding.
          </p>
          <Link
            href="/"
            className="brut brut-shadow brut-press mt-5 inline-flex items-center gap-2 bg-highlighter px-5 py-3 font-docket text-xs font-bold uppercase tracking-[0.12em] text-ink"
          >
            Back to the docket
          </Link>
        </BrutCard>
      ) : (
        <ol className="mt-8 flex flex-col gap-4">
          {cases.map((caseData, index) => {
            const split = voteSplit(caseData.redWeight, caseData.greenWeight);
            const ballots = caseData.redVotes + caseData.greenVotes;
            const toxicity = caseData.verdict?.toxicity ?? caseData.toxicity ?? 0;

            return (
              <li key={caseData.id}>
                <BrutCard as="article" className="brut-hover-lift">
                  <Link
                    href={`/case/${caseData.slug}`}
                    className="flex gap-4 p-4 sm:p-5"
                  >
                    {/* Rank */}
                    <span
                      className="shrink-0 font-display text-[clamp(2.5rem,10vw,3.5rem)] leading-none text-ink-faint"
                      aria-label={`Rank ${index + 1}`}
                    >
                      {index + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-docket text-[10px] font-bold tracking-[0.14em] text-ink">
                          {formatCaseNo(caseData.caseNo)}
                        </span>
                        <Tape>{CATEGORY_LABELS[caseData.category]}</Tape>
                      </div>

                      <h2 className="mt-2 text-lg leading-tight text-ink sm:text-xl">
                        {caseData.title}
                      </h2>

                      {caseData.verdict && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <Stamp
                            straight
                            tone={
                              caseData.verdict.verdict === 'RED_FLAG'
                                ? 'red'
                                : caseData.verdict.verdict === 'GREEN_FLAG'
                                  ? 'green'
                                  : 'judge'
                            }
                            className="text-[10px]"
                          >
                            {caseData.verdict.verdict.replace('_', ' ')}
                          </Stamp>
                          <span className="font-display text-sm tracking-tight text-ink">
                            {caseData.verdict.headline}
                          </span>
                        </div>
                      )}

                      {caseData.verdict && (
                        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                          {excerpt(caseData.verdict.roast, 120)}
                        </p>
                      )}

                      {/* Toxicity meter */}
                      <div className="mt-3">
                        <div className="mb-1 flex items-center justify-between font-docket text-[10px] font-bold tracking-[0.12em]">
                          <span className="flex items-center gap-1 text-flag-red">
                            <Flame
                              className="size-3"
                              strokeWidth={2.75}
                              aria-hidden
                            />
                            TOXICITY {toxicity}
                          </span>
                          <span className="text-ink-soft">
                            {compactCount(ballots)} JURORS
                          </span>
                        </div>
                        <div
                          className="brut-thin h-3 bg-paper-dim"
                          role="img"
                          aria-label={`Toxicity ${toxicity} out of 100`}
                        >
                          <div
                            className="h-full bg-flag-red"
                            style={{ width: `${toxicity}%` }}
                          />
                        </div>
                      </div>

                      <SplitBar
                        redPct={split.red}
                        greenPct={split.green}
                        hasVotes={split.hasVotes}
                        className="mt-2 h-2.5"
                      />
                    </div>
                  </Link>
                </BrutCard>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
