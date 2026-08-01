import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  voteSplit,
  formatCaseNo,
  compactCount,
  timeRemaining,
  excerpt,
} from '../utils';

describe('voteSplit', () => {
  it('guards the zero-vote case', () => {
    const split = voteSplit(0, 0);
    expect(split.hasVotes).toBe(false);
    expect(split.total).toBe(0);
    // 50/50 is a rendering convenience, not a claimed tie — hasVotes says so.
    expect(split.red).toBe(50);
    expect(split.green).toBe(50);
  });

  it('computes a simple split', () => {
    const split = voteSplit(75, 25);
    expect(split.red).toBe(75);
    expect(split.green).toBe(25);
    expect(split.total).toBe(100);
    expect(split.hasVotes).toBe(true);
  });

  it('handles a unanimous verdict', () => {
    expect(voteSplit(10, 0)).toMatchObject({ red: 100, green: 0 });
    expect(voteSplit(0, 10)).toMatchObject({ red: 0, green: 100 });
  });

  it('rounds to one decimal', () => {
    const split = voteSplit(1, 2);
    expect(split.red).toBe(33.3);
    expect(split.green).toBe(66.7);
  });
});

describe('formatCaseNo', () => {
  it('passes through an already-canonical public id', () => {
    expect(formatCaseNo('CASE-7421')).toBe('CASE-7421');
  });

  it('normalises casing and trims surrounding whitespace', () => {
    expect(formatCaseNo('  case-4310  ')).toBe('CASE-4310');
  });
});

describe('compactCount', () => {
  it('leaves counts under 1000 alone', () => {
    expect(compactCount(0)).toBe('0');
    expect(compactCount(999)).toBe('999');
  });

  it('abbreviates thousands', () => {
    expect(compactCount(1000)).toBe('1k');
    expect(compactCount(1200)).toBe('1.2k');
    expect(compactCount(15_400)).toBe('15k');
  });

  it('abbreviates millions', () => {
    expect(compactCount(2_400_000)).toBe('2.4m');
  });
});

describe('timeRemaining', () => {
  const now = new Date('2026-01-01T12:00:00Z');

  it('formats hours and minutes', () => {
    expect(timeRemaining('2026-01-01T16:12:00Z', now)).toBe('4h 12m');
  });

  it('formats minutes only under an hour', () => {
    expect(timeRemaining('2026-01-01T12:38:00Z', now)).toBe('38m');
  });

  it('reports CLOSING in the final minute', () => {
    expect(timeRemaining('2026-01-01T12:00:30Z', now)).toBe('CLOSING');
  });

  it('returns null once the deadline has passed', () => {
    // This is the signal the UI uses to switch to the closed presentation.
    expect(timeRemaining('2026-01-01T11:59:00Z', now)).toBeNull();
  });

  it('returns null exactly at the deadline', () => {
    expect(timeRemaining('2026-01-01T12:00:00Z', now)).toBeNull();
  });

  it('returns null for an unparseable date', () => {
    expect(timeRemaining('not a date', now)).toBeNull();
  });
});

describe('excerpt', () => {
  it('leaves short text untouched', () => {
    expect(excerpt('short', 20)).toBe('short');
  });

  it('cuts on a word boundary', () => {
    const result = excerpt('the quick brown fox jumps over', 15);
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toContain('jumps');
  });

  it('collapses whitespace', () => {
    expect(excerpt('a   b\n\nc', 20)).toBe('a b c');
  });
});

describe('properties', () => {
  test.prop([
    fc.integer({ min: 0, max: 1_000_000 }),
    fc.integer({ min: 0, max: 1_000_000 }),
  ])('percentages always sum to 100 when votes exist', (red, green) => {
    const split = voteSplit(red, green);
    if (split.hasVotes) {
      // Derived by subtraction, so the pair must sum exactly.
      expect(split.red + split.green).toBeCloseTo(100, 5);
    }
  });

  test.prop([
    fc.integer({ min: 0, max: 100_000 }),
    fc.integer({ min: 0, max: 100_000 }),
  ])('percentages stay within range', (red, green) => {
    const split = voteSplit(red, green);
    expect(split.red).toBeGreaterThanOrEqual(0);
    expect(split.red).toBeLessThanOrEqual(100);
    expect(split.green).toBeGreaterThanOrEqual(0);
    expect(split.green).toBeLessThanOrEqual(100);
  });

  test.prop([fc.integer({ min: 1, max: 9_999_999 })])(
    'formatCaseNo round-trips a generated public id',
    (n) => {
      expect(formatCaseNo(`CASE-${n}`)).toBe(`CASE-${n}`);
    }
  );

  test.prop([fc.string()])('formatCaseNo never throws', (s) => {
    expect(() => formatCaseNo(s)).not.toThrow();
  });

  test.prop([fc.string(), fc.integer({ min: 5, max: 200 })])(
    'excerpt never exceeds the limit by more than the ellipsis',
    (text, max) => {
      expect(excerpt(text, max).length).toBeLessThanOrEqual(max + 1);
    }
  );

  test.prop([fc.nat({ max: 10_000_000 })])('compactCount never throws', (n) => {
    expect(() => compactCount(n)).not.toThrow();
  });
});
