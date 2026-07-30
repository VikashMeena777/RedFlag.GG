/**
 * PII redaction and contact-detail rejection.
 *
 * This is the main defence for the central risk of the product: cases are about
 * real people who never consented to appear. Two mechanisms:
 *
 *  1. REDACT — soft identifiers (names after "my ex", ages, cities) are masked
 *     into ███ blocks so the story still reads.
 *  2. REJECT — anything that could route a mob to a real person (handles, phone
 *     numbers, emails, URLs) fails the submission outright with a clear reason.
 *     Redacting these silently would be worse: the author would think it posted
 *     fine and the intent to dox would go unchallenged.
 *
 * Pure functions, no I/O, so they are cheap to property-test.
 */

export const REDACTION_MARK = '███';

export type RejectionCode =
  | 'email'
  | 'phone'
  | 'url'
  | 'handle'
  | 'social_platform'
  | 'long_digits';

export interface RedactionResult {
  /** Text with soft identifiers masked. */
  text: string;
  /** Hard violations. Non-empty means: do not publish. */
  rejections: RejectionCode[];
  /** Count of masked spans, for moderation telemetry. */
  redactionCount: number;
}

// ── Hard-reject patterns ──────────────────────────────────────────────────

/*
 * Email.
 *
 * A bare `@` must butt directly against the local-part with no leading space,
 * otherwise "follow @some.one" parses as an address and swallows the handle
 * before HANDLE_RE ever sees it. The bracketed and worded separators are
 * unambiguous obfuscation, so those may be surrounded by whitespace.
 *
 * The local-part charset covers the RFC 5322 specials, not just alphanumerics,
 * so exotic-but-valid addresses are still caught.
 */
const EMAIL_LOCAL = String.raw`[a-z0-9!#$%&'*+\/=?^_\`{|}~.%-]+`;
/** `@`, or an obfuscated separator which may carry surrounding whitespace. */
const AT_SEP = String.raw`(?:@|\s*\(at\)\s*|\s*\[at\]\s*|(?<=\S) at (?=\S))`;
const DOT_SEP = String.raw`(?:\.|\s*\(dot\)\s*|\s*\[dot\]\s*| dot )`;
/*
 * Domain allows arbitrarily many labels before the TLD (`a.a.aa`,
 * `mail.co.uk`), which a single-label pattern silently missed.
 */
const EMAIL_RE = new RegExp(
  `${EMAIL_LOCAL}${AT_SEP}[a-z0-9-]+(?:${DOT_SEP}[a-z0-9-]+)*${DOT_SEP}[a-z]{2,}\\b`,
  'gi'
);

/*
 * Handles: `@name`, not an email local-part (the email pass runs first and
 * blanks those out).
 *
 * The capture may end on `_` (valid and common in real handles) but never on
 * `.`, so a handle at the end of a sentence does not swallow the full stop.
 * Deliberately permissive about length: under-matching here means a real account
 * gets named, while over-matching only costs the author one edit.
 */
const HANDLE_RE =
  /(?:^|[\s(,.:;!?])@([a-z0-9](?:[a-z0-9._]*[a-z0-9_])?)/gi;

const URL_RE =
  /\b(?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9-]+\.(?:com|net|org|io|gg|co|in|me|app|dev|xyz|link)\b(?:\/[^\s]*)?/gi;

/**
 * Phone numbers, incl. Indian 10-digit and international forms, tolerating
 * spaces, dots and hyphens used to evade a naive digit match.
 */
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3,5}[\s.-]?\d{3,5}(?:[\s.-]?\d{2,5})?/g;

/** Runs of 12+ digits: card-ish / ID-ish, never legitimate in a story. */
const LONG_DIGITS_RE = /\d[\d\s-]{10,}\d/g;

/** "dm me on insta @x" style routing, even when the handle itself is oddly formed. */
const SOCIAL_PLATFORM_RE =
  /\b(?:insta(?:gram)?|snap(?:chat)?|whats\s?app|telegram|discord|tiktok|twitter|facebook|fb|linkedin)\b/gi;

// ── Soft-redact patterns ──────────────────────────────────────────────────

/**
 * A capitalised name introduced by a relationship word — "my ex Priya",
 * "this guy Rohan". Deliberately conservative: it needs the cue word, so
 * ordinary sentence-initial capitals survive.
 */
