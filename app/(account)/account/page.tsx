import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, Crown, Vote } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/auth/viewer';
import { syncSubscriptionStatus } from '@/lib/actions/billing';
import { VerifyForm } from '@/components/account/verify-form';
import { SubscribeButton } from '@/components/account/subscribe-button';
import { CancelSubscriptionButton } from '@/components/account/cancel-subscription-button';
import { Panel, Chip, Rule } from '@/components/ui/neon';
import { TIER_DAILY_FILINGS, TIER_VOTE_WEIGHT, PRO_PRICE_INR } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Account',
  description: 'Verify your account to file cases, or upgrade to RedFlag Pro.',
};

/**
 * Account page: verification and subscription.
 *
 * Deliberately shows the tier ladder, because the value of verifying has to be
 * legible before anyone will do it.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const { upgraded } = await searchParams;

  /*
   * Reconcile after returning from Cashfree checkout. The webhook is the source
   * of truth, but it can land seconds after the redirect — without this the page
   * would briefly show "not subscribed" to someone who just paid.
   */
  if (upgraded === '1') {
    await syncSubscriptionStatus();
  }

  const viewer = await getViewer();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.is_anonymous ? null : (user?.email ?? null);
  const dailyLimit = TIER_DAILY_FILINGS[viewer.tier];

  return (
    <div className="court-container py-10 sm:py-14">
      <p className="hud">Your standing</p>
      <h1 className="mt-3 font-display text-[clamp(2.2rem,10vw,3.4rem)] font-extrabold leading-[0.95] tracking-[-0.05em]">
        <span className="chrome">Account</span>
      </h1>

      {/* Current tier */}
      <Panel tone={viewer.isPro ? 'pro' : 'neutral'} className="mt-8 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="hud">Current tier</p>
            <p className="mt-1.5 font-display text-2xl font-bold tracking-[-0.04em] text-chalk">
              {viewer.isPro
                ? 'RedFlag Pro'
                : viewer.isVerified
                  ? 'Verified'
                  : 'Anonymous juror'}
            </p>
          </div>

          {viewer.isPro ? (
            <Chip tone="pro">
              <Crown className="size-3" strokeWidth={2.5} aria-hidden />
              Pro
            </Chip>
          ) : viewer.isVerified ? (
            <Chip tone="green">
              <ShieldCheck className="size-3" strokeWidth={2.5} aria-hidden />
              Verified
            </Chip>
          ) : (
            <Chip>
              <Vote className="size-3" strokeWidth={2.5} aria-hidden />
              Juror
            </Chip>
          )}
        </div>

        <Rule className="my-5" />

        <dl className="grid grid-cols-2 gap-5">
          <div>
            <dt className="hud">Vote weight</dt>
            <dd className="mt-1 font-display text-xl font-bold text-judge">
              {TIER_VOTE_WEIGHT[viewer.tier]}&times;
            </dd>
          </div>
          <div>
            <dt className="hud">Cases per day</dt>
            <dd className="mt-1 font-display text-xl font-bold text-chalk">
              {Number.isFinite(dailyLimit) ? dailyLimit : '∞'}
            </dd>
          </div>
        </dl>

        {viewer.strikes > 0 && (
          <p className="mt-5 border-l-2 border-flag-red pl-3 text-xs leading-relaxed text-chalk-dim">
            {viewer.strikes} of your cases have been removed. Filing is disabled
            after 3.
          </p>
        )}
      </Panel>

      {/* Verification */}
      <Panel className="mt-4 p-6">
        <h2 className="font-display text-xl font-bold tracking-[-0.035em] text-chalk">
          {viewer.isVerified ? 'Verification' : 'Verify to file cases'}
        </h2>
        <Rule className="my-5" />
        <VerifyForm signedInEmail={email} />
      </Panel>

      {/* RedFlag Pro */}
      <Panel className="mt-4 p-6">
        <div className="flex items-center gap-2.5">
          <Crown className="size-5 text-pro" strokeWidth={2.25} aria-hidden />
          <h2 className="font-display text-xl font-bold tracking-[-0.035em] text-chalk">
            RedFlag Pro
          </h2>
        </div>
        <Rule className="my-5" />

        <ul className="mb-6 space-y-2.5 text-sm leading-relaxed text-chalk-dim">
          {[
            'Unlimited case filings',
            'Priority placement on the docket',
            'Exclusive verdict card themes',
            'Appeal a verdict once per case',
            'No ads, ever',
          ].map((perk) => (
            <li key={perk} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-pro"
              />
              {perk}
            </li>
          ))}
        </ul>

        {viewer.isPro ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium text-flag-green">
              You are on RedFlag Pro. Thanks for funding the court.
            </p>
            <CancelSubscriptionButton />
          </div>
        ) : viewer.isVerified ? (
          <SubscribeButton />
        ) : (
          <p className="text-sm leading-relaxed text-chalk-dim">
            Verify your account first, then you can subscribe for &#8377;
            {PRO_PRICE_INR}/month.
          </p>
        )}
      </Panel>

      <p className="mt-7 text-xs text-chalk-faint">
        <Link
          href="/rules"
          className="text-judge underline-offset-4 hover:underline"
        >
          Court rules and privacy
        </Link>
      </p>
    </div>
  );
}
