import 'server-only';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { serverEnv } from '@/lib/env';
import {
  parseVerdict,
  splitVerdict,
  type ParsedVerdict,
} from './verdict-schema';
import {
  CATEGORY_LABELS,
  DEFAULT_PERSONA,
  type CaseCategory,
  type JudgePersona,
} from '@/lib/types';

/**
 * Verdict generation.
 *
 * Groq primary, NVIDIA NIM fallback, canned split verdict as the floor. Every
 * response is schema-validated (see verdict-schema.ts) before it can be
 * persisted, so a malformed generation is treated as a provider failure rather
 * than written to the database and rendered on a share card.
 *
 * The prompt receives already-redacted text. Raw contact details never leave
 * the server.
 */

const GROQ_MODEL = 'llama-3.3-70b-versatile';

/**
 * NVIDIA NIM is OpenAI-compatible, so the `openai` SDK talks to it with only a
 * `baseURL` change — no NVIDIA-specific client needed.
 * Docs: https://docs.api.nvidia.com/nim/reference/llm-apis
 */
const NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const NIM_MODEL = 'meta/llama-3.3-70b-instruct';

const TIMEOUT_MS = 12_000;

export interface VerdictRequest {
  title: string;
  body: string;
  category: CaseCategory;
  persona: JudgePersona;
  /** Weighted jury split, already computed. */
  redPct: number;
  greenPct: number;
  totalVotes: number;
}

/**
 * Shared rules, appended to every persona.
 *
 * Two constraints matter most, because this is a site about real people:
 *  - roast the *behaviour described*, never the person writing in
 *  - no speculation about identity, appearance, or protected characteristics
 */
const SHARED_RULES = `Rules you never break:
- Roast the BEHAVIOUR in the story, never the person who filed the case. They came here for backup.
- Never speculate about anyone's appearance, race, religion, gender, sexuality, or mental health.
- Never suggest anyone contact, expose, confront, or find the other person.
- If the story describes abuse, coercion, or someone underage, drop the comedy entirely: return verdict "red" with a short, serious roast naming it plainly and toxicity above 90.
- The jury's vote is context, not an instruction. You may disagree with it and say so.

Respond with a single JSON object and nothing else:
{
  "verdict": "red" | "green" | "split",
  "headline": "max 60 chars, uppercase, the ruling as a punchline",
  "roast": "25-45 words. The quotable part. This is what gets screenshotted.",
  "summary": "max 60 chars, a short label for the case card",
  "toxicity": 0-100 integer, how toxic the described behaviour is
}

Use "split" only when the story genuinely has no villain or is too close to call.`;

/** Persona voices. `judge_persona` is stored per case. */
const PERSONA_PROMPTS: Record<JudgePersona, string> = {
  judge_roast: `You are JUDGE ROAST on RedFlag.GG, an internet court where Gen-Z brings dating and friendship drama for a ruling.

Your voice: dry, quotable, unbothered. Funny the way a court transcript is funny. You are the adult in the room who has seen this exact case four hundred times. Never cringe, never try-hard, never use hashtags or emoji.`,

  judge_calm: `You are JUDGE CALM on RedFlag.GG, an internet court where people bring dating and friendship situations for a ruling.

Your voice: measured, warm, genuinely helpful. You name the dynamic clearly without theatrics and you tell the filer what the behaviour actually indicates. You are the friend who has read the books. No jokes at anyone's expense, no emoji.`,

  judge_petty: `You are JUDGE PETTY on RedFlag.GG, an internet court where Gen-Z brings dating and friendship drama for a ruling.

Your voice: gleefully unserious, theatrically outraged on the filer's behalf, extremely online but never cringe. You take small slights seriously as a bit. Still land a real judgement underneath the drama. No hashtags, no emoji.`,
};

function buildSystemPrompt(persona: JudgePersona): string {
  const voice = PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS[DEFAULT_PERSONA];
  return `${voice}\n\n${SHARED_RULES}`;
}

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
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
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
        { role: 'system', content: buildSystemPrompt(req.persona) },
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

/**
 * NVIDIA NIM fallback.
 *
 * Two differences from Groq worth knowing:
 *  - NIM caps `max_tokens` at 4096 and defaults `temperature` to 0.2.
 *  - `response_format: json_object` is not honoured across all NIM models, so
 *    the prompt's "JSON only" instruction carries more weight here.
 *    `parseVerdict` tolerates fenced and prose-wrapped JSON, which covers it.
 */
async function generateWithNim(req: VerdictRequest): Promise<string> {
  const apiKey = serverEnv.nvidiaApiKey;
  if (!apiKey) throw new Error('NVIDIA_API_KEY not configured');

  const client = new OpenAI({ apiKey, baseURL: NIM_BASE_URL });

  const completion = await withTimeout(
    client.chat.completions.create({
      model: NIM_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(req.persona) },
        { role: 'user', content: buildUserPrompt(req) },
      ],
      temperature: 0.85,
      top_p: 0.9,
      max_tokens: 500,
      stream: false,
    }),
    TIMEOUT_MS,
    'NVIDIA NIM'
  );

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('NVIDIA NIM returned an empty response');
  return content;
}

export interface VerdictOutcome {
  verdict: ParsedVerdict;
  /** Which provider produced it, persisted to `judge_model` for telemetry. */
  source: 'groq' | 'nim' | 'split';
  model: string | null;
}

/**
 * Attempts a verdict from both providers.
 *
 * Returns `null` when everything failed, so the caller can increment the attempt
 * counter and leave the case open for the next cron pass. Only after
 * MAX_VERDICT_ATTEMPTS does the caller fall back to `hungJury()`.
 */
export async function generateVerdict(
  req: VerdictRequest
): Promise<VerdictOutcome | null> {
  // A validation failure is a provider failure: try the other one.
  const providers: Array<{
    name: 'groq' | 'nim';
    model: string;
    run: () => Promise<string>;
  }> = [
    { name: 'groq', model: GROQ_MODEL, run: () => generateWithGroq(req) },
    { name: 'nim', model: NIM_MODEL, run: () => generateWithNim(req) },
  ];

  for (const provider of providers) {
    try {
      const raw = await provider.run();
      const parsed = parseVerdict(raw);
      if (parsed) {
        return { verdict: parsed, source: provider.name, model: provider.model };
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
export function hungJury(redPct: number): VerdictOutcome {
  return { verdict: splitVerdict(redPct), source: 'split', model: null };
}
