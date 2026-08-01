import { z } from 'zod';
import { sanitizeText } from '@/lib/moderation/sanitize';
import {
  CASE_CATEGORIES,
  VOTE_CHOICES,
  JUDGE_PERSONAS,
  DEFAULT_PERSONA,
  TITLE_MIN,
  TITLE_MAX,
  BODY_MIN,
  BODY_MAX,
} from '@/lib/types';

/**
 * Input validation.
 *
 * Zod runs first on every write path, before redaction, profanity, or the
 * database. Nothing reaches an SDK or SQL without passing through here.
 */

/**
 * Re-exported so existing call sites keep working.
 *
 * The implementation moved to lib/moderation/sanitize.ts when
 * `isomorphic-dompurify` was removed: it pulled in `jsdom`, whose ESM-only
 * dependency cannot be `require()`d from Vercel's CommonJS serverless bundle and
 * returned 500 on every SSR request. The replacement has no DOM dependency.
 */
export { sanitizeText };

/** Rejects strings that are technically long enough but carry no real content. */
const meaningful = (min: number) =>
  z.string().refine(
    (s) => {
      const letters = (s.match(/\p{L}/gu) ?? []).length;
      return letters >= Math.ceil(min * 0.5);
    },
    { message: 'Add more detail — the jury needs an actual story.' }
  );

export const fileCaseSchema = z.object({
  category: z.enum(CASE_CATEGORIES, {
    message: 'Pick a category.',
  }),
  title: z
    .string()
    .trim()
    .min(TITLE_MIN, `At least ${TITLE_MIN} characters.`)
    .max(TITLE_MAX, `Keep it under ${TITLE_MAX} characters.`)
    .pipe(meaningful(TITLE_MIN)),
  body: z
    .string()
    .trim()
    .min(BODY_MIN, `Give the jury at least ${BODY_MIN} characters to work with.`)
    .max(BODY_MAX, `Keep it under ${BODY_MAX} characters.`)
    .pipe(meaningful(BODY_MIN)),
  /** Which judge hears the case. Stored on the row as `judge_persona`. */
  persona: z.enum(JUDGE_PERSONAS).default(DEFAULT_PERSONA),
  /** Confirms the author accepted the no-doxxing rules. */
  acceptedRules: z.literal(true, {
    message: 'You must accept the court rules.',
  }),
});

export type FileCaseInput = z.infer<typeof fileCaseSchema>;

/**
 * `public_id` is the URL identifier, e.g. "CASE-7421". Pattern-matched rather
 * than length-checked so a malformed id fails before it reaches the database.
 */
const publicIdSchema = z
  .string()
  .trim()
  .regex(/^CASE-\d{1,12}$/i, 'Invalid case number.');

export const voteSchema = z.object({
  publicId: publicIdSchema,
  choice: z.enum(VOTE_CHOICES),
});

export const reportSchema = z.object({
  publicId: publicIdSchema,
  reason: z.enum([
    'identifies_someone',
    'harassment',
    'underage',
    'spam',
    'other',
  ]),
  details: z
    .string()
    .trim()
    .max(500, 'Keep it under 500 characters.')
    .default(''),
});

/** Derived from the schema so the two can never drift apart. */
export type ReportReason = z.infer<typeof reportSchema>['reason'];

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.');

/**
 * Disposable-email domains.
 *
 * Not exhaustive — it cannot be — but it raises the cost of minting throwaway
 * verified accounts. Combined with OTP (the address must actually receive mail)
 * and the 10-minute filing cooldown, casual abuse gets expensive.
 */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.info',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'throwawaymail.com',
  'yopmail.com',
  'getnada.com',
  'dispostable.com',
  'trashmail.com',
  'sharklasers.com',
  'grr.la',
  'maildrop.cc',
  'fakeinbox.com',
  'mintemail.com',
  'mohmal.com',
  'emailondeck.com',
  'tempr.email',
  'moakt.com',
  'luxusmail.org',
  'inboxkitten.com',
  'mailnesia.com',
  'spam4.me',
  'byom.de',
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase().trim();
  if (!domain) return true;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  // Common throwaway suffix patterns.
  return /(?:^|\.)(?:tempmail|trashmail|throwaway|guerrillamail)\./.test(domain);
}

export const signInSchema = z.object({
  email: emailSchema.refine((e) => !isDisposableEmail(e), {
    message: 'Use a permanent email address.',
  }),
});

export const verifyOtpSchema = z.object({
  email: emailSchema,
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

/** Flattens a ZodError into `{ field: message }` for form rendering. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    out[key] ??= issue.message;
  }
  return out;
}
