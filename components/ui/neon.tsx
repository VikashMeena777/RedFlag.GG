import { cn } from '@/lib/utils';

/**
 * DIGITAL COURTROOM primitives.
 *
 * Depth comes from glass surfaces, neon edges and soft shadows — never from hard
 * offset shadows or heavy black borders. Actions are pills that compress on press
 * rather than translating.
 */

type Tone = 'red' | 'green' | 'judge' | 'pro' | 'heat' | 'neutral';

/** Primary action. Filled neon for the main path, glass for everything else. */
export function NeonButton({
  children,
  className,
  variant = 'glass',
  size = 'md',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'red' | 'green' | 'judge' | 'glass' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <button
      className={cn(
        'pill',
        size === 'sm' && 'px-3.5 py-2 text-[13px]',
        size === 'md' && 'px-5 py-2.5 text-sm',
        size === 'lg' && 'px-6 py-3.5 text-base',
        variant === 'red' && 'pill-red',
        variant === 'green' && 'pill-green',
        variant === 'judge' && 'pill-judge',
        variant === 'glass' && 'pill-glass',
        variant === 'ghost' && 'pill-ghost',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * The workhorse surface.
 *
 * `tone` tints the border and lays a coloured bloom outside it — this is how a
 * card announces its verdict without needing a stamp graphic.
 */
export function Panel({
  children,
  className,
  tone = 'neutral',
  as: Tag = 'div',
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  children: React.ReactNode;
  className?: string;
  tone?: Tone;
  as?: 'div' | 'article' | 'section' | 'aside';
}) {
  return (
    <Tag
      className={cn(
        'panel',
        tone === 'red' && 'edge-red',
        tone === 'green' && 'edge-green',
        tone === 'judge' && 'edge-judge',
        tone === 'pro' && 'edge-pro',
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

/** Small rounded tag. Categories, states, counts. */
export function Chip({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'chip',
        tone === 'red' && 'chip-red',
        tone === 'green' && 'chip-green',
        tone === 'judge' && 'chip-judge',
        tone === 'heat' && 'chip-heat',
        tone === 'pro' && 'chip-pro',
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * The verdict badge — the loudest element on a closed case.
 *
 * Deliberately not a rotated rubber stamp: that idiom belongs to the sibling
 * newsprint project. This is a flat neon plate with a glow.
 */
export function VerdictBadge({
  children,
  tone,
  className,
  animate = false,
}: {
  children: React.ReactNode;
  tone: 'red' | 'green' | 'judge';
  className?: string;
  animate?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-4 py-1.5 font-hud text-[11px] font-bold uppercase tracking-[0.2em]',
        tone === 'red' &&
          'bg-flag-red-deep text-flag-red ring-1 ring-flag-red/50 glow-red',
        tone === 'green' &&
          'bg-flag-green-deep text-flag-green ring-1 ring-flag-green/45 glow-green',
        tone === 'judge' &&
          'bg-judge-deep text-judge ring-1 ring-judge/45 glow-judge',
        animate && 'animate-verdict-in',
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * Jury split bar.
 *
 * Red fills from the left, lime from the right, meeting at a bright seam. The
 * seam is what makes the ratio readable at thumbnail size — a plain two-colour
 * bar reads as one blob when the split is lopsided.
 */
export function SplitBar({
  redPct,
  greenPct,
  hasVotes,
  animate = false,
  className,
}: {
  redPct: number;
  greenPct: number;
  hasVotes: boolean;
  animate?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex h-2.5 overflow-hidden rounded-[var(--radius-pill)] bg-surface-3',
        className
      )}
      role="img"
      aria-label={
        hasVotes
          ? `Jury split: ${redPct}% red flag, ${greenPct}% green flag`
          : 'No votes cast yet'
      }
    >
      {hasVotes && (
        <>
          <div
            className={cn(
              'h-full bg-flag-red shadow-[0_0_12px_0_var(--color-flag-red-glow)]',
              animate && 'animate-bar-fill'
            )}
            style={{ width: `${redPct}%` }}
          />
          {/* Bright seam so the boundary is unmistakable. */}
          <div className="h-full w-px bg-chalk/70" />
          <div
            className={cn(
              'h-full flex-1 bg-flag-green shadow-[0_0_12px_0_var(--color-flag-green-glow)]',
              animate && 'animate-bar-fill'
            )}
          />
        </>
      )}
    </div>
  );
}

/** Toxicity meter. Amber ramp, distinct from the red/green verdict axis. */
export function HeatBar({
  value,
  className,
}: {
  /** 0-100 */
  value: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        'h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-surface-3',
        className
      )}
      role="img"
      aria-label={`Toxicity ${clamped} out of 100`}
    >
      <div
        className="h-full rounded-[var(--radius-pill)] bg-gradient-to-r from-heat to-flag-red shadow-[0_0_10px_0_rgb(255_182_39/0.5)]"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** Fading hairline divider. */
export function Rule({ className }: { className?: string }) {
  return <hr className={cn('hairline border-0', className)} />;
}

/** Live pulse dot for in-session cases. */
export function LiveDot({
  tone = 'red',
  className,
}: {
  tone?: 'red' | 'judge';
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-1.5 animate-breathe rounded-full',
        tone === 'red' ? 'bg-flag-red text-flag-red' : 'bg-judge text-judge',
        className
      )}
    />
  );
}
