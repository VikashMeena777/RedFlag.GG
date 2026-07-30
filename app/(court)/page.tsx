import type { Metadata } from 'next';
import Link from 'next/link';
import { Gavel, Flame, FilePlus2 } from 'lucide-react';
import { getDocket } from '@/lib/actions/cases';
import { CaseCard } from '@/components/court/case-card';
import { BrutCard, Stamp } from '@/components/ui/brut';

export const metadata: Metadata = {
  title: 'The Docket — cases awaiting judgment',
};

/**
 * The docket: home. Open cases first (they still need jurors), then recently
 * closed ones so a first-time visitor immediately sees what a verdict looks like.
 */
export default async function DocketPage() {
  const cases = await getDocket(20);
  const openCases = cases.filter((c) => c.status === 'in_session');

  return (
    <div className="court-container py-8 sm:py-12">
      {/* Hero */}
      <section className="mb-10">
        <p className="docket-label flex items-center gap-2">
          <span
            className="size-1.5 animate-pulse-live rounded-full bg-flag-red"
            aria-hidden
          />
          COURT IS IN SESSION
        </p>

        <h1 className="mt-3 text-[clamp(2.5rem,13vw,5rem)] leading-[0.9] text-ink">
          RED FLAG
          <br />
          <span className="text-flag-red">OR NOT?</span>
        </h1>

        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-soft">
          File your dating drama anonymously. The jury votes. The AI judge
          delivers a verdict and a roast you can screenshot.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/file"
            className="brut brut-shadow brut-press inline-flex items-center gap-2 bg-flag-red px-5 py-3 font-docket text-xs font-bold uppercase tracking-[0.12em] text-paper-bright"
          >
            <FilePlus2 className="size-4" strokeWidth={2.75} aria-hidden />
            File a case
          </Link>
          <Link
            href="/docket"
            className="brut brut-shadow brut-press inline-flex items-center gap-2 bg-highlighter px-5 py-3 font-docket text-xs font-bold uppercase tracking-[0.12em] text-ink"
          >
            <Flame className="size-4" strokeWidth={2.75} aria-hidden />
            Most toxic today
          </Link>
        </div>
      </section>

      {/* Feed */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl text-ink">The Docket</h2>
          {openCases.length > 0 && (
            <Stamp tone="red" straight className="text-[10px]">
              {openCases.length} open
            </Stamp>
          )}
        </div>

        {cases.length === 0 ? (
          <EmptyDocket />
        ) : (
          <div className="flex flex-col gap-5">
            {cases.map((caseData) => (
              <CaseCard key={caseData.id} caseData={caseData} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyDocket() {
  return (
    <BrutCard className="p-8 text-center">
      <Gavel
        className="mx-auto size-10 text-ink-faint"
        strokeWidth={2.75}
        aria-hidden
      />
      <h3 className="mt-4 text-2xl text-ink">No cases yet</h3>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-soft">
        The docket is empty. Someone has to go first — and the first case always
        gets the most jurors.
      </p>
      <Link
        href="/file"
        className="brut brut-shadow brut-press mt-5 inline-flex items-center gap-2 bg-flag-red px-5 py-3 font-docket text-xs font-bold uppercase tracking-[0.12em] text-paper-bright"
      >
        <FilePlus2 className="size-4" strokeWidth={2.75} aria-hidden />
        File the first case
      </Link>
    </BrutCard>
  );
}
