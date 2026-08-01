import { z } from 'zod';
import { VERDICTS, type VerdictKind } from '@/lib/types';

/**
 * The verdict contract.
 *
 * The LLM is asked for JSON only, and its reply is parsed through this schema
 * before it touches the database. Any drift — a missing field, a toxicity of
 * "high" instead of 85, a 400-word roast — is treated as a provider failure and
 * routed to the fallback. This is what keeps a malformed generation from
 * rendering a broken share card.
 *
 * Field names map onto the existing `cases` columns:
 *   verdict  → ai_verdict       (enum: red | green | split)
 *   headline → ai_verdict_line
 *   roast    → ai_roast
 *   summary  → ai_summary
 *   toxicity → toxicity_score
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
  /** Short label for the docket and card chrome. */
  summary: z.string().trim().min(3).max(60),
  toxicity: z.number().int().min(0).max(100),
});

export type ParsedVerdict = z.infer<typeof verdictSchema>;

/**
 * Parses a raw model response.
 *
 * Tolerates the two most common deviations from "JSON only": markdown fences,
 * and a JSON object with prose wrapped around it. Anything else fails, and
 * failing is the correct outcome — the caller retries with the other provider.
 *
 * Also normalises the verdict value, because models reliably return
 * `RED_FLAG` / `RED` / `red flag` when the enum wants `red`.
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
      const parsed = verdictSchema.safeParse(
        normaliseVerdictValue(JSON.parse(candidate))
      );
      if (parsed.success) return parsed.data;
    } catch {
      // Not valid JSON; try the next shape.
    }
  }

  return null;
}

/**
 * Coerces common model spellings onto the database enum.
 *
 * Without this, a perfectly good generation is discarded because the model wrote
 * `RED_FLAG` instead of `red`. Anything unrecognised is left alone so the schema
 * rejects it rather than being silently mapped to a wrong value.
 */
function normaliseVerdictValue(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;

  const obj = value as Record<string, unknown>;
  if (typeof obj.verdict !== 'string') return obj;

  const key = obj.verdict.trim().toLowerCase().replace(/[\s-]+/g, '_');

  const map: Record<string, VerdictKind> = {
    red: 'red',
    red_flag: 'red',
    redflag: 'red',
    green: 'green',
    green_flag: 'green',
    greenflag: 'green',
    split: 'split',
    split_verdict: 'split',
    mistrial: 'split',
    hung: 'split',
    hung_jury: 'split',
    undecided: 'split',
  };

  const mapped = map[key];
  return mapped ? { ...obj, verdict: mapped } : obj;
}

/**
 * The canned verdict used when both providers fail repeatedly.
 *
 * A case must never sit open forever — a permanently pending case looks broken
 * and the author gets nothing. A split verdict is an honest outcome and still
 * produces a shareable card.
 */
export function splitVerdict(redPct: number): ParsedVerdict {
  return {
    verdict: 'split',
    headline: 'THE JURY IS SPLIT',
    roast:
      'The judge read this one twice, put down the gavel, and let the jury keep it. Some situations are genuinely a coin flip, and pretending otherwise would be its own red flag.',
    summary: 'Hung jury',
    // Fall back to the jury's own read rather than inventing a score.
    toxicity: Math.round(redPct),
  };
}
