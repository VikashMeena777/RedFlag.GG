import Link from 'next/link';
import { Flame, PenLine, Shield, Scale, ScrollText } from 'lucide-react';
import { getViewer } from '@/lib/auth/viewer';
import { getOpenCaseCount, getDocket } from '@/lib/actions/cases';
import { LiveDot } from '@/components/ui/neon';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { MarqueeTicker } from '@/components/ui/marquee-ticker';

/**
 * Editorial Masthead.
 *
 * Designed as a high-contrast digital court gazette: centered nameplate,
 * edition metadata sitting on hairline rules, and high-legibility typography.
 */
export async function CourtHeader() {
  let viewer: Awaited<ReturnType<typeof getViewer>>;
  let openCount: number;
  let recentCases: Awaited<ReturnType<typeof getDocket>> = [];

  try {
    [viewer, openCount, recentCases] = await Promise.all([
      getViewer(),
      getOpenCaseCount(),
      getDocket(8),
    ]);
  } catch (err) {
    console.error('[chrome] CourtHeader data fetch failed:', err);
    viewer = { isPro: false, isSignedIn: false } as Awaited<ReturnType<typeof getViewer>>;
    openCount = 0;
    recentCases = [];
  }

  const todayDateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).toUpperCase();

  const tickerItems = recentCases.map((c) => ({
    id: c.id,
    publicId: c.publicId,
    title: c.title,
    toxicity: c.toxicity,
  }));

  return (
    <header className="border-b border-rule bg-page">
      <div className="court-container-wide">
        {/* Top edition bar */}
        <div className="flex items-center justify-between py-2 text-[11px] font-medium tracking-wider text-ink-faint">
          <div className="flex items-center gap-3">
            <span className="hud font-bold text-ink">EDITION NO. 74</span>
            <span className="hidden sm:inline text-rule-strong">•</span>
            <span className="hidden sm:inline hud text-ink-muted">{todayDateStr}</span>
          </div>

          <div className="flex items-center gap-3.5">
            {openCount > 0 && (
              <span className="hud inline-flex items-center gap-1.5 text-verdict-red bg-verdict-red-soft px-2.5 py-0.5 rounded-[2px]">
                <LiveDot />
                <span className="font-semibold">{openCount}</span> CASES IN SESSION
              </span>
            )}

            <Link
              href="/account"
              className="hud transition-colors hover:text-ink flex items-center gap-1"
            >
              <Shield className="size-3 text-verdict-split" />
              {viewer.isPro ? 'JUROR (PRO)' : viewer.isSignedIn ? 'ACCOUNT' : 'VERIFY'}
            </Link>

            <span className="text-rule-strong">•</span>

            <ThemeToggle />
          </div>
        </div>

        <hr className="hairline" />

        {/* Masthead Nameplate */}
        <div className="flex flex-col items-center gap-3 py-6 sm:py-8">
          <Link href="/" className="group text-center">
            <p className="font-display text-[clamp(2.2rem,8vw,3.4rem)] font-bold leading-none tracking-[-0.035em] text-ink transition-transform duration-200 group-hover:scale-[1.01]">
              RedFlag<span className="text-verdict-red">.gg</span>
            </p>
          </Link>

          <p className="max-w-md text-center font-read text-[14px] leading-relaxed text-ink-muted">
            The internet court of red flags. Anonymous submissions, public jury votes, and AI judicial verdicts.
          </p>

          <div className="mt-2 flex items-center gap-2.5">
            <Link
              href="/file"
              className="pill pill-red px-4.5 py-2 text-xs uppercase tracking-wider font-semibold shadow-xs hover:shadow-sm"
            >
              <PenLine className="size-3.5" strokeWidth={2.2} aria-hidden />
              File a Case
            </Link>
            <Link
              href="/docket"
              className="pill pill-outline px-4.5 py-2 text-xs uppercase tracking-wider font-semibold"
            >
              <Flame className="size-3.5 text-heat" strokeWidth={2.2} aria-hidden />
              Most Toxic
            </Link>
          </div>
        </div>
      </div>

      <hr className="rule-strong" />

      {/* Live Marquee Ticker */}
      {tickerItems.length > 0 && <MarqueeTicker items={tickerItems} />}
    </header>
  );
}

export function CourtFooter() {
  return (
    <footer className="mt-24 border-t border-rule bg-wash py-12">
      <div className="court-container-wide">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-2xl font-bold tracking-[-0.03em] text-ink">
              RedFlag<span className="text-verdict-red">.gg</span>
            </p>
            <p className="mt-1 text-xs text-ink-muted">The Digital Record & Legal Gazette</p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {(
              [
                ['/', 'Docket'],
                ['/file', 'File Case'],
                ['/rules', 'Court Rules'],
                ['/docket', 'Most Toxic'],
                ['/account', 'Juror Account'],
              ] as const
            ).map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="hud text-[11px] text-ink-muted transition-colors hover:text-verdict-red"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <hr className="hairline my-6" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs leading-relaxed text-ink-faint">
          <p className="max-w-xl">
            Cases are anonymous and user-submitted. Personal identifiers, names, phone numbers, or doxxing are strictly prohibited. Verdicts are AI-generated entertainment commentary.
          </p>
          <p className="hud text-[10px] text-ink-faint shrink-0">
            © {new Date().getFullYear()} REDFLAG.GG • ALL RIGHTS RESERVED
          </p>
        </div>
      </div>
    </footer>
  );
}
