import type { Metadata } from 'next';
import Link from 'next/link';
import { Gavel, Flame, PenLine } from 'lucide-react';
import { getDocket } from '@/lib/actions/cases';
import { CaseCard } from '@/components/court/case-card';
import { Panel, Chip, LiveDot } from '@/components/ui/neon';
import { timeRemaining } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'The Docket — cases awaiting judgment',
};

/**
 * The docket: home.
 *
 * Open cases first (they still need jurors), then recently closed ones so a
 * first-time visitor immediately sees what a verdict looks like.
 */
export default async function DocketPage() {
  const cases = await getDocket(20);
  const openCases = cases.filter((c) => c.isOpen);

  return (
    <div className="court-container py-10 sm:py-14">
      {/* Hero */}
      <section className="relative">
        <p className="flex items-center gap-2 font-hud text-[10px] font-medium uppercase tracking-[0.2em] text-flag-red">
          <LiveDot />
          Court is in session
        </p>

        <h1 className="mt-4 font-display text-[clamp(2.6rem,12vw,4.4rem)] font-extrabold leading-[0.94] tracking-[-0.05em]">
          <span className="chrome">Red flag</span>
          <br />
          <span className="text-flag-red glow-red">or not?</span>
        </h1>

        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-chalk-dim">
          Drop your dating drama anonymously. The jury votes. Our AI judge hands
          down a verdict and a roast you can screenshot.
        </p>

        <div className="mt-7 flex flex-wrap gap-2.5">
          <Link href="/file" className="pill pill-red px-5 py-3 text-sm">
            <PenLine className="size-4" strokeWidth={2.5} aria-hidden />
            File a case
          </Link>
          <Link href="/docket" className="pill pill-glass px-5 py-3 text-sm">
            <Flame className="size-4" strokeWidth={2.25} aria-hidden />
            Most toxic today
          </Link>
        </div>
      </section>

      {/* Feed */}
      <section className="mt-14">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold tracking-[-0.04em] text-chalk">
            The docket
          </h2>
          {openCases.length > 0 && (
            <Chip tone="red">
              <LiveDot />
              {openCases.length} open
            </Chip>
          )}
        </div>

        {cases.length === 0 ? (
          <EmptyDocket />
        ) : (
          <div className="flex flex-col gap-4">
            {cases.map((caseData) => (
              <CaseCard
                key={caseData.id}
                caseData={caseData}
                // Computed server-side so the countdown is consistent across the
                // whole feed and the card stays a server component.
                remaining={timeRemaining(caseData.closesAt)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyDocket() {
  return (
    <Panel className="p-10 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-surface-3">
        <Gavel className="size-6 text-chalk-faint" strokeWidth={2} aria-hidden />
      </span>
      <h3 className="mt-5 font-display text-2xl font-bold tracking-[-0.04em] text-chalk">
        Nothing on the docket
      </h3>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-chalk-dim">
        Someone has to go first — and the first case always pulls the biggest
        jury.
      </p>
      <Link
        href="/file"
        className="pill pill-red mx-auto mt-6 px-5 py-3 text-sm"
      >
        <PenLine className="size-4" strokeWidth={2.5} aria-hidden />
        File the first case
      </Link>
    </Panel>
  );
}
