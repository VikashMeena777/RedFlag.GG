/**
 * Domain constants and shared types.
 *
 * These values are duplicated in the SQL migration (as enums, defaults, and
 * CHECK constraints). If you change one here, change it there too — the
 * database is the real enforcement point, this is for the UI and validation.
 */

// ── Trust tiers ────────────────────────────────────────────────────────

export const TIERS = ['anonymous', 'verified', 'plus'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Jury weight per tier. Anonymous votes still count, but a botnet of cleared
 * browser sessions cannot out-shout real accounts.
 */
export const TIER_VOTE_WEIGHT: Record<Tier, number> = {
  anonymous: 1,
  verified: 3,
  plus: 3,
};

/** Daily filing allowance per tier. `Infinity` for paid users. */
export const TIER_DAILY_FILINGS: Record<Tier, number> = {
  anonymous: 0,
  verified: 2,
  plus: Number.POSITIVE_INFINITY,
};

export function canFile(tier: Tier): boolean {
  return TIER_DAILY_FILINGS[tier] > 0;
}

export function canFlag(tier: Tier): boolean {
  return tier !== 'anonymous';
}

// ── Cases ──────────────────────────────────────────────────────────────

export const CASE_CATEGORIES = [
  'dating',
  'situationship',
  'friendship',
  'family',
  'work',
] as const;
export type CaseCategory = (typeof CASE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CaseCategory, string> = {
  dating: 'Dating',
  situationship: 'Situationship',
  friendship: 'Friendship',
  family: 'Family',
  work: 'Work',
};

export const CASE_STATUSES = ['in_session', 'closed', 'removed'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const VOTE_CHOICES = ['red', 'green'] as const;
export type VoteChoice = (typeof VOTE_CHOICES)[number];

export const VERDICTS = ['RED_FLAG', 'GREEN_FLAG', 'MISTRIAL'] as const;
export type VerdictKind = (typeof VERDICTS)[number];

// ── Content limits ─────────────────────────────────────────────────────

export const TITLE_MIN = 8;
export const TITLE_MAX = 80;
export const BODY_MIN = 60;
export const BODY_MAX = 1200;

// ── Court mechanics ────────────────────────────────────────────────────

/** Jury phase length. Cases also close early once the vote target is hit. */
export const SESSION_HOURS = 12;
/** Weighted-vote count that triggers an early gavel. */
export const VOTE_TARGET = 100;
/** Distinct flags before a case is auto-hidden pending review. */
export const AUTO_HIDE_FLAGS = 5;
/** Verdict generation attempts before the case is declared a mistrial. */
export const MAX_VERDICT_ATTEMPTS = 3;
/** Removed cases before an author loses filing rights. */
export const MAX_STRIKES = 3;
/** Accounts younger than this cannot file, which kills signup-and-spam. */
export const MIN_ACCOUNT_AGE_MINUTES = 10;

// ── Verdict payload ────────────────────────────────────────────────────

/** Shape persisted in `cases.verdict`; validated by lib/ai/verdict-schema.ts. */
export interface Verdict {
  verdict: VerdictKind;
  headline: string;
  roast: string;
  sentence: string;
  toxicity: number;
}

// ── View models ────────────────────────────────────────────────────────

/** A case as rendered in the feed or on a case page. Never includes author_id. */
export interface CaseView {
  id: string;
  caseNo: number;
  slug: string;
  category: CaseCategory;
  title: string;
  body: string;
  status: CaseStatus;
  closesAt: string;
  createdAt: string;
  redVotes: number;
  greenVotes: number;
  redWeight: number;
  greenWeight: number;
  verdict: Verdict | null;
  toxicity: number | null;
  isAuthor: boolean;
  myVote: VoteChoice | null;
}
