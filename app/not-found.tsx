import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="court-container flex min-h-[70vh] flex-col items-center justify-center py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-surface-2 ring-1 ring-line">
        <FileQuestion
          className="size-7 text-chalk-faint"
          strokeWidth={2}
          aria-hidden
        />
      </span>

      <p className="mt-6 font-hud text-[10px] font-medium uppercase tracking-[0.2em] text-chalk-faint">
        Case number not found
      </p>

      <h1 className="mt-3 font-display text-[clamp(2.4rem,11vw,4rem)] font-extrabold leading-[0.94] tracking-[-0.05em]">
        <span className="chrome">No such</span>{' '}
        <span className="text-flag-red glow-red">case</span>
      </h1>

      <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-chalk-dim">
        This file was never opened, or the clerk pulled it. Either way, the docket
        has plenty more drama.
      </p>

      <Link href="/" className="pill pill-glass mt-7 px-5 py-3 text-sm">
        Back to the docket
      </Link>
    </div>
  );
}
