import type { Metadata } from 'next';
import Link from 'next/link';
import { Gavel, Flame, PenLine, Scale, ShieldCheck, Sparkles, Filter, ChevronRight, HelpCircle, AlertTriangle } from 'lucide-react';
import { getDocket } from '@/lib/actions/cases';
import { CaseCard } from '@/components/court/case-card';
import { Panel, Chip, LiveDot } from '@/components/ui/neon';
import { timeRemaining } from '@/lib/utils';
import { CASE_CATEGORIES, CATEGORY_LABELS } from '@/lib/types';

export const metadata: Metadata = {
  title: 'RedFlag.GG — The Internet Court of Red Flags',
  description: 'Submit dating & social drama anonymously. The internet jury votes red or green flag, and our AI judge delivers the final verdict.',
};

/**
 * The Docket: Editorial Widescreen Courtroom Layout.
 */
export default async function DocketPage() {
  const cases = await getDocket(30);
  const openCases = cases.filter((c) => c.isOpen);
  const closedCases = cases.filter((c) => !c.isOpen);
  const toxicCases = cases.filter((c) => c.toxicity !== null && c.toxicity >= 60).slice(0, 4);
  const totalVotes = cases.reduce((acc, c) => acc + c.redVotes + c.greenVotes, 0);

  return (
    <div className="court-container py-6 sm:py-10 space-y-8 sm:space-y-12">
      {/* Editorial Hero Banner */}
      <section className="relative overflow-hidden rounded-[6px] border border-rule bg-surface p-6 sm:p-10 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[2px] bg-verdict-red-soft text-verdict-red font-semibold hud text-[11px]">
              <LiveDot />
              <span>THE DIGITAL TRIBUNAL IS NOW OPEN</span>
            </div>

            <h1 className="mt-4 font-display text-[clamp(2.4rem,6.5vw,4.2rem)] font-bold leading-[1.03] tracking-[-0.035em] text-ink">
              Red flag <span className="text-verdict-red">or not?</span> <br />
              <span className="text-ink-muted text-[0.65em] font-normal tracking-tight">The internet jury decides your fate.</span>
            </h1>

            <p className="mt-4 max-w-2xl font-read text-[16px] sm:text-[18px] leading-relaxed text-ink-muted">
              Submit relationship, workplace, or friend group drama anonymously. The public jury casts weighted votes, and our AI judge delivers an unvarnished verdict.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3.5">
              <Link href="/file" className="pill pill-red px-6 py-3 text-sm font-semibold tracking-wide shadow-xs hover:shadow-sm">
                <PenLine className="size-4" strokeWidth={2.2} aria-hidden />
                File a Case
              </Link>
              <Link href="/docket" className="pill pill-outline px-6 py-3 text-sm font-semibold tracking-wide">
                <Flame className="size-4 text-heat" strokeWidth={2.2} aria-hidden />
                Most Toxic Docket
              </Link>
            </div>
          </div>

          {/* Courtroom Live Statistics Card */}
          <div className="w-full lg:w-72 shrink-0 rounded-[6px] border border-rule bg-sunk p-5 space-y-4 shadow-xs">
            <div className="hud text-[10px] font-bold text-ink-faint tracking-widest border-b border-rule pb-2.5 flex items-center justify-between">
              <span>COURT DOCKET STATS</span>
              <Scale className="size-3.5 text-verdict-split" />
            </div>

            <div className="grid grid-cols-3 lg:grid-cols-1 gap-4">
              <div>
                <p className="font-display text-2xl font-bold text-ink leading-none">{openCases.length}</p>
                <p className="text-[12px] font-medium text-ink-muted mt-1">Active Cases</p>
              </div>

              <div className="lg:pt-3 lg:border-t border-rule/60">
                <p className="font-display text-2xl font-bold text-ink leading-none">{closedCases.length}</p>
                <p className="text-[12px] font-medium text-ink-muted mt-1">Verdicts Handed</p>
              </div>

              <div className="lg:pt-3 lg:border-t border-rule/60">
                <p className="font-display text-2xl font-bold text-ink leading-none">{totalVotes}</p>
                <p className="text-[12px] font-medium text-ink-muted mt-1">Juror Ballots</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main 2-Column Widescreen Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left / Primary Docket Stream (8 columns on Desktop) */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-rule">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-[-0.03em] text-ink">
                Active Cases & Verdicts
              </h2>
              <p className="text-xs text-ink-muted mt-0.5">Explore submitted cases, vote as a juror, or read judicial rulings.</p>
            </div>

            {openCases.length > 0 && (
              <Chip tone="red" className="self-start sm:self-auto font-bold px-3 py-1 text-xs">
                <LiveDot />
                {openCases.length} IN SESSION
              </Chip>
            )}
          </div>

          {cases.length === 0 ? (
            <EmptyDocket />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {cases.map((caseData) => (
                <CaseCard
                  key={caseData.id}
                  caseData={caseData}
                  remaining={timeRemaining(caseData.closesAt)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Sidebar Widgets (4 columns on Desktop) */}
        <aside className="lg:col-span-4 space-y-6">
          {/* How Court Works Widget */}
          <div className="rounded-[6px] border border-rule bg-surface p-5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2 border-b border-rule pb-3">
              <HelpCircle className="size-4 text-verdict-split" />
              <h3 className="hud font-bold text-ink text-[11px] tracking-wider">HOW REDFLAG.GG WORKS</h3>
            </div>

            <ol className="space-y-3.5 text-xs text-ink-muted font-medium">
              <li className="flex items-start gap-3">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ink text-page font-bold text-[10px]">1</span>
                <span><strong className="text-ink">Post Anonymously:</strong> Submit your story without names, handles, or doxxing.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ink text-page font-bold text-[10px]">2</span>
                <span><strong className="text-ink">Jury Votes:</strong> Visitors vote RED FLAG (Guilty) or GREEN FLAG (Not Guilty).</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ink text-page font-bold text-[10px]">3</span>
                <span><strong className="text-ink">AI Judge Renders Verdict:</strong> Gavel analyzes the evidence, calculates toxicity, and issues a formal ruling.</span>
              </li>
            </ol>

            <Link href="/file" className="pill pill-ink w-full py-2.5 text-xs font-bold uppercase tracking-wider">
              File Your Case Now
            </Link>
          </div>

          {/* Most Toxic Highlights */}
          {toxicCases.length > 0 && (
            <div className="rounded-[6px] border border-rule bg-surface p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-rule pb-3">
                <div className="flex items-center gap-2">
                  <Flame className="size-4 text-heat" />
                  <h3 className="hud font-bold text-ink text-[11px] tracking-wider">HIGH TOXICITY CASES</h3>
                </div>
                <Link href="/docket" className="hud text-[10px] text-verdict-red hover:underline">
                  View All
                </Link>
              </div>

              <div className="space-y-3">
                {toxicCases.map((tc) => (
                  <Link
                    key={tc.id}
                    href={`/case/${tc.publicId}`}
                    className="group block p-3 rounded-[4px] bg-sunk hover:bg-wash transition-colors border border-rule/60"
                  >
                    <div className="flex items-center justify-between text-[11px] hud">
                      <span className="font-bold text-ink">{tc.publicId}</span>
                      <Chip tone="heat" className="py-0 px-1.5 text-[10px]">
                        Toxicity {tc.toxicity}/100
                      </Chip>
                    </div>
                    <p className="mt-1.5 font-display text-sm font-semibold text-ink group-hover:text-verdict-red line-clamp-1">
                      {tc.title}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Privacy & Anti-Doxxing Guarantee */}
          <div className="rounded-[6px] border border-rule bg-wash/80 p-5 space-y-3">
            <div className="flex items-center gap-2 text-verdict-red font-bold hud text-[11px]">
              <AlertTriangle className="size-4" />
              <span>COURT PRIVACY GUARANTEE</span>
            </div>
            <p className="text-xs text-ink-muted leading-relaxed">
              RedFlag.GG enforces strict zero-doxxing rules. All submissions are automatically sanitized. Never include names, phones, handles, or locations.
            </p>
            <Link href="/rules" className="inline-flex items-center gap-1 text-xs font-semibold text-verdict-split hover:underline">
              Read Court Rules & FAQ <ChevronRight className="size-3" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EmptyDocket() {
  return (
    <Panel className="p-10 text-center rounded-[6px]">
      <span className="mx-auto flex size-14 items-center justify-center rounded-[4px] bg-wash border border-rule">
        <Gavel className="size-6 text-verdict-split" strokeWidth={2} aria-hidden />
      </span>
      <h3 className="mt-5 font-display text-2xl font-bold tracking-[-0.03em] text-ink">
        Nothing on the Docket
      </h3>
      <p className="mx-auto mt-2 max-w-sm font-read text-[15px] leading-relaxed text-ink-muted">
        No active cases right now. Be the first to bring your drama to the court and pull the biggest jury.
      </p>
      <Link
        href="/file"
        className="pill pill-red mx-auto mt-6 px-6 py-3 text-sm font-semibold tracking-wide"
      >
        <PenLine className="size-4" strokeWidth={2.2} aria-hidden />
        File the First Case
      </Link>
    </Panel>
  );
}
