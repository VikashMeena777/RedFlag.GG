import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, Crown, Vote } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/auth/viewer';
import { VerifyForm } from '@/components/account/verify-form';
import { SubscribeButton } from '@/components/account/subscribe-button';
import { BrutCard, DocketRule, Stamp } from '@/components/ui/brut';
import { TIER_DAILY_FILINGS, TIER_VOTE_WEIGHT } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Account',
  description: 'Verify your account to file cases, or upgrade to RedFlag+.',
};

/**
 * Account page: verification and subscription.
 *
 * Deliberately shows the tier ladder, because the value of verifying has to be
 * legible before anyone will do it.
 */
export default async function AccountPage() {
  const viewer = await getViewer();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.is_anonymous ? null : (user?.email ?? null);

  return (
    <div className="court-container py-8 sm:py-12">
      <p className="docket-label">Your standing</p>
      <h1 className="mt-2 text-[clamp(2rem,9vw,3.25rem)] leading-[0.92] text-ink">
        ACCOUNT
      </h1>

      {/* Current tier */}
      <BrutCard className="mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="docket-label">Current tier</p>
            <p className="mt-1 font-display text-2xl tracking-tight text-ink">
              {viewer.isPlus
                ? 'REDFLAG+'
                : viewer.isVerified
                  ? 'VERIFIED'
                  : 'ANONYMOUS JUROR'}
            </p>
          </div>
          {viewer.isPlus ? (
            <Stamp tone="judge" className="text-[11px]">
              <Crown className="size-3.5" strokeWidth={2.75} aria-hidden />
              PLUS
            </Stamp>
          ) : viewer.isVerified ? (
            <Stamp tone="green" className="text-[11px]">
              <ShieldCheck className="size-3.5" strokeWidth={2.75} aria-hidden />
              VERIFIED
            </Stamp>
          ) : (
            <Stamp tone="ink" className="text-[11px]">
              <Vote className="size-3.5" strokeWidth={2.75} aria-hidden />
              JUROR
            </Stamp>
          )}
        </div>

        <DocketRule className="my-4" />

        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="docket-label">Vote weight</dt>
            <dd className="mt-0.5 font-display text-xl text-ink">
              {TIER_VOTE_WEIGHT[viewer.tier]}×
            </dd>
          </div>
          <div>
            <dt className="docket-label">Cases per day</dt>
            <dd className="mt-0.5 font-display text-xl text-ink">
              {Number.isFinite(TIER_DAILY_FILINGS[viewer.tier])
                ? TIER_DAILY_FILINGS[viewer.tier]
                : '∞'}
            </dd>
          </div>
        </dl>

        {viewer.strikes > 0 && (
          <p className="mt-4 border-l-[6px] border-flag-red pl-3 text-xs leading-relaxed text-ink">
            {viewer.strikes} of your cases have been removed. Filing is disabled
            after 3.
          </p>
        )}
      </BrutCard>

      {/* Verification */}
      <BrutCard className="mt-5 p-5">
        <h2 className="text-xl text-ink">
          {viewer.isVerified ? 'Verification' : 'Verify to file cases'}
        </h2>
        <DocketRule className="my-4" />
        <VerifyForm signedInEmail={email} />
      </BrutCard>

      {/* RedFlag+ */}
      <BrutCard className="mt-5 p-5">
        <div className="flex items-center gap-2">
          <Crown className="size-5 text-judge" strokeWidth={2.75} aria-hidden />
          <h2 className="text-xl text-ink">RedFlag+</h2>
        </div>
        <DocketRule className="my-4" />

        <ul className="mb-5 space-y-2 text-sm leading-relaxed text-ink">
          <li>· Unlimited case filings</li>
          <li>· Priority placement on the docket</li>
          <li>· Exclusive verdict card themes</li>
          <li>· Appeal a verdict once per case</li>
          <li>· No ads, ever</li>
        </ul>

        {viewer.isPlus ? (
          <p className="text-sm font-medium text-flag-green">
            You are on RedFlag+. Thanks for funding the court.
          </p>
        ) : viewer.isVerified ? (
          <SubscribeButton />
        ) : (
          <p className="text-sm leading-relaxed text-ink-soft">
            Verify your account first, then you can subscribe.
          </p>
        )}
      </BrutCard>

      <p className="mt-6 text-xs text-ink-faint">
        <Link href="/rules" className="underline hover:text-ink">
          Court rules and privacy
        </Link>
      </p>
    </div>
  );
}
