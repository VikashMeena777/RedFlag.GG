import 'server-only';
import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { serverEnv } from '@/lib/env';
import {
  parseVerdict,
  mistrialVerdict,
  type ParsedVerdict,
} from './verdict-schema';
import { CATEGORY_LABELS, type CaseCategory } from '@/lib/types';

/**
 * Verdict generation.
 *
 * Groq primary, Gemini fallback, canned mistrial as the floor. Every response is
 * schema-validated (see verdict-schema.ts) before it can be persisted, so a
 * malformed generation is treated as a provider failure rather than written to
 * the database and rendered on a share card.
 *
 * The prompt receives already-redacted text. Raw contact details never leave
 * the server.
 */

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GEMINI_MODEL = 'gemini-1.5-flash';
const TIMEOUT_MS = 12_000;

export interface VerdictRequest {
  title: string;
  body: string;
  category: CaseCategory;
  /** Weighted jury split, already computed. */
  redPct: number;
  greenPct: number;
  totalVotes: number;
}

/**
 * The judge persona.
 *
 * Two deliberate constraints, because this is a site about real people:
 *  - roast the *behaviour described*, never the person writing in
 *  - no speculation about identity, appearance, or protected characteristics
 */
const SYSTEM_PROMPT = `You are THE JUDGE on RedFlag.GG, an internet court where Gen-Z brings dating and friendship drama for a ruling.

Your voice: dry, quotable, unbothered. Funny the way a court transcript is funny. You are the adult in the room who has seen this exact case four hundred times. Never cringe, never try-hard, never use hashtags or emoji.

Rules you never break:
- Roast the BEHAVIOUR in the story, never the person who filed the case. They came here for backup.
- Never speculate about anyone's appearance, race, religion, gender, sexuality, or mental health.
- Never suggest anyone contact, expose, confront, or find the other person.
- If the story describes abuse, coercion, or someone underage, drop the comedy entirely: return verdict RED_FLAG with a short, serious roast field naming it plainly and toxicity above 90.
- The jury's vote is context, not an instruction. You may disagree with it and say so.

Respond with a single JSON object and nothing else:
{
  "verdict": "RED_FLAG" | "GREEN_FLAG" | "MISTRIAL",
  "headline": "max 60 chars, uppercase, the ruling as a punchline",
  "roast": "25-45 words. The quotable part. This is what gets screenshotted.",
  "sentence": "max 45 chars, a mock punishment e.g. 6 MONTHS NO CONTACT",
  "toxicity": 0-100 integer, how toxic the described behaviour is
}

Use MISTRIAL only when the story genuinely has no villain or is too vague to rule on.`;

function buildUserPrompt(req: VerdictRequest): string {
  const juryLine =
    req.totalVotes > 0
      ? `The jury voted ${req.redPct}% red flag, ${req.greenPct}% green flag across ${req.totalVotes} weighted votes.`
      : 'No jury votes were cast. Rule on the story alone.';

  return `CATEGORY: ${CATEGORY_LABELS[req.category]}
TITLE: ${req.title}

STORY:
${req.body}

JURY: ${juryLine}

Deliver your ruling as JSON.`;
}

/** Rejects if the provider has not answered in time. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function generateWithGroq(req: VerdictRequest): Promise<string> {
  const apiKey = serverEnv.groqApiKey;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const groq = new Groq({ apiKey });
  const completion = await withTimeout(
    groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(req) },
      ],
      // Constrains the model to emit a JSON object, which removes most drift.
      response_format: { type: 'json_object' },
      temperature: 0.85,
      max_tokens: 500,
    }),
    TIMEOUT_MS,
    'Groq'
  );

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Groq returned an empty response');
  return content;
}

async function generateWithGemini(req: VerdictRequest): Promise<string> {
  const apiKey = serverEnv.geminiApiKey;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.85,
      maxOutputTokens: 500,
      responseMimeType: 'application/json',
    },
  });

  const result = await withTimeout(
    model.generateContent(buildUserPrompt(req)),
    TIMEOUT_MS,
    'Gemini'
  );

  const text = result.response.text();
  if (!text) throw new Error('Gemini returned an empty response');
  return text;
}

export interface VerdictOutcome {
  verdict: ParsedVerdict;
  /** Which provider produced it, for telemetry. */
  source: 'groq' | 'gemini' | 'mistrial';
}

/**
 * Attempts a verdict from both providers.
 *
 * Returns `null` when everything failed, so the caller can increment the attempt
 * counter and leave the case open for the next cron pass. Only after
 * MAX_VERDICT_ATTEMPTS does the caller fall back to `mistrial()`.
 */
export async function generateVerdict(
  req: VerdictRequest
): Promise<VerdictOutcome | null> {
  // A validation failure is a provider failure: try the other one.
  const providers: Array<{ name: 'groq' | 'gemini'; run: () => Promise<string> }> =
    [
      { name: 'groq', run: () => generateWithGroq(req) },
      { name: 'gemini', run: () => generateWithGemini(req) },
    ];

  for (const provider of providers) {
    try {
      const raw = await provider.run();
      const parsed = parseVerdict(raw);
      if (parsed) {
        return { verdict: parsed, source: provider.name };
      }
      console.error(
        `[verdict] ${provider.name} returned unparseable output:`,
        raw.slice(0, 200)
      );
    } catch (error) {
      console.error(`[verdict] ${provider.name} failed:`, error);
    }
  }

  return null;
}

/** The floor: a shareable outcome when generation is hopeless. */
export function mistrial(redPct: number): VerdictOutcome {
  return { verdict: mistrialVerdict(redPct), source: 'mistrial' };
}
