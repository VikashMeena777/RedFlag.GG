'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Crown, Gavel, ArrowRight, CalendarClock } from 'lucide-react';
import { Rule } from '@/components/ui/neon';
import { PRO_DURATION_DAYS } from '@/lib/types';

/**
 * The celebration state of a completed Pro purchase.
 *
 * Designed to read as an officially issued court pass: a bordered pass card,
 * the holder's juror handle, the validity window, and a PAID stamp that lands
 * the way a stamp lands — one decisive motion, no glow, no shimmer. Respects
 * prefers-reduced-motion by fading instead.
 */
export function ProCelebration({
  handle,
  proExpiresAt,
}: {
  handle: string | null;
  proExpiresAt: string | null;
}) {
  const reduced = useReducedMotion();

  const validUntil = proExpiresAt
    ? new Date(proExpiresAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div className="flex flex-col items-center text-center">
      <p className="hud text-[11px] font-bold tracking-widest text-verdict-split">
        COURT REGISTRAR · OFFICIAL RECORD
      </p>

      <motion.h1
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 120, damping: 16 }}
        className="mt-3 font-display text-[clamp(2.4rem,8vw,4rem)] font-bold leading-[0.98] tracking-[-0.03em] text-ink"
      >
        Welcome to
        <br />
        RedFlag Pro.
      </motion.h1>

      <p className="mt-4 max-w-md font-read text-[15px] leading-relaxed text-ink-muted">
        Payment received and recorded. Your ballot now carries double weight,
        and the filing counter is off — for {PRO_DURATION_DAYS} days.
      </p>

      {/* ── The pass ─────────────────────────────────────────────────── */}
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.97 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 90, damping: 15, delay: 0.15 }}
        className="relative mt-9 w-full max-w-md border border-pro/45 bg-surface p-6 sm:p-7 rounded-[6px] shadow-xs"
      >
        {/* Monogram seal */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-[4px] border border-pro/40 bg-pro-soft text-pro">
              <Crown className="size-5" strokeWidth={2.2} aria-hidden />
            </span>
            <div className="text-left">
              <p className="font-display text-lg font-bold leading-tight tracking-tight text-ink">
                RedFlag Pro
              </p>
              <p className="hud text-[10px] tracking-widest text-ink-faint">
                {PRO_DURATION_DAYS}-DAY PASS · ISSUED BY THE COURT
              </p>
            </div>
          </div>
        </div>

        <Rule className="my-5" />

        <dl className="grid grid-cols-2 gap-4 text-left">
          <div>
            <dt className="hud text-[10px] tracking-widest text-ink-faint">
              HOLDER
            </dt>
            <dd className="mt-1 truncate font-read text-sm font-semibold text-ink">
              {handle ?? 'Verified juror'}
            </dd>
          </div>
          <div>
            <dt className="hud flex items-center gap-1 text-[10px] tracking-widest text-ink-faint">
              <CalendarClock className="size-3" strokeWidth={2} aria-hidden />
              VALID UNTIL
            </dt>
            <dd className="mt-1 font-read text-sm font-semibold text-ink">
              {validUntil ?? 'Now active'}
            </dd>
          </div>
        </dl>

        {/* The stamp. One motion, like it was struck. */}
        <motion.span
          initial={reduced ? { opacity: 0 } : { scale: 2.2, opacity: 0, rotate: -20 }}
          animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1, rotate: -9 }}
          transition={
            reduced
              ? { delay: 0.3 }
              : { type: 'spring', stiffness: 320, damping: 19, delay: 0.45 }
          }
          className="pointer-events-none absolute -right-3 -top-4 select-none border-[3px] border-verdict-green px-3.5 py-1.5 font-display text-sm font-bold uppercase tracking-[0.14em] text-verdict-green bg-surface/90 rounded-[2px]"
          aria-hidden
        >
          Paid
        </motion.span>
      </motion.div>

      <p className="mt-5 text-xs leading-relaxed text-ink-faint">
        Nothing renews automatically and nothing is charged again. When the pass
        ends, buying once more is entirely your call.
      </p>

      {/* ── Where to next ────────────────────────────────────────────── */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/docket"
          className="pill pill-ink px-6 py-2.5 text-sm font-semibold"
        >
          <Gavel className="size-4" strokeWidth={2.2} aria-hidden />
          Take your seat in the jury
        </Link>
        <Link
          href="/account"
          className="pill pill-ghost px-5 py-2.5 text-xs font-semibold text-ink-muted hover:text-ink"
        >
          View your juror record
          <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
