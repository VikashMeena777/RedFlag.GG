import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  fileCaseSchema,
  sanitizeText,
  isDisposableEmail,
  signInSchema,
  fieldErrors,
} from '../validation';

const VALID_BODY =
  'We were together for eight months and he never once introduced me to a single friend of his. Then he got upset when I asked why.';

describe('sanitizeText', () => {
  it('strips all markup', () => {
    expect(sanitizeText('<b>bold</b> text')).toBe('bold text');
    expect(sanitizeText('<script>alert(1)</script>hello')).toBe('hello');
  });

  it('keeps the inner text of removed tags', () => {
    expect(sanitizeText('<p>one</p><p>two</p>')).toBe('onetwo');
  });

  it('collapses excessive newlines but keeps paragraphs', () => {
    expect(sanitizeText('a\n\n\n\n\nb')).toBe('a\n\nb');
    expect(sanitizeText('a\n\nb')).toBe('a\n\nb');
  });

  it('normalises CRLF', () => {
    expect(sanitizeText('a\r\nb')).toBe('a\nb');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeText('   padded   ')).toBe('padded');
  });
});

describe('fileCaseSchema', () => {
  const valid = {
    category: 'dating',
    title: 'He liked her post during our fight',
    body: VALID_BODY,
    acceptedRules: true,
  };

  it('accepts a well-formed case', () => {
    expect(fileCaseSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an unknown category', () => {
    expect(
      fileCaseSchema.safeParse({ ...valid, category: 'politics' }).success
    ).toBe(false);
  });

  it('rejects a title that is too short', () => {
    expect(fileCaseSchema.safeParse({ ...valid, title: 'short' }).success).toBe(
      false
    );
  });

  it('rejects a body under the minimum', () => {
    expect(
      fileCaseSchema.safeParse({ ...valid, body: 'too short to judge' }).success
    ).toBe(false);
  });

  it('rejects filler that meets the length but has no letters', () => {
    // Length alone is a weak gate; "........" would otherwise pass.
    const filler = '.'.repeat(200);
    expect(fileCaseSchema.safeParse({ ...valid, body: filler }).success).toBe(
      false
    );
  });

  it('requires the rules checkbox', () => {
    expect(
      fileCaseSchema.safeParse({ ...valid, acceptedRules: false }).success
    ).toBe(false);
  });

  it('rejects an over-long body', () => {
    expect(
      fileCaseSchema.safeParse({ ...valid, body: 'a'.repeat(1201) }).success
    ).toBe(false);
  });
});

describe('isDisposableEmail', () => {
  it('flags known throwaway domains', () => {
    expect(isDisposableEmail('x@mailinator.com')).toBe(true);
    expect(isDisposableEmail('x@10minutemail.com')).toBe(true);
    expect(isDisposableEmail('x@yopmail.com')).toBe(true);
  });

  it('allows ordinary providers', () => {
    expect(isDisposableEmail('someone@gmail.com')).toBe(false);
    expect(isDisposableEmail('someone@outlook.com')).toBe(false);
    expect(isDisposableEmail('someone@company.co.in')).toBe(false);
  });

  it('treats a malformed address as disposable', () => {
    // Deny by default: no domain means we cannot vouch for it.
    expect(isDisposableEmail('nodomain')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isDisposableEmail('X@MAILINATOR.COM')).toBe(true);
  });
});

describe('signInSchema', () => {
  it('rejects disposable addresses', () => {
    expect(signInSchema.safeParse({ email: 'a@mailinator.com' }).success).toBe(
      false
    );
  });

  it('accepts and lowercases a real address', () => {
    const result = signInSchema.safeParse({ email: '  Person@Gmail.com ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('person@gmail.com');
  });
});

/*
 * The `verifyOtpSchema` block was removed with the 6-digit code flow.
 * Verification is magic-link only; `/auth/confirm` validates the token hash
 * server-side via Supabase, so there is no client-side code shape to assert.
 */

describe('fieldErrors', () => {
  it('maps issues to their field', () => {
    const result = fileCaseSchema.safeParse({
      category: 'dating',
      title: 'no',
      body: 'no',
      acceptedRules: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(errors.title).toBeTruthy();
      expect(errors.body).toBeTruthy();
    }
  });
});

describe('properties', () => {
  test.prop([fc.string()])('sanitizeText never throws', (s) => {
    expect(() => sanitizeText(s)).not.toThrow();
  });

  test.prop([fc.string()])('sanitizeText output contains no angle brackets', (s) => {
    // Nothing that survives sanitization can reopen a tag.
    expect(sanitizeText(s)).not.toMatch(/<[a-zA-Z/]/);
  });

  test.prop([fc.emailAddress()])('signInSchema never throws', (email) => {
    expect(() => signInSchema.safeParse({ email })).not.toThrow();
  });

  /*
   * Zod's email validator is deliberately stricter than RFC 5322: it rejects
   * exotic-but-legal local-parts like `!.a@a.aa`. That is the intended contract
   * for a signup flow, so the invariant worth asserting is that *ordinary*
   * addresses pass — not that everything RFC-legal does.
   */
  test.prop([
    // No consecutive dots and no leading/trailing dot: RFC forbids those in an
    // unquoted local-part, and Zod rightly rejects them.
    fc.stringMatching(/^[a-z0-9]+(?:[._][a-z0-9]+)*$/),
    fc.constantFrom('gmail.com', 'outlook.com', 'company.co.in', 'proton.me'),
  ])('accepts realistic addresses', (local, domain) => {
    const result = signInSchema.safeParse({ email: `${local}@${domain}` });
    expect(result.success).toBe(true);
  });
});
