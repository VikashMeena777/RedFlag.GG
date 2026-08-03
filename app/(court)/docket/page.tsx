import type { Metadata } from 'next';
import Link from 'next/link';
import { Flame, Gavel } from 'lucide-react';
import { getMostToxic } from '@/lib/actions/cases';
import { CaseCard } from '@/components/court/case-card';
import { Panel } from '@/components/ui/neon';
import { timeRemaining } from '@/lib/utils';

export const metadata: Metadata = {
  title: "Today's Most Toxic",
  description:
    'The most toxic cases the internet court ruled on in the last 24 hours, ranked.',
};

/**
 * Today's Most Toxic.
 *
 * Ranked by `heat` — AI toxicity scaled by log vote volume — so a 95-toxic case
 * with 800 jurors outranks a 98 with six. That weighting is why this reads as a
 * genuine leaderboard rather than whatever the model happened to score highest.
 */
export default async function ToxicDocketPage() {
  const cases = await getMostToxic(10);

  return (
    <div className="court-container py-10 sm:py-14">
      <p className="hud flex items-center gap-2 text-heat">
        <Flame className="size-3.5" strokeWidth={2} aria-hidden />
        Last 24 hours
      </p>

      <h1 className="mt-4 font-display text-[clamp(2.4rem,11vw,3.8rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
        <span className="text-ink">Most toxic</span>
        <br />
        <span className="text-verdict-red">stories</span>
      </h1>

      <p className="mt-5 max-w-md font-read text-[17px] leading-relaxed text-ink-muted">
        Ranked by the judge&rsquo;s toxicity score, weighted by how many jurors
        showed up. Closed cases only.
      </p>

      {cases.length === 0 ? (
        <Panel className="mt-10 p-10 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-[3px] bg-wash">
            <Gavel
              className="size-6 text-ink-faint"
              strokeWidth={2}
              aria-hidden
            />
          </span>
          <h2 className="mt-5 font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            No rulings yet today
          </h2>
          <p className="mx-auto mt-2 max-w-xs font-read text-[15px] leading-relaxed text-ink-muted">
            Cases need to close before they can be ranked. Check the docket for
            what the jury is still deciding.
          </p>
          <Link href="/" className="pill pill-outline mx-auto mt-6 px-5 py-3 text-sm">
            Back to the docket
          </Link>
        </Panel>
      ) : (
        <ol className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-5">
          {cases.map((caseData, index) => (
            <li key={caseData.id}>
              <CaseCard
                caseData={caseData}
                rank={index + 1}
                remaining={timeRemaining(caseData.closesAt)}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
