/**
 * Domain constants and shared types.
 *
 * These mirror the enums that already exist in the Supabase project
 * (`public.case_status`, `public.verdict_type`, `public.case_category`,
 * `public.vote_type`). The database is the source of truth — if you change a
 * value here without an accompanying migration, writes will fail at runtime.
 */

// ── Trust tiers ────────────────────────────────────────────────────────
//
// Derived, not stored. `profiles` carries `is_pro` / `is_admin` / `is_banned`
// rather than a tier column, so the tier is computed in lib/auth/viewer.ts.

export const TIERS = ['anonymous', 'verified', 'pro'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Jury weight per tier. Anonymous votes still count, but a botnet of cleared
 * browser sessions cannot out-shout real accounts.
 */
export const TIER_VOTE_WEIGHT: Record<Tier, number> = {
  anonymous: 1,
  verified: 3,
  pro: 3,
};

/** Daily filing allowance per tier. `Infinity` for paid users. */
export const TIER_DAILY_FILINGS: Record<Tier, number> = {
  anonymous: 0,
  verified: 2,
  pro: Number.POSITIVE_INFINITY,
};

export function canFile(tier: Tier): boolean {
  return TIER_DAILY_FILINGS[tier] > 0;
}

export function canReport(tier: Tier): boolean {
  return tier !== 'anonymous';
}

// ── Cases ──────────────────────────────────────────────────────────────

/** `public.case_category` */
export const CASE_CATEGORIES = [
  'dating',
  'friendship',
  'family',
  'work',
  'other',
] as const;
export type CaseCategory = (typeof CASE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CaseCategory, string> = {
  dating: 'Dating',
  friendship: 'Friendship',
  family: 'Family',
  work: 'Work',
  other: 'Other',
};

/**
 * `public.case_status`
 *
 * The lifecycle this app drives:
 *   live → judging → closed
 * `pending_review` is the pre-publication queue, `hidden` is a moderation
 * outcome, `deleted` is a soft delete. The gavel only ever touches `live`.
 */
export const CASE_STATUSES = [
  'pending_review',
  'live',
  'judging',
  'closed',
  'hidden',
  'deleted',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** Statuses the public may read. */
export const PUBLIC_STATUSES: CaseStatus[] = ['live', 'judging', 'closed'];

/** `public.vote_type` */
export const VOTE_CHOICES = ['red', 'green'] as const;
export type VoteChoice = (typeof VOTE_CHOICES)[number];

/** `public.verdict_type` — note `split`, which my earlier draft called MISTRIAL. */
export const VERDICTS = ['red', 'green', 'split'] as const;
export type VerdictKind = (typeof VERDICTS)[number];

export const VERDICT_LABELS: Record<VerdictKind, string> = {
  red: 'RED FLAG',
  green: 'GREEN FLAG',
  split: 'SPLIT VERDICT',
};

/** Judge personas. Stored as free text, so this is the app-level allowlist. */
export const JUDGE_PERSONAS = ['judge_roast', 'judge_calm', 'judge_petty'] as const;
export type JudgePersona = (typeof JUDGE_PERSONAS)[number];
export const DEFAULT_PERSONA: JudgePersona = 'judge_roast';

export const PERSONA_LABELS: Record<JudgePersona, string> = {
  judge_roast: 'Judge Roast',
  judge_calm: 'Judge Calm',
  judge_petty: 'Judge Petty',
};

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
/** Distinct reports before a case is auto-hidden pending review. */
export const AUTO_HIDE_REPORTS = 5;
/** Verdict generation attempts before the case is declared a split verdict. */
export const MAX_VERDICT_ATTEMPTS = 3;
/** Removed cases before an author loses filing rights. */
export const MAX_STRIKES = 3;
/** Accounts younger than this cannot file, which kills signup-and-spam. */
export const MIN_ACCOUNT_AGE_MINUTES = 10;

// ── Billing (Cashfree) ─────────────────────────────────────────────────

/** RedFlag Pro monthly price in INR. */
export const PRO_PRICE_INR = 99;
/**
 * Debit cap on the mandate. Cashfree auto-completes the subscription once this
 * many cycles run, which bounds an abandoned mandate rather than charging forever.
 */
export const PRO_MAX_CYCLES = 120;

// ── Verdict payload ────────────────────────────────────────────────────

/**
 * The AI verdict, as this app models it.
 *
 * Persisted across several columns rather than one JSONB blob, matching the
 * existing schema: `ai_verdict`, `ai_verdict_line`, `ai_roast`, `ai_summary`,
 * `toxicity_score`.
 */
export interface Verdict {
  verdict: VerdictKind;
  /** `ai_verdict_line` — the headline. */
  headline: string;
  /** `ai_roast` — the quotable part. */
  roast: string;
  /** `ai_summary` — short label used on cards and the docket. */
  summary: string;
  /** `toxicity_score` 0-100. */
  toxicity: number;
}

// ── View models ────────────────────────────────────────────────────────

/** A case as rendered in the feed or on a case page. Never includes author_id. */
export interface CaseView {
  id: string;
  /** `public_id`, e.g. "CASE-7421". Used in URLs and on share cards. */
  publicId: string;
  category: CaseCategory;
  title: string;
  body: string;
  status: CaseStatus;
  createdAt: string;
  closedAt: string | null;
  /**
   * Derived, not stored: `created_at` + SESSION_HOURS. The schema has no
   * `closes_at` column, so the deadline is computed once here rather than
   * recalculated in every component.
   */
  closesAt: string;
  redVotes: number;
  greenVotes: number;
  /** Tier-weighted tallies. These drive the displayed split and the ranking. */
  redWeight: number;
  greenWeight: number;
  verdict: Verdict | null;
  toxicity: number | null;
  persona: JudgePersona;
  isSplitVerdict: boolean;
  isFeatured: boolean;
  isAuthor: boolean;
  myVote: VoteChoice | null;
  /** True while the case is still taking votes. */
  isOpen: boolean;
  /** Present only when the media columns are populated. */
  imageUrls: string[];
  mediaBlurred: boolean;
}