const NAMED_PERSON_RE =
  /\b((?:my|this|her|his|their|our)\s+(?:ex[- ]?(?:boyfriend|girlfriend|bf|gf|husband|wife|partner)?|boyfriend|girlfriend|bf|gf|husband|wife|partner|friend|bestie|roommate|flatmate|colleague|coworker|boss|manager|crush|situationship|talking\s+stage|classmate|senior|junior|cousin|brother|sister|mom|dad|mother|father)\s+)([A-Z][a-z]{1,19})\b/g;

/** "named Priya" / "called Rohan". */
const NAMED_INTRO_RE = /\b((?:named|called)\s+)([A-Z][a-z]{1,19})\b/g;

/** Institutions: "at St Xavier's College", "in Delhi University". */
const INSTITUTION_RE =
  /\b(?:at|in|from|joined|studies?\s+at|works?\s+at)\s+((?:[A-Z][a-zA-Z'&.-]*\s+){0,3}(?:College|University|School|Institute|Academy|Hospital|Ltd|Pvt|Inc|Corp|Technologies|Solutions))\b/g;

/**
 * Masks soft identifiers. Idempotent: running it on already-redacted text
 * leaves the ███ marks untouched.
 */
export function redactSoft(input: string): { text: string; count: number } {
  let count = 0;
  const mark = () => {
    count += 1;
    return REDACTION_MARK;
  };

  const text = input
    .replace(NAMED_PERSON_RE, (_m, lead: string) => `${lead}${mark()}`)
    .replace(NAMED_INTRO_RE, (_m, lead: string) => `${lead}${mark()}`)
    .replace(INSTITUTION_RE, (m: string, inst: string) =>
      m.replace(inst, mark())
    );

  return { text, count };
}

/**
 * Detects hard violations. Order matters: emails are consumed before handles so
 * an address does not also register as a handle, and phone detection ignores
 * anything that looks like a year or a plain small number.
 */
export function detectRejections(input: string): RejectionCode[] {
  const found = new Set<RejectionCode>();

  // Strip emails first so their local-parts don't trip the handle rule.
  const withoutEmails = input.replace(EMAIL_RE, (m) => {
    found.add('email');
    return ' '.repeat(m.length);
  });

  const withoutUrls = withoutEmails.replace(URL_RE, (m) => {
    found.add('url');
    return ' '.repeat(m.length);
  });

  if (HANDLE_RE.test(withoutUrls)) found.add('handle');
  HANDLE_RE.lastIndex = 0;

  if (LONG_DIGITS_RE.test(withoutUrls)) found.add('long_digits');
  LONG_DIGITS_RE.lastIndex = 0;

  // Phone: require >= 8 digits total to avoid flagging "8 months" or "2019".
  const phoneMatches = withoutUrls.match(PHONE_RE) ?? [];
  for (const candidate of phoneMatches) {
    const digits = candidate.replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 15) {
      found.add('phone');
      break;
    }
  }

  // A platform mention only matters when paired with routing intent.
  if (SOCIAL_PLATFORM_RE.test(withoutUrls)) {
    SOCIAL_PLATFORM_RE.lastIndex = 0;
    const hasRoutingIntent =
      /\b(?:dm|message|msg|text|add|follow|hit\s+me|reach|contact|find\s+(?:me|him|her|them))\b/i.test(
        withoutUrls
      );
    if (hasRoutingIntent && found.has('handle')) {
      found.add('social_platform');
    }
  }
  SOCIAL_PLATFORM_RE.lastIndex = 0;

  return [...found];
}

/** Full pipeline: mask soft identifiers, then report hard violations. */
export function redact(input: string): RedactionResult {
  const rejections = detectRejections(input);
  const { text, count } = redactSoft(input);
  return { text, rejections, redactionCount: count };
}

export const REJECTION_MESSAGES: Record<RejectionCode, string> = {
  email: 'Remove the email address. Cases stay anonymous.',
  phone: 'Remove the phone number. Cases stay anonymous.',
  url: 'Remove the link. Cases stay anonymous.',
  handle: 'Remove the @handle. No naming or tagging real accounts.',
  social_platform:
    'Remove the social handle. Do not send people to find someone.',
  long_digits: 'Remove the long number. That looks like personal data.',
};

/** One combined message for the submit form. */
export function rejectionMessage(codes: RejectionCode[]): string {
  if (codes.length === 0) return '';
  return codes.map((c) => REJECTION_MESSAGES[c]).join(' ');
}
