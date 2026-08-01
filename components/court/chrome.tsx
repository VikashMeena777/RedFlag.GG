import Link from 'next/link';
import { Scale, Flame, PenLine } from 'lucide-react';
import { getViewer } from '@/lib/auth/viewer';
import { getOpenCaseCount } from '@/lib/actions/cases';
import { Chip, LiveDot } from '@/components/ui/neon';

/**
 * Court chrome.
 *
 * Floating glass bar rather than a hard-ruled masthead: a 1px hairline plus blur,
 * so content scrolls *under* it and the neon bloom on the page stays visible.
 */
export async function CourtHeader() {
  const [viewer, openCount] = await Promise.all([
    getViewer(),
    getOpenCaseCount(),
  ]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-void/70 backdrop-blur-xl">
      <div className="court-container-wide flex h-16 items-center justify-between gap-3">
        <Link
          href="/"
          className="group flex items-center gap-2.5"
          aria-label="RedFlag.GG home"
        >
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-flag-red-deep ring-1 ring-flag-red/40">
            <Scale className="size-4 text-flag-red" strokeWidth={2.25} aria-hidden />
          </span>
          {/* Chrome fill on the wordmark; the shimmer only runs on hover. */}
          <span className="chrome font-display text-[22px] font-extrabold tracking-[-0.045em] group-hover:chrome-live">
            RedFlag<span className="text-flag-red">.gg</span>
          </span>
        </Link>

        <nav className="flex items-center gap-2">
          {openCount > 0 && (
            <Chip tone="red" className="hidden xs:inline-flex">
              <LiveDot />
              {openCount} live
            </Chip>
          )}

          <Link
            href="/docket"
            className="pill pill-ghost px-3 py-2 text-[13px]"
          >
            <Flame className="size-4" strokeWidth={2.25} aria-hidden />
            <span className="hidden sm:inline">Toxic</span>
          </Link>

          <Link href="/file" className="pill pill-red px-4 py-2 text-[13px]">
            <PenLine className="size-4" strokeWidth={2.5} aria-hidden />
            File
            <span className="sr-only">a case</span>
          </Link>

          <Link
            href="/account"
            className="pill pill-glass size-9 shrink-0 !px-0"
            aria-label="Account"
          >
            {viewer.isPro ? (
              <span className="font-hud text-[9px] font-bold tracking-[0.1em] text-[#c9a6ff]">
                PRO
              </span>
            ) : (
              <span className="font-hud text-[10px] font-bold tracking-normal text-chalk-dim">
                {/* First letter of the handle, or a neutral glyph. */}
                {viewer.handle?.replace(/^juror_/, '').charAt(0).toUpperCase() ??
                  '·'}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function CourtFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-void-deep py-10">
      <div className="court-container-wide flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="chrome font-display text-lg font-bold tracking-[-0.04em]">
          RedFlag.gg
        </p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          {/* `as const` so each entry is a fixed tuple — a plain array infers
              string[][] and `href` becomes possibly-undefined under
              noUncheckedIndexedAccess. */}
          {(
            [
              ['/rules', 'Rules'],
              ['/docket', 'Most toxic'],
              ['/account', 'Account'],
            ] as const
          ).map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="text-[13px] font-medium text-chalk-dim transition-colors hover:text-judge"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="court-container-wide mt-6">
        <p className="max-w-2xl text-xs leading-relaxed text-chalk-faint">
          Stories are anonymous and user-submitted. Never post names, handles,
          phone numbers, or anything that identifies a real person. Verdicts are
          AI-generated entertainment, not advice.
        </p>
      </div>
    </footer>
  );
}
