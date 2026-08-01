import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Timer, Gavel, Scale } from 'lucide-react';
import { getCase } from '@/lib/actions/cases';
import { getViewer } from '@/lib/auth/viewer';
import { JuryBox } from '@/components/court/jury-box';
import { VerdictCard } from '@/components/court/verdict-card';
import { ShareRow } from '@/components/court/share-row';
import { ReportButton } from '@/components/court/report-button';
import { Panel, Chip, Rule, LiveDot } from '@/components/ui/neon';
import { formatCaseNo, timeRemaining, excerpt } from '@/lib/utils';
import { CATEGORY_LABELS, PERSONA_LABELS, VOTE_TARGET } from '@/lib/types';

/**
 * A single case file.
 *
 * Two states: open (jury box) or closed (verdict card). `getCase` runs the lazy
 * gavel first, so a case past its deadline closes on read rather than appearing
 * frozen when cron has missed a window.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ caseId: string }>;
}): Promise<Metadata> {
  const { caseId } = await params;
  const caseData = await getCase(caseId);

  if (!caseData) return { title: 'Case not found' };

  const verdict = caseData.verdict;
  const title = verdict
    ? `${verdict.headline} — ${formatCaseNo(caseData.publicId)}`
    : `${formatCaseNo(caseData.publicId)} — now in session`;

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
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) notFound();

  const viewer = await getViewer();
  const remaining = timeRemaining(caseData.closesAt);
  const weightedTotal = caseData.redWeight + caseData.greenWeight;

  // Why a viewer might not be able to vote. Authors never vote on their own case.
  const voteDisabledReason = caseData.isAuthor
    ? 'This is your case. The jury decides this one.'
    : !viewer.isSignedIn
      ? 'Seating you as a juror…'
      : undefined;

  return (
    <div className="court-container py-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-chalk-dim transition-colors hover:text-judge"
      >
        <ArrowLeft className="size-4" strokeWidth={2.25} aria-hidden />
        Back to docket
      </Link>

      {caseData.isOpen ? (
        <>
          {/* ── Case file ─────────────────────────────────────────── */}
          <Panel className="relative overflow-hidden p-6 sm:p-8">
            {/* Slow scanline: session in progress. */}
            <span className="scanline" />

            <div className="relative flex items-start justify-between gap-3">
              <span className="hud">{formatCaseNo(caseData.publicId)}</span>
              <span className="flex items-center gap-1.5 font-hud text-[10px] font-medium uppercase tracking-[0.16em] text-flag-red">
                {caseData.status === 'judging' ? (
                  <>
                    <LiveDot tone="judge" />
                    judging
                  </>
                ) : (
                  <>
                    <Timer className="size-3" strokeWidth={2.5} aria-hidden />
                    {remaining ?? 'closing'}
                  </>
                )}
              </span>
            </div>

            <div className="relative mt-4 flex flex-wrap items-center gap-2">
              <Chip>{CATEGORY_LABELS[caseData.category]}</Chip>
              <Chip tone="judge">
                <Scale className="size-3" strokeWidth={2.5} aria-hidden />
                {PERSONA_LABELS[caseData.persona]}
              </Chip>
            </div>

            <h1 className="relative mt-4 font-display text-[clamp(1.7rem,6.5vw,2.4rem)] font-extrabold leading-[1] tracking-[-0.045em] text-chalk">
              {caseData.title}
            </h1>

            <Rule className="relative my-6" />

            <div className="relative whitespace-pre-wrap text-[15px] leading-relaxed text-chalk">
              {caseData.body}
            </div>

            <Rule className="relative my-7" />

            {caseData.status === 'judging' ? (
              <p className="relative text-center font-hud text-[11px] font-medium uppercase tracking-[0.18em] text-judge glow-judge">
                The judge is writing the verdict…
              </p>
            ) : (
              <div className="relative">
                <JuryBox
                  caseId={caseData.publicId}
                  initialRedWeight={caseData.redWeight}
                  initialGreenWeight={caseData.greenWeight}
                  initialBallots={caseData.redVotes + caseData.greenVotes}
                  initialVote={caseData.myVote}
                  disabled={caseData.isAuthor || !viewer.isSignedIn}
                  disabledReason={voteDisabledReason}
                />
              </div>
            )}
          </Panel>

          <p className="mt-5 text-center font-hud text-[10px] font-medium uppercase tracking-[0.16em] text-chalk-faint">
            Gavel drops in {remaining ?? 'moments'} · {weightedTotal}/
            {VOTE_TARGET} weighted votes
          </p>

          <div className="mt-6 flex justify-center">
            <ReportButton
              caseId={caseData.publicId}
              canReport={viewer.canReport}
            />
          </div>
        </>
      ) : (
        <>
          {/* ── Verdict ───────────────────────────────────────────── */}
          <VerdictCard caseData={caseData} />

          <div className="mt-6">
            <ShareRow
              caseId={caseData.publicId}
              headline={caseData.verdict?.headline ?? 'RedFlag.gg verdict'}
            />
          </div>

          {/* The original story, secondary now that the ruling is in. */}
          <details className="panel-flat group mt-6 p-5">
            <summary className="cursor-pointer text-sm font-semibold text-chalk-dim transition-colors marker:text-judge hover:text-chalk">
              Read the original case
            </summary>
            <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-chalk">
              {caseData.body}
            </div>
          </details>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
            <Link href="/" className="pill pill-glass px-5 py-3 text-sm">
              <Gavel className="size-4" strokeWidth={2.25} aria-hidden />
              Judge another case
            </Link>
            <ReportButton
              caseId={caseData.publicId}
              canReport={viewer.canReport}
            />
          </div>
        </>
      )}
    </div>
  );
}
