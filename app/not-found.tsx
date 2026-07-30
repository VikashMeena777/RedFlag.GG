import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="court-container flex min-h-[70vh] flex-col items-center justify-center py-16 text-center">
      <FileQuestion
        className="size-12 text-ink-faint"
        strokeWidth={2.75}
        aria-hidden
      />
      <p className="docket-label mt-5">Case number not found</p>
      <h1 className="mt-2 text-[clamp(2.5rem,12vw,4.5rem)] leading-[0.9] text-ink">
        NO SUCH
        <br />
        <span className="text-flag-red">CASE</span>
      </h1>
      <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-soft">
        This file was never opened, or the clerk removed it. Either way, the docket
        has plenty more drama.
      </p>
      <Link
        href="/"
        className="brut brut-shadow brut-press mt-6 inline-flex items-center gap-2 bg-highlighter px-5 py-3 font-docket text-xs font-bold uppercase tracking-[0.12em] text-ink"
      >
        Back to the docket
      </Link>
    </div>
  );
}
