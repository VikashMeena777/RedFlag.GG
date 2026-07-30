import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';
import {
  CASE_CATEGORIES,
  VOTE_CHOICES,
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
 * Strips all markup. `ALLOWED_TAGS: []` means the output is plain text — the app
 * never renders user HTML, so there is nothing to preserve. This runs after
 * length validation so a tag-stuffed payload cannot pass the length check and
 * then collapse to something too short.
 */
export function sanitizeText(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  })
    .replace(/\r\n/g, '\n')
    // Collapse runs of 3+ newlines; keeps paragraphs, kills whitespace padding.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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
  /** Confirms the author accepted the no-doxxing rules. */
  acceptedRules: z.literal(true, {
    message: 'You must accept the court rules.',
  }),
});

export type FileCaseInput = z.infer<typeof fileCaseSchema>;

export const voteSchema = z.object({
  slug: z.string().trim().min(1).max(24),
  choice: z.enum(VOTE_CHOICES),
});

export const flagSchema = z.object({
  slug: z.string().trim().min(1).max(24),
  reason: z
    .string()
    .trim()
    .min(4, 'Tell us why.')
    .max(300, 'Keep it under 300 characters.'),
});

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
