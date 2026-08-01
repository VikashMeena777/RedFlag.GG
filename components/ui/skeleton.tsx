import { Panel, Rule } from '@/components/ui/neon';

/**
 * Skeleton primitives.
 *
 * Flat surface blocks with a soft pulse. Deliberately not shimmering gradients:
 * a travelling highlight on dark glass reads as a rendering artefact rather than
 * a loading state.
 */
function Bar({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-surface-3 ${className}`} aria-hidden />
  );
}

/** One case card placeholder, matching the real card's rhythm. */
export function CaseCardSkeleton() {
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <Bar className="h-3 w-24" />
        <Bar className="h-3 w-16" />
      </div>
      <Bar className="mt-4 h-6 w-28 rounded-full" />
      <Bar className="mt-4 h-7 w-full" />
      <Bar className="mt-2 h-7 w-3/4" />
      <Bar className="mt-3.5 h-3 w-full" />
      <Bar className="mt-2 h-3 w-5/6" />
      <Bar className="mt-5 h-2.5 w-full rounded-full" />
    </Panel>
  );
}

/** The docket feed, mid-load. */
export function DocketSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading cases">
      <span className="sr-only">Loading the docket…</span>
      {Array.from({ length: count }, (_, i) => (
        <CaseCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** A single case file, mid-load. */
export function CaseSkeleton() {
  return (
    <Panel className="p-6 sm:p-8" role="status">
      <span className="sr-only">Loading case…</span>
      <div className="flex items-start justify-between gap-3">
        <Bar className="h-3 w-28" />
        <Bar className="h-3 w-16" />
      </div>
      <div className="mt-4 flex gap-2">
        <Bar className="h-6 w-24 rounded-full" />
        <Bar className="h-6 w-28 rounded-full" />
      </div>
      <Bar className="mt-4 h-9 w-full" />
      <Bar className="mt-2 h-9 w-2/3" />
      <Rule className="my-6" />
      <Bar className="h-3 w-full" />
      <Bar className="mt-2 h-3 w-full" />
      <Bar className="mt-2 h-3 w-4/5" />
      <Bar className="mt-2 h-3 w-full" />
      <Bar className="mt-2 h-3 w-3/5" />
      <Rule className="my-7" />
      {/* Jury box placeholder — two equal choice tiles. */}
      <div className="grid grid-cols-2 gap-3">
        <Bar className="h-32 rounded-[var(--radius-card)]" />
        <Bar className="h-32 rounded-[var(--radius-card)]" />
      </div>
    </Panel>
  );
}

/** Page-level heading placeholder. */
export function HeadingSkeleton() {
  return (
    <div aria-hidden>
      <Bar className="h-3 w-32" />
      <Bar className="mt-4 h-12 w-3/4" />
      <Bar className="mt-2 h-12 w-1/2" />
      <Bar className="mt-5 h-3 w-full max-w-md" />
    </div>
  );
}
