import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { parseVerdict, verdictSchema, splitVerdict } from '../verdict-schema';

const VALID = {
  verdict: 'red',
  headline: 'GUILTY OF BREADCRUMBING',
  roast:
    'He kept you on a subscription plan with no benefits. You were not in a situationship, you were in a waiting room with worse magazines.',
  summary: 'Breadcrumbing, eight months',
  toxicity: 87,
};

describe('parseVerdict', () => {
  it('parses a clean JSON object', () => {
    expect(parseVerdict(JSON.stringify(VALID))).toEqual(VALID);
  });

  it('parses JSON wrapped in markdown fences', () => {
    const fenced = '```json\n' + JSON.stringify(VALID) + '\n```';
    expect(parseVerdict(fenced)).toEqual(VALID);
  });

  it('parses JSON wrapped in prose', () => {
    const prose = `Here is my ruling:\n${JSON.stringify(VALID)}\nCourt adjourned.`;
    expect(parseVerdict(prose)).toEqual(VALID);
  });

  it('rejects a non-integer toxicity', () => {
    expect(parseVerdict(JSON.stringify({ ...VALID, toxicity: 87.5 }))).toBeNull();
  });

  it('rejects a stringified toxicity', () => {
    // A common drift: the model answers "high" or "87" instead of 87.
    expect(parseVerdict(JSON.stringify({ ...VALID, toxicity: 'high' }))).toBeNull();
    expect(parseVerdict(JSON.stringify({ ...VALID, toxicity: '87' }))).toBeNull();
  });

  it('rejects toxicity outside 0-100', () => {
    expect(parseVerdict(JSON.stringify({ ...VALID, toxicity: 101 }))).toBeNull();
    expect(parseVerdict(JSON.stringify({ ...VALID, toxicity: -1 }))).toBeNull();
  });

  it('rejects an unknown verdict value', () => {
    expect(parseVerdict(JSON.stringify({ ...VALID, verdict: 'GUILTY' }))).toBeNull();
    expect(parseVerdict(JSON.stringify({ ...VALID, verdict: 'maybe' }))).toBeNull();
  });

  it('rejects a headline that would overflow the card', () => {
    const long = 'X'.repeat(61);
    expect(parseVerdict(JSON.stringify({ ...VALID, headline: long }))).toBeNull();
  });

  it('accepts a headline exactly at the 60-char limit', () => {
    const exact = 'X'.repeat(60);
    expect(
      parseVerdict(JSON.stringify({ ...VALID, headline: exact }))?.headline
    ).toHaveLength(60);
  });

  it('rejects missing fields', () => {
    const { roast, ...withoutRoast } = VALID;
    void roast;
    expect(parseVerdict(JSON.stringify(withoutRoast))).toBeNull();
  });

  it('rejects a runaway roast', () => {
    expect(
      parseVerdict(JSON.stringify({ ...VALID, roast: 'word '.repeat(200) }))
    ).toBeNull();
  });

  it('rejects plain prose with no JSON', () => {
    expect(parseVerdict('This is a red flag, obviously.')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(parseVerdict('')).toBeNull();
    expect(parseVerdict('   ')).toBeNull();
  });

  it('trims surrounding whitespace in fields', () => {
    const padded = { ...VALID, headline: '  GUILTY  ' };
    expect(parseVerdict(JSON.stringify(padded))?.headline).toBe('GUILTY');
  });
});

/*
 * Value normalisation exists because models reliably answer RED_FLAG / RED /
 * "red flag" when the database enum wants `red`. Without it, a perfectly good
 * generation gets discarded and we pay for a pointless fallback call.
 */
describe('parseVerdict — verdict value normalisation', () => {
  const cases: Array<[string, string]> = [
    ['RED_FLAG', 'red'],
    ['red_flag', 'red'],
    ['RED', 'red'],
    ['red flag', 'red'],
    ['GREEN_FLAG', 'green'],
    ['green flag', 'green'],
    ['GREEN', 'green'],
    ['SPLIT', 'split'],
    ['split_verdict', 'split'],
    ['MISTRIAL', 'split'],
    ['hung jury', 'split'],
    ['undecided', 'split'],
  ];

  for (const [input, expected] of cases) {
    it(`maps "${input}" to "${expected}"`, () => {
      const parsed = parseVerdict(JSON.stringify({ ...VALID, verdict: input }));
      expect(parsed?.verdict).toBe(expected);
    });
  }

  it('leaves an unrecognised value alone so the schema rejects it', () => {
    // Silently mapping an unknown value would risk a wrong verdict on a card.
    expect(parseVerdict(JSON.stringify({ ...VALID, verdict: 'banana' }))).toBeNull();
  });
});

describe('splitVerdict', () => {
  it('is always schema-valid', () => {
    for (const pct of [0, 33.3, 50, 99.9, 100]) {
      expect(verdictSchema.safeParse(splitVerdict(pct)).success).toBe(true);
    }
  });

  it('borrows the jury read rather than inventing a score', () => {
    expect(splitVerdict(72.4).toxicity).toBe(72);
    expect(splitVerdict(0).toxicity).toBe(0);
  });

  it('is labelled split', () => {
    expect(splitVerdict(50).verdict).toBe('split');
  });
});

describe('parseVerdict — properties', () => {
  test.prop([fc.string()])('never throws on arbitrary input', (s) => {
    expect(() => parseVerdict(s)).not.toThrow();
  });

  test.prop([fc.integer({ min: 0, max: 100 })])(
    'accepts every valid toxicity value',
    (toxicity) => {
      expect(parseVerdict(JSON.stringify({ ...VALID, toxicity }))).not.toBeNull();
    }
  );

  test.prop([fc.double({ min: 0, max: 100, noNaN: true })])(
    'split verdict output always validates',
    (pct) => {
      expect(verdictSchema.safeParse(splitVerdict(pct)).success).toBe(true);
    }
  );

  test.prop([fc.jsonValue()])(
    'never accepts arbitrary JSON that lacks the contract',
    (value) => {
      const result = parseVerdict(JSON.stringify(value));
      // Either it fails, or it genuinely satisfies the schema.
      if (result !== null) {
        expect(verdictSchema.safeParse(result).success).toBe(true);
      }
    }
  );
});
