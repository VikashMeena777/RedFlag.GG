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
      <span className="flex size-16 items-center justify-center rounded-[3px] bg-verdict-red-soft ring-1 ring-verdict-red/40">
        <AlertTriangle
          className="size-7 text-verdict-red"
          strokeWidth={2}
          aria-hidden
        />
      </span>

      <p className="hud mt-6">Court adjourned unexpectedly</p>

      <h1 className="mt-3 font-display text-[clamp(2.4rem,11vw,4rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
        <span className="text-ink">Something</span>{' '}
        <span className="text-verdict-red">broke</span>
      </h1>

      <p className="mt-4 max-w-sm font-read text-[17px] leading-relaxed text-ink-muted">
        The clerk dropped the file. Try again — and if it keeps happening, the
        problem is on our side, not yours.
      </p>

      <button
        type="button"
        onClick={reset}
        className="pill pill-ink mt-7 px-5 py-3 text-sm"
      >
        Try again
      </button>
    </div>
  );
}
