import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Conditional className joining with Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a case reference for display.
 *
 * `public_id` already arrives as "CASE-7421" from the database, so this only
 * normalises casing and guards against a malformed value rather than inventing a
 * format. Kept as a function so the presentation can change in one place.
 */
export function formatCaseNo(publicId: string): string {
  return publicId.trim().toUpperCase();
}

/**
 * Vote split as one-decimal percentages that always sum to 100.
 *
 * Guards the zero-vote case (returns a 50/50 split with `hasVotes: false` so the
 * UI can render an empty bar instead of a misleading tie). The green side is
 * derived by subtraction rather than rounded independently, which is what keeps
 * the two numbers from summing to 99.9 or 100.1.
 */
export function voteSplit(
  red: number,
  green: number
): { red: number; green: number; total: number; hasVotes: boolean } {
  const total = red + green;
  if (total <= 0) {
    return { red: 50, green: 50, total: 0, hasVotes: false };
  }
  const redPct = Math.round((red / total) * 1000) / 10;
  return {
    red: redPct,
    green: Math.round((100 - redPct) * 10) / 10,
    total,
    hasVotes: true,
  };
}

/** Compact vote counts for narrow cards: 1200 → "1.2k". */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
  }
  return `${Math.round((n / 1_000_000) * 10) / 10}m`;
}

/**
 * Human countdown to a deadline, e.g. "4h 12m" / "38m" / "CLOSING".
 * Returns `null` once the deadline has passed so callers can switch to the
 * closed-case presentation.
 */
export function timeRemaining(closesAt: string | Date, now: Date = new Date()) {
  const end = typeof closesAt === 'string' ? new Date(closesAt) : closesAt;
  const ms = end.getTime() - now.getTime();
  if (Number.isNaN(ms) || ms <= 0) return null;

  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours >= 1) return `${hours}h ${minutes}m`;
  if (totalMinutes >= 1) return `${totalMinutes}m`;
  return 'CLOSING';
}

/** Truncate on a word boundary, appending an ellipsis when cut. */
export function excerpt(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
