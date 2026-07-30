import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock, ShieldCheck } from 'lucide-react';
import {
  getViewer,
  FILE_BLOCKED_MESSAGES,
  type FileBlockedReason,
} from '@/lib/auth/viewer';
import { FileCaseForm } from '@/components/court/file-case-form';
import { BrutCard } from '@/components/ui/brut';
import { TIER_DAILY_FILINGS } from '@/lib/types';

export const metadata: Metadata = {
  title: 'File a case',
  description:
    'Bring your dating or friendship drama to the internet court. Anonymous to the public, verified account required.',
};

/**
 * Filing gate.
 *
 * This is the page where the trust-tier model is visible to users: voting is
 * open to everyone, but filing needs a verified account. The explanation matters
 * — an unexplained wall reads as a growth tactic, whereas the real reason (these
 * stories are about real people) is one most users accept.
 */
export default async function FileCasePage() {
  const viewer = await getViewer();

  if (!viewer.canFile) {
    return (
      <div className="court-container py-10">
        <VerificationWall reason={viewer.fileBlockedReason} />
      </div>
    );
  }

  const dailyLimit = TIER_DAILY_FILINGS[viewer.tier];

  return (
    <div className="court-container py-8 sm:py-12">
      <p className="docket-label">New filing</p>
      <h1 className="mt-2 text-[clamp(2rem,9vw,3.25rem)] leading-[0.92] text-ink">
        STATE YOUR
        <br />
        <span className="text-flag-red">CASE</span>
      </h1>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-soft">
        Your name is never shown. Write it like you are telling a friend, then let
        the jury decide.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 bg-flag-green-lo px-2.5 py-1 font-docket text-[10px] font-bold tracking-[0.12em] text-flag-green">
          <ShieldCheck className="size-3.5" strokeWidth={2.75} aria-hidden />
          VERIFIED FILER
        </span>
        <span className="font-docket text-[10px] font-bold tracking-[0.12em] text-ink-soft">
          {Number.isFinite(dailyLimit)
            ? `${dailyLimit} CASES PER DAY`
            : 'UNLIMITED FILINGS · PLUS'}
        </span>
      </div>

      <div className="mt-8">
        <FileCaseForm />
      </div>
    </div>
  );
}

function VerificationWall({ reason }: { reason: FileBlockedReason | null }) {
  const message = reason
    ? FILE_BLOCKED_MESSAGES[reason]
    : 'You cannot file a case right now.';

  const isFixable = reason === 'not_signed_in' || reason === 'not_verified';

  return (
    <BrutCard className="p-6 sm:p-8">
      <Lock className="size-9 text-ink-faint" strokeWidth={2.75} aria-hidden />
      <h1 className="mt-4 text-[clamp(1.75rem,7vw,2.5rem)] leading-[0.95] text-ink">
        VERIFY TO FILE
      </h1>

      <p className="mt-3 text-[15px] leading-relaxed text-ink">{message}</p>

      <div className="mt-5 border-l-[6px] border-judge pl-4">
        <p className="text-sm leading-relaxed text-ink-soft">
          Voting stays anonymous and always will. Filing is different: these
          stories are about real people who never agreed to appear here, so the
          court keeps a record of who filed what. Your identity is never shown to
          anyone reading the case.
        </p>
      </div>

      {isFixable && (
        <Link
          href="/account"
          className="brut brut-shadow brut-press mt-6 inline-flex items-center gap-2 bg-flag-red px-5 py-3 font-docket text-xs font-bold uppercase tracking-[0.12em] text-paper-bright"
        >
          <ShieldCheck className="size-4" strokeWidth={2.75} aria-hidden />
          Verify my account
        </Link>
      )}

      <p className="mt-5 text-xs text-ink-faint">
        Want to keep browsing?{' '}
        <Link href="/" className="underline hover:text-ink">
          Back to the docket
        </Link>
      </p>
    </BrutCard>
  );
}
