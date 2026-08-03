import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, Crown, Vote, Scale, AlertCircle, ArrowUpRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/auth/viewer';
import { syncSubscriptionStatus } from '@/lib/actions/billing';
import { VerifyForm } from '@/components/account/verify-form';
import { SubscribeButton } from '@/components/account/subscribe-button';
import { CancelSubscriptionButton } from '@/components/account/cancel-subscription-button';
import { Panel, Chip, Rule } from '@/components/ui/neon';
import { TIER_DAILY_FILINGS, TIER_VOTE_WEIGHT, PRO_PRICE_INR } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Juror Standing & Account Verification | RedFlag.GG',
  description: 'Verify your juror status to file cases, manage your standing, or upgrade to RedFlag Pro.',
};

/**
 * Account page: Juror Passport & Subscription Management.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const { upgraded } = await searchParams;

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
    <div className="court-container-reading py-8 sm:py-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rule pb-5">
        <div>
          <p className="hud font-bold text-verdict-split text-[11px] tracking-widest">COURT JUROR RECORD</p>
          <h1 className="mt-1 font-display text-[clamp(2.2rem,8vw,3.4rem)] font-bold leading-none tracking-[-0.03em] text-ink">
            Juror Standing
          </h1>
        </div>

        {viewer.isPro ? (
          <Chip tone="pro" className="self-start sm:self-auto font-bold uppercase tracking-wider px-3.5 py-1.5 text-xs">
            <Crown className="size-3.5" strokeWidth={2.2} />
            REDFLAG PRO JUROR
          </Chip>
        ) : viewer.isVerified ? (
          <Chip tone="green" className="self-start sm:self-auto font-bold uppercase tracking-wider px-3.5 py-1.5 text-xs">
            <ShieldCheck className="size-3.5" strokeWidth={2.2} />
            VERIFIED JUROR
          </Chip>
        ) : (
          <Chip className="self-start sm:self-auto font-bold uppercase tracking-wider px-3.5 py-1.5 text-xs">
            <Vote className="size-3.5 text-ink-muted" strokeWidth={2.2} />
            UNVERIFIED VISITOR
          </Chip>
        )}
      </div>

      {/* Juror Standing Card */}
      <Panel tone={viewer.isPro ? 'pro' : 'neutral'} className="mt-8 p-6 sm:p-8 rounded-[6px] shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="hud text-[10px] text-ink-faint tracking-widest font-semibold">CURRENT COURT PRIVILEGE TIER</p>
            <p className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              {viewer.isPro
                ? 'RedFlag Pro'
                : viewer.isVerified
                  ? 'Verified Juror'
                  : 'Unverified Visitor'}
            </p>
          </div>
        </div>

        <Rule className="my-6" />

        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-6">
          <div className="p-4 rounded-[4px] bg-wash/60 border border-rule/60">
            <dt className="hud text-[10px] text-ink-faint">BALLOT WEIGHT</dt>
            <dd className="mt-1 font-display text-2xl font-bold tracking-tight text-verdict-split">
              {TIER_VOTE_WEIGHT[viewer.tier]}&times;
            </dd>
            <p className="text-[11px] text-ink-muted mt-1">Vote influence ratio</p>
          </div>

          <div className="p-4 rounded-[4px] bg-wash/60 border border-rule/60">
            <dt className="hud text-[10px] text-ink-faint">DAILY FILING CAP</dt>
            <dd className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">
              {Number.isFinite(dailyLimit) ? `${dailyLimit} / day` : 'UNLIMITED'}
            </dd>
            <p className="text-[11px] text-ink-muted mt-1">Allowed submissions</p>
          </div>

          <div className="p-4 rounded-[4px] bg-wash/60 border border-rule/60 col-span-2 sm:col-span-1">
            <dt className="hud text-[10px] text-ink-faint">ACCOUNT STATUS</dt>
            <dd className="mt-1 font-display text-lg font-bold tracking-tight text-ink">
              {viewer.isVerified ? 'VERIFIED' : 'ACTION NEEDED'}
            </dd>
            <p className="text-[11px] text-ink-muted mt-1">{email ?? 'No email linked'}</p>
          </div>
        </dl>

        {viewer.strikes > 0 && (
          <div className="mt-6 flex items-start gap-2.5 p-3.5 rounded-[4px] bg-verdict-red-soft border border-verdict-red/30 text-verdict-red">
            <AlertCircle className="size-4 shrink-0 mt-0.5" strokeWidth={2} />
            <p className="text-xs leading-relaxed font-medium">
              Notice: {viewer.strikes} of your submissions violated court rules and were removed. Filing rights are revoked after 3 strikes.
            </p>
          </div>
        )}
      </Panel>

      {/* Account Verification Section */}
      <Panel className="mt-6 p-6 sm:p-8 rounded-[6px] shadow-xs">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-ink">
            {viewer.isVerified ? 'Account Security & Email' : 'Verify Email to Enable Filing'}
          </h2>
        </div>
        <Rule className="my-5" />
        <VerifyForm signedInEmail={email} />
      </Panel>

      {/* RedFlag Pro Section */}
      <Panel className="mt-6 p-6 sm:p-8 rounded-[6px] shadow-xs border-pro/40">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-[4px] bg-pro-soft text-pro">
            <Crown className="size-5" strokeWidth={2.2} />
          </div>
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-ink">
              RedFlag Pro Membership
            </h2>
            <p className="text-xs text-ink-muted">Elevate your standing with 2&times; ballot weight and unlimited case filings.</p>
          </div>
        </div>
        <Rule className="my-6" />

        <ul className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3 font-read text-sm text-ink-muted">
          {[
            'Unlimited daily case filings',
            'Double (2×) vote weight influence',
            'Priority placement on docket',
            'Official Pro badge seal',
            'Direct access to all judge personas',
            'No advertising interruptions',
          ].map((perk) => (
            <li key={perk} className="flex items-center gap-2.5 p-2.5 rounded-[3px] bg-wash/50 border border-rule/50">
              <span className="flex size-2 rounded-full bg-pro shrink-0" />
              <span className="font-medium text-ink text-xs">{perk}</span>
            </li>
          ))}
        </ul>

        {viewer.isPro ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold text-verdict-green flex items-center gap-2">
              <ShieldCheck className="size-4" />
              Active RedFlag Pro Subscriber. Thank you for supporting the court.
            </p>
            <CancelSubscriptionButton />
          </div>
        ) : viewer.isVerified ? (
          <SubscribeButton />
        ) : (
          <p className="text-xs leading-relaxed text-ink-muted p-3.5 rounded-[4px] bg-wash border border-rule">
            Verify your email address above first to unlock RedFlag Pro subscription for &#8377;{PRO_PRICE_INR}/month.
          </p>
        )}
      </Panel>

      <p className="mt-8 text-center text-xs text-ink-faint">
        <Link
          href="/rules"
          className="text-verdict-split underline-offset-4 hover:underline font-semibold"
        >
          Review Court Rules & Privacy Terms
        </Link>
      </p>
    </div>
  );
}
