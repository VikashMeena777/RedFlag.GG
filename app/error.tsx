'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[court] unhandled error:', error);
  }, [error]);

  return (
    <div className="court-container flex min-h-[70vh] flex-col items-center justify-center py-16 text-center">
      <AlertTriangle
        className="size-12 text-flag-red"
        strokeWidth={2.75}
        aria-hidden
      />
      <p className="docket-label mt-5">Court adjourned unexpectedly</p>
      <h1 className="mt-2 text-[clamp(2.25rem,11vw,4rem)] leading-[0.9] text-ink">
        SOMETHING
        <br />
        <span className="text-flag-red">BROKE</span>
      </h1>
      <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-soft">
        The clerk dropped the file. Try again — and if it keeps happening, the
        problem is on our side, not yours.
      </p>
      <button
        type="button"
        onClick={reset}
        className="brut brut-shadow brut-press mt-6 inline-flex items-center gap-2 bg-highlighter px-5 py-3 font-docket text-xs font-bold uppercase tracking-[0.12em] text-ink"
      >
        Try again
      </button>
    </div>
  );
}
