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
    <div className="court-container py-10">
      <Link
        href="/"
        className="mb-7 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
      >
        <ArrowLeft className="size-3.5" strokeWidth={2} aria-hidden />
        Back to the record
      </Link>

      {caseData.isOpen ? (
        <>
          {/* ── Case file ─────────────────────────────────────────── */}
          <Panel className="px-6 py-8 sm:px-9 sm:py-10">
            {/* Slug line */}
            <div className="flex items-center justify-between gap-3">
              <span className="hud">{formatCaseNo(caseData.publicId)}</span>
              <span className="hud inline-flex items-center gap-1.5 text-verdict-red">
                {caseData.status === 'judging' ? (
                  <>
                    <LiveDot tone="split" />
                    Judging
                  </>
                ) : (
                  <>
                    <Timer className="size-3" strokeWidth={2} aria-hidden />
                    {remaining ?? 'Closing'}
                  </>
                )}
              </span>
            </div>

            {/* Headline first, metadata beneath — article order. */}
            <h1 className="mt-4 font-display text-[clamp(1.6rem,6vw,2.25rem)] font-semibold leading-[1.08] tracking-[-0.026em] text-ink">
              {caseData.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Chip>{CATEGORY_LABELS[caseData.category]}</Chip>
              <Chip tone="split">
                <Scale className="size-3" strokeWidth={2} aria-hidden />
                {PERSONA_LABELS[caseData.persona]}
              </Chip>
            </div>

            <Rule className="my-7" />

            {/*
              The story itself, set as an article: reading serif, generous
              leading, and a drop cap on the opening letter. This is the one place
              the case body gets full editorial treatment.
            */}
            <div className="prose-case dropcap whitespace-pre-wrap">
              {caseData.body}
            </div>

            <Rule strong className="my-8" />

            {caseData.status === 'judging' ? (
              <p className="text-center font-read text-[15px] italic text-verdict-split">
                The judge is writing the verdict…
              </p>
            ) : (
              <JuryBox
                caseId={caseData.publicId}
                initialRedWeight={caseData.redWeight}
                initialGreenWeight={caseData.greenWeight}
                initialBallots={caseData.redVotes + caseData.greenVotes}
                initialVote={caseData.myVote}
                disabled={caseData.isAuthor || !viewer.isSignedIn}
                disabledReason={voteDisabledReason}
              />
            )}
          </Panel>

          <p className="mt-5 text-center hud">
            Gavel drops in {remaining ?? 'moments'} · {weightedTotal}/
            {VOTE_TARGET} weighted votes
          </p>

          <div className="mt-7 flex justify-center">
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
          <details className="panel-flat mt-7 border border-rule p-5">
            <summary className="cursor-pointer text-sm font-medium text-ink-muted transition-colors marker:text-verdict-red hover:text-ink">
              Read the original filing
            </summary>
            <div className="prose-case mt-5 whitespace-pre-wrap">
              {caseData.body}
            </div>
          </details>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <Link href="/" className="pill pill-outline px-4 py-2 text-sm">
              <Gavel className="size-3.5" strokeWidth={2} aria-hidden />
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
