'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { Gavel, RefreshCw, ArrowRight } from 'lucide-react';
import { confirmProStatus } from '@/lib/actions/billing';
import { ProCelebration } from '@/components/account/pro-celebration';

/**
 * The bridge between "Cashfree says you paid" and "the account shows it".
 *
 * The buyer lands here the instant the bank confirms, which is often seconds
 * before the entitlement lands (webhook delivery, or the reconciliation read).
 * This component polls until the pass is actually on the account, then swaps
 * itself for the celebration — no manual refresh, no "come back later".
 *
 * Polling is bounded and client-driven: one immediate attempt, then every 3s,
 * fifteen attempts in total (~45s). "Check again" restarts the budget. The
 * server side rate-limits the action independently, so a hand-crafted loop
 * cannot drive Cashfree lookups.
 */
const POLL_INTERVAL_MS = 3_000;
const MAX_ATTEMPTS = 15;

type Phase = 'confirming' | 'confirmed' | 'timeout';

export function PaymentConfirmation({
  orderRef,
  handle,
}: {
  orderRef: string | null;
  /** The buyer's juror handle, from the server — printed on the pass. */
  handle: string | null;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('confirming');
  const [expiry, setExpiry] = useState<string | null>(null);
  /** Bumped by "Check again" to restart the poll loop with a fresh budget. */
  const [pollNonce, setPollNonce] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      attempts += 1;
      try {
        const status = await confirmProStatus(orderRef);
        if (cancelled.current) return;
        if (status.isPro) {
          setExpiry(status.proExpiresAt);
          setPhase('confirmed');
          // Refresh the server-rendered chrome so the Pro badge appears in
          // the header without a navigation.
          router.refresh();
          return;
        }
      } catch (error) {
        console.error('[billing] confirmation poll failed:', error);
      }
      if (cancelled.current) return;
      if (attempts >= MAX_ATTEMPTS) {
        setPhase('timeout');
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
    return () => {
      cancelled.current = true;
      clearTimeout(timer);
    };
  }, [orderRef, router, pollNonce]);

  if (phase === 'confirmed') {
    return <ProCelebration handle={handle} proExpiresAt={expiry} />;
  }

  if (phase === 'timeout') {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="hud text-[11px] font-bold tracking-widest text-ink-faint">
          COURT REGISTRAR · STILL CONFIRMING
        </p>
        <h1 className="mt-3 font-display text-[clamp(1.9rem,6vw,2.8rem)] font-bold leading-[1.02] tracking-[-0.03em] text-ink">
          The ink is dry,
          <br />
          the ledger is catching up.
        </h1>
        <p className="mt-4 font-read text-[15px] leading-relaxed text-ink-muted">
          Your bank confirmed the payment, but the court hasn&apos;t recorded it
          on your account yet — this can take a minute on the bank&apos;s side.
          Nothing is lost: the moment it lands, Pro activates on its own, and
          your 30 days start from that moment, not from now.
        </p>
        <p className="mt-3 font-read text-[15px] leading-relaxed text-ink-muted">
          If it still hasn&apos;t appeared on{' '}
          <Link
            href="/account"
            className="font-semibold text-verdict-split underline-offset-4 hover:underline"
          >
            your juror record
          </Link>{' '}
          within the hour and you were charged, write to us with the payment
          reference and it will be sorted by hand.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setPhase('confirming');
              setPollNonce((n) => n + 1);
            }}
            className="pill pill-outline px-5 py-2.5 text-sm font-semibold"
          >
            <RefreshCw className="size-4" strokeWidth={2.2} aria-hidden />
            Check again
          </button>
          <Link
            href="/docket"
            className="pill pill-ghost px-5 py-2.5 text-xs font-semibold text-ink-muted hover:text-ink"
          >
            Keep browsing the docket
            <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden />
          </Link>
        </div>
      </div>
    );
  }

  // ── Confirming ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center text-center">
      <p className="hud text-[11px] font-bold tracking-widest text-verdict-split">
        COURT REGISTRAR · RECORDING YOUR PAYMENT
      </p>

      <motion.div
        animate={reduced ? undefined : { rotate: [0, -14, 0] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
        className="mt-8 flex size-16 items-center justify-center rounded-[4px] border border-rule-strong bg-sunk text-verdict-split"
        aria-hidden
      >
        <Gavel className="size-7" strokeWidth={1.8} />
      </motion.div>

      <h1 className="mt-7 font-display text-[clamp(1.9rem,6vw,2.8rem)] font-bold leading-[1.02] tracking-[-0.03em] text-ink">
        Sealing the record…
      </h1>

      <p className="mt-4 max-w-md font-read text-[15px] leading-relaxed text-ink-muted">
        We&apos;re confirming your payment with your bank and the court ledger.
        This usually takes a few seconds — this page updates itself, so keep it
        open.
      </p>

      <p className="mt-5 hud text-[10px] tracking-widest text-ink-faint">
        DO NOT CLOSE · UPDATES AUTOMATICALLY
      </p>
    </div>
  );
}
