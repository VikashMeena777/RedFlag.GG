import { z } from 'zod';
import { VERDICTS } from '@/lib/types';

/**
 * The verdict contract.
 *
 * The LLM is asked for JSON only, and its reply is parsed through this schema
 * before it touches the database. Any drift — a missing field, a toxicity of
 * "high" instead of 85, a 400-word roast — is treated as a provider failure and
 * routed to the fallback. This is what keeps a malformed generation from
 * rendering a broken share card.
 */

export const verdictSchema = z.object({
  verdict: z.enum(VERDICTS),
  headline: z
    .string()
    .trim()
    .min(3)
    // 60 chars is the measured limit for Anton at card display size before it
    // overflows the 1080x1350 PNG. Enforced here, not just requested in the prompt.
    .max(60),
  roast: z.string().trim().min(20).max(400),
  sentence: z.string().trim().min(3).max(45),
  toxicity: z.number().int().min(0).max(100),
});

export type ParsedVerdict = z.infer<typeof verdictSchema>;

/**
 * Parses a raw model response.
 *
 * Tolerates the two most common deviations from "JSON only": markdown fences,
 * and a JSON object with prose wrapped around it. Anything else fails, and
 * failing is the correct outcome — the caller retries with the other provider.
 */
export function parseVerdict(raw: string): ParsedVerdict | null {
  const candidates: string[] = [];

  const trimmed = raw.trim();
  candidates.push(trimmed);

  // ```json ... ``` fences
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  // First balanced-looking object in a prose reply
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = verdictSchema.safeParse(JSON.parse(candidate));
      if (parsed.success) return parsed.data;
    } catch {
      // Not valid JSON; try the next shape.
    }
  }

  return null;
}

/**
 * The canned verdict used when both providers fail three times.
 *
 * A case must never sit in `in_session` forever — a permanently pending case
 * looks broken and the author gets nothing. A mistrial is an honest outcome and
 * still produces a shareable card.
 */
export function mistrialVerdict(redPct: number): ParsedVerdict {
  return {
    verdict: 'MISTRIAL',
    headline: 'MISTRIAL DECLARED',
    roast:
      'The judge reviewed this one, put down the gavel, and walked out. Some situations are so tangled even the court refuses to rule. The jury said what it said — take it from here.',
    sentence: 'CASE DISMISSED',
    // Fall back to the jury's own read rather than inventing a score.
    toxicity: Math.round(redPct),
  };
}
