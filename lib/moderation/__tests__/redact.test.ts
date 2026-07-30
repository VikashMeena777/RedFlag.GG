import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  redact,
  redactSoft,
  detectRejections,
  REDACTION_MARK,
} from '../redact';

describe('detectRejections — hard violations', () => {
  it('catches plain email addresses', () => {
    expect(detectRejections('mail me at rohan.k@gmail.com ok')).toContain(
      'email'
    );
  });

  it('catches obfuscated emails', () => {
    expect(detectRejections('rohan (at) gmail (dot) com')).toContain('email');
    expect(detectRejections('rohan [at] gmail [dot] com')).toContain('email');
  });

  it('catches @handles', () => {
    expect(detectRejections('her insta is @priya_shah")')).toContain('handle');
    expect(detectRejections('go follow @some.one now')).toContain('handle');
  });

  it('does not treat an email local-part as a separate handle', () => {
    // The email is consumed first, so this is an `email` violation only.
    const codes = detectRejections('contact me: someone@example.com');
    expect(codes).toContain('email');
    expect(codes).not.toContain('handle');
  });

  it('catches URLs including bare domains', () => {
    expect(detectRejections('see https://insta.com/x')).toContain('url');
    expect(detectRejections('check redflag.gg for it')).toContain('url');
    expect(detectRejections('www.example.org/profile')).toContain('url');
  });

  it('catches phone numbers in several formats', () => {
    expect(detectRejections('call 9876543210')).toContain('phone');
    expect(detectRejections('+91 98765 43210 is his')).toContain('phone');
    expect(detectRejections('ring 987-654-3210')).toContain('phone');
  });

  it('does not flag ordinary small numbers or years', () => {
    expect(detectRejections('we dated for 8 months in 2019')).not.toContain(
      'phone'
    );
    expect(detectRejections('he is 24 and I am 22')).not.toContain('phone');
    expect(detectRejections('it happened 3 times')).not.toContain('phone');
  });

  it('catches long digit runs', () => {
    expect(detectRejections('id 4111111111111111 lol')).toContain(
      'long_digits'
    );
  });

  it('flags platform routing only when paired with a handle', () => {
    const routing = detectRejections('dm him on instagram @rohan_k');
    expect(routing).toContain('social_platform');

    // Merely mentioning a platform is normal storytelling, not doxxing.
    const mention = detectRejections(
      'he posted a story on instagram about it and I cried'
    );
    expect(mention).not.toContain('social_platform');
  });

  it('returns an empty list for a clean story', () => {
    const clean =
      'We were together for two years and he never once introduced me to his friends.';
    expect(detectRejections(clean)).toEqual([]);
  });
});

describe('redactSoft — masking identifiers', () => {
  it('masks a name introduced by a relationship cue', () => {
    const { text, count } = redactSoft('So my ex Priya texted me again');
    expect(text).toBe(`So my ex ${REDACTION_MARK} texted me again`);
    expect(count).toBe(1);
  });

  it('masks names after named/called', () => {
    expect(redactSoft('a guy named Rohan').text).toBe(
      `a guy named ${REDACTION_MARK}`
    );
  });

  it('masks institutions', () => {
    const { text } = redactSoft('she studies at Delhi University now');
    expect(text).toContain(REDACTION_MARK);
    expect(text).not.toContain('Delhi University');
  });

  it('leaves ordinary capitalised words alone', () => {
    const input = 'Monday was awful. I cried. Then Tuesday happened.';
    expect(redactSoft(input).text).toBe(input);
  });

  it('is idempotent', () => {
    const once = redactSoft('my ex Priya said').text;
    expect(redactSoft(once).text).toBe(once);
  });
});

describe('redact — full pipeline', () => {
  it('reports rejections and masks in one pass', () => {
    const result = redact('my ex Priya, dm her @priya_s');
    expect(result.rejections).toContain('handle');
    expect(result.text).toContain(REDACTION_MARK);
    expect(result.redactionCount).toBeGreaterThan(0);
  });

  it('passes a clean anonymous story untouched', () => {
    const clean =
      'He left me on read for six days and then asked why I was distant.';
    const result = redact(clean);
    expect(result.rejections).toEqual([]);
    expect(result.text).toBe(clean);
  });
});

// ── Property-based: the invariant that actually matters ──────────────────

describe('redact — properties', () => {
  test.prop([fc.emailAddress()])('never lets an email through', (email) => {
    expect(detectRejections(`contact ${email} please`)).toContain('email');
  });

  test.prop([fc.webUrl()])('never lets a URL through', (url) => {
    expect(detectRejections(`look at ${url}`)).toContain('url');
  });

  test.prop([
    fc.stringMatching(/^[a-z][a-z0-9._]{2,20}$/),
  ])('never lets an @handle through', (handle) => {
    expect(detectRejections(`follow @${handle} now`)).toContain('handle');
  });

  test.prop([fc.integer({ min: 1_000_000_00, max: 9_999_999_999 })])(
    'never lets a phone-length number through',
    (n) => {
      expect(detectRejections(`call ${n}`)).toContain('phone');
    }
  );

  test.prop([fc.string()])('redactSoft never throws', (s) => {
    expect(() => redactSoft(s)).not.toThrow();
  });

  test.prop([fc.string()])('detectRejections never throws', (s) => {
    expect(() => detectRejections(s)).not.toThrow();
  });

  test.prop([fc.string()])(
    'redactSoft output never contains a partial marker',
    (s) => {
      const { text } = redactSoft(s);
      // Every occurrence of the mark must be the full marker.
      const partial = text.match(/█+/g) ?? [];
      for (const p of partial) {
        expect(p.length % REDACTION_MARK.length).toBe(0);
      }
    }
  );
});
