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
      <span className="flex size-16 items-center justify-center rounded-full bg-flag-red-deep ring-1 ring-flag-red/40">
        <AlertTriangle
          className="size-7 text-flag-red"
          strokeWidth={2}
          aria-hidden
        />
      </span>

      <p className="mt-6 font-hud text-[10px] font-medium uppercase tracking-[0.2em] text-chalk-faint">
        Court adjourned unexpectedly
      </p>

      <h1 className="mt-3 font-display text-[clamp(2.4rem,11vw,4rem)] font-extrabold leading-[0.94] tracking-[-0.05em]">
        <span className="chrome">Something</span>{' '}
        <span className="text-flag-red glow-red">broke</span>
      </h1>

      <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-chalk-dim">
        The clerk dropped the file. Try again — and if it keeps happening, the
        problem is on our side, not yours.
      </p>

      <button
        type="button"
        onClick={reset}
        className="pill pill-judge mt-7 px-5 py-3 text-sm"
      >
        Try again
      </button>
    </div>
  );
}
