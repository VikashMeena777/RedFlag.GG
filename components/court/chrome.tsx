import Link from 'next/link';
import { Flame, PenLine } from 'lucide-react';
import { getViewer } from '@/lib/auth/viewer';
import { getOpenCaseCount } from '@/lib/actions/cases';
import { LiveDot } from '@/components/ui/neon';

/**
 * Masthead.
 *
 * A newspaper nameplate: centred wordmark in the display serif, a hairline
 * beneath, and metadata sitting on that rule. No sticky glass bar — the header
 * scrolls away like the top of a printed page, which is what keeps the reading
 * column feeling like a document rather than an app.
 */
export async function CourtHeader() {
  let viewer: Awaited<ReturnType<typeof getViewer>>;
  let openCount: number;
  try {
    [viewer, openCount] = await Promise.all([
      getViewer(),
      getOpenCaseCount(),
    ]);
  } catch (err) {
    console.error('[chrome] CourtHeader data fetch failed:', err);
    // Render with safe defaults so the layout never 500s.
    viewer = { isPro: false } as Awaited<ReturnType<typeof getViewer>>;
    openCount = 0;
  }

  return (
    <header className="border-b border-rule bg-page">
      <div className="court-container-wide">
        {/* Top line: tiny nav, the way a masthead carries edition info. */}
        <div className="flex items-center justify-between py-2.5">
          <Link
            href="/docket"
            className="hud transition-colors hover:text-ink"
          >
            Most toxic
          </Link>

          {openCount > 0 && (
            <span className="hud inline-flex items-center gap-1.5 text-verdict-red">
              <LiveDot />
              {openCount} in session
            </span>
          )}

          <Link
            href="/account"
            className="hud transition-colors hover:text-ink"
          >
            {viewer.isPro ? 'Pro' : 'Account'}
          </Link>
        </div>

        <hr className="hairline" />

        {/* Nameplate */}
        <div className="flex flex-col items-center gap-3 py-7">
          <Link href="/" className="group text-center">
            {/*
              The wordmark is a site-identity mark, not the page heading, so it is
              a <p> not an <h1>. Each page owns its single <h1> (the docket
              headline, a case title, "Court rules", etc.) — two <h1>s per page is
              both an a11y fault and a real regression the e2e suite caught.
            */}
            <p className="font-display text-[clamp(2rem,7vw,3rem)] font-semibold leading-none tracking-[-0.03em] text-ink">
              RedFlag
              <span className="text-verdict-red">.gg</span>
            </p>
          </Link>

          <p className="max-w-sm text-center text-[13px] leading-snug text-ink-muted">
            The internet court of red flags. Filed anonymously, judged publicly.
          </p>

          <div className="mt-1 flex items-center gap-2">
            <Link href="/file" className="pill pill-ink px-4 py-2 text-sm">
              <PenLine className="size-3.5" strokeWidth={2} aria-hidden />
              File a case
            </Link>
            <Link
              href="/docket"
              className="pill pill-outline px-4 py-2 text-sm"
            >
              <Flame className="size-3.5" strokeWidth={2} aria-hidden />
              Today&rsquo;s worst
            </Link>
          </div>
        </div>
      </div>

      <hr className="rule-strong" />
    </header>
  );
}

export function CourtFooter() {
  return (
    <footer className="mt-24 border-t border-rule bg-wash py-10">
      <div className="court-container-wide">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between">
          <p className="font-display text-xl font-semibold tracking-[-0.025em] text-ink">
            RedFlag<span className="text-verdict-red">.gg</span>
          </p>

          <nav className="flex flex-wrap gap-x-6 gap-y-2">
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
                className="text-[13px] text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <hr className="hairline my-6" />

        <p className="max-w-2xl text-xs leading-relaxed text-ink-faint">
          Stories are anonymous and user-submitted. Never post names, handles,
          phone numbers, or anything that identifies a real person. Verdicts are
          AI-generated entertainment, not advice.
        </p>
      </div>
    </footer>
  );
}
