import Link from 'next/link';
import { Gavel, Flame, FilePlus2 } from 'lucide-react';
import { getViewer } from '@/lib/auth/viewer';

/**
 * Court chrome. Sticky wordmark bar with the live session count and the two
 * primary destinations.
 */
export async function CourtHeader({ openCount }: { openCount?: number }) {
  const viewer = await getViewer();

  return (
    <header className="sticky top-0 z-50 border-b-[3px] border-ink bg-paper/95 backdrop-blur-sm">
      <div className="court-container-wide flex h-14 items-center justify-between gap-3">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-2xl tracking-tight text-ink"
        >
          <Gavel className="size-5" strokeWidth={2.75} aria-hidden />
          REDFLAG<span className="text-flag-red">.GG</span>
        </Link>

        <div className="flex items-center gap-2">
          {typeof openCount === 'number' && openCount > 0 && (
            <span className="hidden items-center gap-1.5 bg-highlighter px-2.5 py-1 font-docket text-[10px] font-bold tracking-[0.14em] text-ink xs:flex">
              <span
                className="size-1.5 animate-pulse-live rounded-full bg-flag-red"
                aria-hidden
              />
              {openCount} IN SESSION
            </span>
          )}

          <Link
            href="/docket"
            className="flex items-center gap-1.5 font-docket text-[11px] font-bold tracking-[0.12em] text-ink-soft transition-colors hover:text-ink"
          >
            <Flame className="size-4" strokeWidth={2.75} aria-hidden />
            <span className="hidden sm:inline">TOXIC</span>
          </Link>

          <Link
            href="/file"
            className="brut-thin brut-shadow-sm brut-press flex items-center gap-1.5 bg-flag-red px-3 py-2 font-docket text-[11px] font-bold tracking-[0.12em] text-paper-bright"
          >
            <FilePlus2 className="size-4" strokeWidth={2.75} aria-hidden />
            FILE
            <span className="sr-only">a case</span>
          </Link>

          {viewer.isPlus && (
            <span className="hidden bg-judge px-2 py-1 font-docket text-[10px] font-bold tracking-[0.12em] text-paper-bright sm:inline">
              PLUS
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

export function CourtFooter() {
  return (
    <footer className="mt-16 border-t-[3px] border-ink bg-paper-dim py-8">
      <div className="court-container-wide flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="docket-label">
          REDFLAG.GG · The internet court of red flags
        </p>
        <nav className="flex gap-4">
          <Link href="/rules" className="docket-label hover:text-ink">
            RULES
          </Link>
          <Link href="/docket" className="docket-label hover:text-ink">
            MOST TOXIC
          </Link>
          <Link href="/account" className="docket-label hover:text-ink">
            ACCOUNT
          </Link>
        </nav>
      </div>
      <div className="court-container-wide mt-4">
        <p className="max-w-2xl text-xs leading-relaxed text-ink-soft">
          Stories are anonymous and user-submitted. Never post names, handles,
          phone numbers, or anything that identifies a real person. Verdicts are
          AI-generated entertainment, not advice.
        </p>
      </div>
    </footer>
  );
}
