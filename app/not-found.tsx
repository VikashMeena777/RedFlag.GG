import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="court-container flex min-h-[70vh] flex-col items-center justify-center py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-[3px] bg-surface ring-1 ring-rule">
        <FileQuestion
          className="size-7 text-ink-faint"
          strokeWidth={2}
          aria-hidden
        />
      </span>

      <p className="hud mt-6">Case number not found</p>

      <h1 className="mt-3 font-display text-[clamp(2.4rem,11vw,4rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
        <span className="text-ink">No such</span>{' '}
        <span className="text-verdict-red">case</span>
      </h1>

      <p className="mt-4 max-w-sm font-read text-[17px] leading-relaxed text-ink-muted">
        This file was never opened, or the clerk pulled it. Either way, the docket
        has plenty more drama.
      </p>

      <Link href="/" className="pill pill-outline mt-7 px-5 py-3 text-sm">
        Back to the docket
      </Link>
    </div>
  );
}
