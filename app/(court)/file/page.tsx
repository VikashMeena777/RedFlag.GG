import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock, ShieldCheck } from 'lucide-react';
import {
  getViewer,
  FILE_BLOCKED_MESSAGES,
  type FileBlockedReason,
} from '@/lib/auth/viewer';
import { FileCaseForm } from '@/components/court/file-case-form';
import { Panel, Chip } from '@/components/ui/neon';
import { TIER_DAILY_FILINGS } from '@/lib/types';

export const metadata: Metadata = {
  title: 'File a case',
  description:
    'Bring your dating or friendship drama to the internet court. Anonymous to the public, verified account required.',
};

/**
 * Filing gate.
 *
 * This is where the trust-tier model becomes visible: voting is open to
 * everyone, but filing needs a verified account. The explanation matters — an
 * unexplained wall reads as a growth tactic, whereas the real reason (these
 * stories are about real people) is one most users accept.
 */
export default async function FileCasePage() {
  const viewer = await getViewer();

  if (!viewer.canFile) {
    return (
      <div className="court-container py-12">
        <VerificationWall reason={viewer.fileBlockedReason} />
      </div>
    );
  }

  const dailyLimit = TIER_DAILY_FILINGS[viewer.tier];

  return (
    <div className="court-container py-10 sm:py-14">
      <p className="hud">New filing</p>
      <h1 className="mt-3 font-display text-[clamp(2.2rem,10vw,3.4rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">
        <span className="chrome">State your</span>{' '}
        <span className="text-flag-red glow-red">case</span>
      </h1>
      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-chalk-dim">
        Your name is never shown. Write it like you are telling a friend, then
        let the jury decide.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Chip tone="green">
          <ShieldCheck className="size-3" strokeWidth={2.5} aria-hidden />
          Verified filer
        </Chip>
        <Chip tone={Number.isFinite(dailyLimit) ? 'neutral' : 'pro'}>
          {Number.isFinite(dailyLimit)
            ? `${dailyLimit} cases per day`
            : 'Unlimited · Pro'}
        </Chip>
      </div>

      <div className="mt-10">
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
    <Panel className="p-7 sm:p-9">
      <span className="flex size-14 items-center justify-center rounded-full bg-surface-3">
        <Lock className="size-6 text-chalk-faint" strokeWidth={2} aria-hidden />
      </span>

      <h1 className="mt-6 font-display text-[clamp(1.8rem,7vw,2.4rem)] font-extrabold leading-[0.98] tracking-[-0.045em] text-chalk">
        Verify to file
      </h1>

      <p className="mt-4 text-[15px] leading-relaxed text-chalk">{message}</p>

      {/* The reasoning, not just the rule — an unexplained wall reads as a
          growth tactic. */}
      <div className="mt-6 border-l-2 border-judge/60 pl-4">
        <p className="text-sm leading-relaxed text-chalk-dim">
          Voting stays anonymous and always will. Filing is different: these
          stories are about real people who never agreed to appear here, so the
          court keeps a record of who filed what. Your identity is never shown to
          anyone reading the case.
        </p>
      </div>

      {isFixable && (
        <Link href="/account" className="pill pill-red mt-7 px-5 py-3 text-sm">
          <ShieldCheck className="size-4" strokeWidth={2.5} aria-hidden />
          Verify my account
        </Link>
      )}

      <p className="mt-6 text-xs text-chalk-faint">
        Want to keep browsing?{' '}
        <Link href="/" className="text-judge underline-offset-4 hover:underline">
          Back to the docket
        </Link>
      </p>
    </Panel>
  );
}
