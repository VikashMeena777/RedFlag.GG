import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, Mail } from 'lucide-react';
import { getViewer } from '@/lib/auth/viewer';
import { PaymentConfirmation } from '@/components/account/payment-confirmation';
import { ProCelebration } from '@/components/account/pro-celebration';

export const metadata: Metadata = {
  title: 'Payment received — RedFlag Pro | RedFlag.GG',
  description:
    'Your RedFlag Pro pass is being recorded. This page updates automatically.',
  // A payment-status page is nobody's search result.
  robots: { index: false, follow: false },
};

/**
 * The post-checkout landing page (Cashfree's return URL).
 *
 * Three states, resolved server-side first so the common case is instant:
 *  - already Pro → the celebration, rendered on the spot;
 *  - signed out / unverified → a collect-your-pass prompt (e.g. the session was
 *    lost during the bank redirect);
 *  - otherwise → the poller, which reconciles with Cashfree and flips itself
 *    into the celebration the moment the pass lands — no manual refresh.
 */
export default async function ProSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const { order_id: orderRef } = await searchParams;
  const viewer = await getViewer();

  if (viewer.isPro) {
    return (
      <div className="court-container-reading flex min-h-[70vh] items-center py-10">
        <div className="w-full">
          <ProCelebration
            handle={viewer.handle}
            proExpiresAt={viewer.proExpiresAt}
          />
        </div>
      </div>
    );
  }

  if (!viewer.isVerified) {
    return (
      <div className="court-container-reading flex min-h-[70vh] items-center py-10">
        <div className="mx-auto max-w-md text-center">
          <p className="hud text-[11px] font-bold tracking-widest text-ink-faint">
            COURT REGISTRAR · PASS AWAITING COLLECTION
          </p>
          <h1 className="mt-3 font-display text-[clamp(1.9rem,6vw,2.8rem)] font-bold leading-[1.02] tracking-[-0.03em] text-ink">
            Your pass is ready —
            <br />
            sign in to collect it.
          </h1>
          <p className="mt-4 font-read text-[15px] leading-relaxed text-ink-muted">
            The registrar can&apos;t see your session, which can happen when a
            bank redirect drops it. Sign in with the same email you paid with
            and your Pro pass will be waiting on your juror record.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/account"
              className="pill pill-ink px-6 py-2.5 text-sm font-semibold"
            >
              <Mail className="size-4" strokeWidth={2.2} aria-hidden />
              Sign in to collect
            </Link>
          </div>
          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-ink-faint">
            <ShieldCheck className="size-3.5" strokeWidth={2} aria-hidden />
            If Pro doesn&apos;t appear within the hour and you were charged, it
            will be sorted by hand — just quote the payment reference.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="court-container-reading flex min-h-[70vh] items-center py-10">
      <div className="w-full">
        <PaymentConfirmation orderRef={orderRef ?? null} handle={viewer.handle} />
      </div>
    </div>
  );
}
