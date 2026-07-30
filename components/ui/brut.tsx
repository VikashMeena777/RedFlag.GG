import { cn } from '@/lib/utils';

/**
 * Brutalist button. Hard borders, offset shadow, and a press that physically
 * travels into the shadow — the tactile bit that makes voting feel like stamping.
 */
export function BrutButton({
  children,
  className,
  variant = 'ink',
  size = 'md',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'ink' | 'red' | 'green' | 'judge' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <button
      className={cn(
        'brut brut-press inline-flex items-center justify-center gap-2 font-docket font-bold uppercase tracking-[0.12em] disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' && 'px-3 py-2 text-[11px]',
        size === 'md' && 'px-5 py-3 text-xs',
        size === 'lg' && 'px-6 py-4 text-sm',
        variant === 'ink' && 'brut-shadow bg-highlighter text-ink',
        variant === 'red' && 'brut-shadow bg-flag-red text-paper-bright',
        variant === 'green' && 'brut-shadow bg-flag-green text-paper-bright',
        variant === 'judge' && 'brut-shadow bg-judge text-paper-bright',
        variant === 'ghost' && 'bg-paper text-ink',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** A manila file card: the base surface for everything on the docket. */
export function BrutCard({
  children,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'section';
}) {
  return (
    <Tag className={cn('brut brut-shadow halftone bg-paper-bright', className)}>
      {children}
    </Tag>
  );
}

/** Rubber-ink stamp. Rotated, double-bordered, letterpressed. */
export function Stamp({
  children,
  tone = 'ink',
  className,
  straight = false,
}: {
  children: React.ReactNode;
  tone?: 'ink' | 'red' | 'green' | 'judge';
  className?: string;
  straight?: boolean;
}) {
  return (
    <span
      className={cn(
        'stamp text-[11px]',
        straight && 'stamp-straight',
        tone === 'ink' && 'text-ink',
        tone === 'red' && 'bg-flag-red-lo text-flag-red',
        tone === 'green' && 'bg-flag-green-lo text-flag-green',
        tone === 'judge' && 'bg-judge-lo text-judge',
        className
      )}
    >
      {children}
    </span>
  );
}

/** Masking-tape category tag. */
export function Tape({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn('tape', className)}>{children}</span>;
}

/**
 * Live jury split bar. Red fills from the left, green from the right, with a
 * hard ink divider — readable at thumbnail size, which is the whole point.
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
      className={cn('brut-thin flex h-6 bg-paper-dim', className)}
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
              'bg-flag-red',
              animate && 'animate-bar-fill origin-left'
            )}
            style={{ width: `${redPct}%` }}
          />
          <div
            className={cn(
              'bg-flag-green',
              animate && 'animate-bar-fill origin-right'
            )}
            style={{ width: `${greenPct}%` }}
          />
        </>
      )}
    </div>
  );
}

/** Dashed form-style divider. */
export function DocketRule({ className }: { className?: string }) {
  return <div className={cn('docket-rule', className)} />;
}
