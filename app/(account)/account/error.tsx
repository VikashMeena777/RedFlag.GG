'use client';

import Link from 'next/link';

/**
 * Error boundary for the /account page.
 *
 * Catches render errors in the page component so the user sees a recovery UI
 * instead of a raw 500. The layout (header, footer) stays intact because error
 * boundaries only wrap the `children` slot, not the layout itself.
 */
export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="court-container flex min-h-[50vh] flex-col items-center justify-center py-16 text-center">
      <p className="hud text-verdict-red">Something broke</p>
      <h1 className="mt-3 font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
        Could not load your account
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-muted">
        This is usually a momentary glitch. Try refreshing, or come back in a
        minute.
      </p>

      <div className="mt-8 flex items-center gap-3">
        <button
          onClick={reset}
          className="pill pill-ink px-5 py-2.5 text-sm"
        >
          Try again
        </button>
        <Link href="/" className="pill pill-outline px-5 py-2.5 text-sm">
          Back to court
        </Link>
      </div>

      {error.digest && (
        <p className="mt-6 text-xs text-ink-faint">
          Error reference: {error.digest}
        </p>
      )}
    </div>
  );
}
