import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Timer, Gavel } from 'lucide-react';
import { getCase } from '@/lib/actions/cases';
import { getViewer } from '@/lib/auth/viewer';
import { JuryBox } from '@/components/court/jury-box';
import { VerdictCard } from '@/components/court/verdict-card';
import { ShareRow } from '@/components/court/share-row';
import { ReportButton } from '@/components/court/report-button';
import { BrutCard, Tape, DocketRule } from '@/components/ui/brut';
import { formatCaseNo, timeRemaining, excerpt } from '@/lib/utils';
import { CATEGORY_LABELS } from '@/lib/types';

/**
 * A single case file.
 *
 * Two states: in session (jury box) or closed (verdict card). `getCase` runs the
 * lazy gavel first, so a case past its deadline closes on read rather than
 * appearing frozen when cron has missed a window.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const caseData = await getCase(slug);

  if (!caseData) return { title: 'Case not found' };

  const verdict = caseData.verdict;
  const title = verdict
    ? `${verdict.headline} — ${formatCaseNo(caseData.caseNo)}`
    : `${formatCaseNo(caseData.caseNo)} — now in session`;

  const description = verdict
    ? excerpt(verdict.roast, 160)
    : excerpt(caseData.body, 160);

  return {
    title,
    description,
    // The image itself comes from the colocated opengraph-image.tsx.
    openGraph: { title, description, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function CasePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const caseData = await getCase(slug);
  if (!caseData) notFound();

  const viewer = await getViewer();
  const isOpen = caseData.status === 'in_session';
  const remaining = timeRemaining(caseData.closesAt);

  // Why a viewer might not be able to vote. Authors can never vote on their own.
  const voteDisabledReason = caseData.isAuthor
    ? 'This is your case. The jury decides this one.'
    : !viewer.isSignedIn
      ? 'Seating you as a juror…'
      : undefined;

  return (
    <div className="court-container py-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 font-docket text-[11px] font-bold tracking-[0.14em] text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="size-4" strokeWidth={2.75} aria-hidden />
        BACK TO DOCKET
      </Link>

      {isOpen ? (
        <>
          {/* ── Case file ─────────────────────────────────────────── */}
          <BrutCard className="p-5 sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <span className="font-docket text-[11px] font-bold tracking-[0.14em] text-ink">
                {formatCaseNo(caseData.caseNo)}
              </span>
              <span className="flex items-center gap-1.5 font-docket text-[11px] font-bold tracking-[0.12em] text-flag-red">
                <Timer className="size-3.5" strokeWidth={2.75} aria-hidden />
                {remaining ?? 'CLOSING'}
              </span>
            </div>

            <Tape className="mt-3">{CATEGORY_LABELS[caseData.category]}</Tape>

            <h1 className="mt-4 text-[clamp(1.75rem,7vw,2.5rem)] leading-[0.95] text-ink">
              {caseData.title}
            </h1>

            <DocketRule className="my-5" />

            <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
              {caseData.body}
            </div>

            <DocketRule className="my-6" />

            <JuryBox
              slug={caseData.slug}
              initialRedWeight={caseData.redWeight}
              initialGreenWeight={caseData.greenWeight}
              initialBallots={caseData.redVotes + caseData.greenVotes}
              initialVote={caseData.myVote}
              disabled={caseData.isAuthor || !viewer.isSignedIn}
              disabledReason={voteDisabledReason}
            />
          </BrutCard>

          <p className="mt-4 text-center font-docket text-[10px] font-bold tracking-[0.14em] text-ink-soft">
            THE GAVEL DROPS IN {remaining ?? 'MOMENTS'} — OR AT{' '}
            {caseData.redWeight + caseData.greenWeight}/100 VOTES
          </p>

          <div className="mt-6 flex justify-center">
            <ReportButton slug={caseData.slug} canFlag={viewer.canFlag} />
          </div>
        </>
      ) : (
        <>
          {/* ── Verdict ───────────────────────────────────────────── */}
          <VerdictCard caseData={caseData} />

          <div className="mt-5">
            <ShareRow
              slug={caseData.slug}
              headline={caseData.verdict?.headline ?? 'RedFlag.GG verdict'}
            />
          </div>

          {/* The original story, secondary now that the ruling is in */}
          <details className="brut mt-6 bg-paper-dim p-4">
            <summary className="cursor-pointer font-docket text-[11px] font-bold uppercase tracking-[0.14em] text-ink">
              Read the original case
            </summary>
            <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {caseData.body}
            </div>
          </details>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="brut brut-shadow brut-press inline-flex items-center gap-2 bg-highlighter px-5 py-3 font-docket text-xs font-bold uppercase tracking-[0.12em] text-ink"
            >
              <Gavel className="size-4" strokeWidth={2.75} aria-hidden />
              Judge another case
            </Link>
            <ReportButton slug={caseData.slug} canFlag={viewer.canFlag} />
          </div>
        </>
      )}
    </div>
  );
}
