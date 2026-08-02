import { cn } from '@/lib/utils';

/**
 * THE RECORD — editorial primitives.
 *
 * Structure comes from hairline rules, whitespace and type scale, never from
 * heavy borders, glow or offset shadows. Accent colour is rationed: red belongs
 * to verdicts, and using it for ordinary chrome would spend the one signal the
 * page has.
 *
 * The module keeps its old filename and export names so the ~15 component call
 * sites port without churn. Everything inside is new.
 */

type Tone = 'red' | 'green' | 'split' | 'pro' | 'heat' | 'neutral';

/**
 * Action button.
 *
 * `ink` is the default primary: solid near-black. Red is reserved for actions
 * that *are* the red flag, so the accent keeps its meaning.
 */
export function NeonButton({
  children,
  className,
  variant = 'outline',
  size = 'md',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'ink' | 'red' | 'green' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <button
      className={cn(
        'pill',
        size === 'sm' && 'px-3 py-1.5 text-[13px]',
        size === 'md' && 'px-4 py-2 text-sm',
        size === 'lg' && 'px-5 py-2.5 text-[15px]',
        variant === 'ink' && 'pill-ink',
        variant === 'red' && 'pill-red',
        variant === 'green' && 'pill-green',
        variant === 'outline' && 'pill-outline',
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
 * `tone` adds a 3px left rule — the way a print layout marks a callout —
 * replacing the previous system's coloured glow.
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
        tone === 'split' && 'edge-split',
        tone === 'pro' && 'edge-pro',
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

/** Small inline tag: categories, states, counts. */
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
        tone === 'split' && 'chip-split',
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
 * The verdict, set as a headline rather than a badge.
 *
 * This is the biggest departure from every previous attempt: no stamp, no plate,
 * no glow. A serif line in the accent colour, with a rule above it — the way a
 * newspaper sets a ruling. At thumbnail size the *word* is what reads.
 */
export function VerdictBadge({
  children,
  tone,
  className,
  animate = false,
}: {
  children: React.ReactNode;
  tone: 'red' | 'green' | 'split';
  className?: string;
  animate?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-display text-[15px] font-semibold tracking-[-0.015em]',
        tone === 'red' && 'text-verdict-red',
        tone === 'green' && 'text-verdict-green',
        tone === 'split' && 'text-verdict-split',
        animate && 'animate-fade-up',
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
 * A single hairline-height bar: red from the left, green filling the remainder.
 * Deliberately thin — this is a data mark in a column of text, not a UI widget,
 * and a chunky rounded bar would break the editorial register.
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
      className={cn('flex h-1 overflow-hidden bg-wash', className)}
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
              'h-full bg-verdict-red',
              animate && 'animate-bar-fill'
            )}
            style={{ width: `${redPct}%` }}
          />
          <div
            className={cn(
              'h-full flex-1 bg-verdict-green',
              animate && 'animate-bar-fill'
            )}
          />
        </>
      )}
    </div>
  );
}

/** Toxicity meter. Amber, distinct from the red/green verdict axis. */
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
      className={cn('h-1 overflow-hidden bg-wash', className)}
      role="img"
      aria-label={`Toxicity ${clamped} out of 100`}
    >
      <div className="h-full bg-heat" style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** Hairline divider. `strong` marks a department break. */
export function Rule({
  className,
  strong = false,
}: {
  className?: string;
  strong?: boolean;
}) {
  return <hr className={cn(strong ? 'rule-strong' : 'hairline', className)} />;
}

/**
 * Live indicator for cases still taking votes.
 *
 * A small filled square rather than a pulsing dot — squares read as typographic
 * marks (▪) and sit better beside small-caps metadata than a glowing circle.
 */
export function LiveDot({
  tone = 'red',
  className,
}: {
  tone?: 'red' | 'split';
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-1.5 animate-pulse-soft',
        tone === 'red' ? 'bg-verdict-red' : 'bg-verdict-split',
        className
      )}
    />
  );
}
