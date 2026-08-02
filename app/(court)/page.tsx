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
        <p className="hud flex items-center gap-2 text-verdict-red">
          <LiveDot />
          Court is in session
        </p>

        <h1 className="mt-4 font-display text-[clamp(2.6rem,12vw,4.4rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
          <span className="text-ink">Red flag</span>
          <br />
          <span className="text-verdict-red">or not?</span>
        </h1>

        <p className="mt-5 max-w-md font-read text-[17px] leading-relaxed text-ink-muted">
          Drop your dating drama anonymously. The jury votes. Our AI judge hands
          down a verdict and a roast you can screenshot.
        </p>

        <div className="mt-7 flex flex-wrap gap-2.5">
          <Link href="/file" className="pill pill-red px-5 py-3 text-sm">
            <PenLine className="size-4" strokeWidth={2} aria-hidden />
            File a case
          </Link>
          <Link href="/docket" className="pill pill-outline px-5 py-3 text-sm">
            <Flame className="size-4" strokeWidth={2} aria-hidden />
            Most toxic today
          </Link>
        </div>
      </section>

      {/* Feed */}
      <section className="mt-14">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
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
      <span className="mx-auto flex size-14 items-center justify-center rounded-[3px] bg-wash">
        <Gavel className="size-6 text-ink-faint" strokeWidth={2} aria-hidden />
      </span>
      <h3 className="mt-5 font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
        Nothing on the docket
      </h3>
      <p className="mx-auto mt-2 max-w-xs font-read text-[15px] leading-relaxed text-ink-muted">
        Someone has to go first — and the first case always pulls the biggest
        jury.
      </p>
      <Link
        href="/file"
        className="pill pill-red mx-auto mt-6 px-5 py-3 text-sm"
      >
        <PenLine className="size-4" strokeWidth={2} aria-hidden />
        File the first case
      </Link>
    </Panel>
  );
}
