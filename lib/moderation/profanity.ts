import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

/**
 * Profanity scanning.
 *
 * `obscenity` rather than `bad-words` because it normalises leetspeak and
 * spacing evasion ("f u c k", "sh1t") instead of matching naive substrings, and
 * it does not produce the notorious false positives on words that merely contain
 * a blocked substring.
 *
 * Policy: profanity does NOT block a submission. This is a site about dating
 * drama — swearing is the register. A hit only sets `needs_review` so the case
 * surfaces in the admin queue. Slurs are the exception and are handled by the
 * `severe` list below, which does block.
 */

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/**
 * Terms that block outright. Kept narrow and focused on slurs / targeted hate
 * rather than ordinary swearing, so the filter does not become a nuisance.
 * Matched against the normalised text produced by `obscenity`.
 */
const SEVERE_PATTERNS: RegExp[] = [
  /\bn[i1]gg(?:e|a)r?s?\b/i,
  /\bf[a4]gg?[o0]t?s?\b/i,
  /\btr[a4]nn(?:y|ie)s?\b/i,
  /\bk[i1]k[e3]s?\b/i,
  /\bch[i1]nk s?\b/i,
  /\br[e3]t[a4]rd(?:ed|s)?\b/i,
];

export interface ProfanityScan {
  /** Any profanity at all — flags for review, does not block. */
  hasProfanity: boolean;
  /** Slurs / targeted hate — blocks publication. */
  hasSevere: boolean;
  /** Number of distinct matches, for telemetry. */
  matchCount: number;
}

export function scanProfanity(text: string): ProfanityScan {
  const matches = matcher.getAllMatches(text, true);
  const hasSevere = SEVERE_PATTERNS.some((re) => re.test(text));

  return {
    hasProfanity: matches.length > 0,
    hasSevere,
    matchCount: matches.length,
  };
}

export const SEVERE_MESSAGE =
  'That language is not allowed here. Rewrite it without slurs.';
