import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { sanitizeText } from '../sanitize';

/**
 * Sanitiser tests.
 *
 * This function replaced DOMPurify, so it carries real security weight and is
 * tested accordingly: known bypass techniques first, then invariants under
 * property testing.
 *
 * The core invariant is that output contains no `<` or `>` at all, and no
 * unescaped `&`. If that holds, the text cannot be parsed as markup by any
 * downstream consumer.
 */

describe('sanitizeText — basic markup stripping', () => {
  it('removes simple tags but keeps their text', () => {
    expect(sanitizeText('<b>bold</b> text')).toBe('bold text');
    expect(sanitizeText('<p>one</p><p>two</p>')).toBe('onetwo');
  });

  it('removes script tags AND their contents', () => {
    // Keeping the body would leave executable-looking text in the story.
    expect(sanitizeText('<script>alert(1)</script>hello')).toBe('hello');
    expect(sanitizeText('before<script>evil()</script>after')).toBe(
      'beforeafter'
    );
  });

  it('removes style tags and their contents', () => {
    expect(sanitizeText('<style>body{display:none}</style>text')).toBe('text');
  });

  it('removes comments, including unterminated ones', () => {
    expect(sanitizeText('a<!-- hidden -->b')).toBe('ab');
    expect(sanitizeText('a<!-- never closed')).toBe('a');
  });

  it('removes doctype and processing instructions', () => {
    expect(sanitizeText('<!DOCTYPE html>hi')).toBe('hi');
    expect(sanitizeText('<?php echo "x"; ?>hi')).toBe('hi');
  });

  it('removes CDATA sections', () => {
    expect(sanitizeText('a<![CDATA[<script>x</script>]]>b')).toBe('ab');
  });

  it('leaves ordinary prose untouched', () => {
    const prose =
      'He left me on read for six days and then asked why I was distant.';
    expect(sanitizeText(prose)).toBe(prose);
  });
});

describe('sanitizeText — bypass techniques', () => {
  it('defeats splice attacks that rebuild a tag', () => {
    // Stripping the inner tag once would splice "<scr" + "ipt>" into "<script>".
    expect(sanitizeText('<scr<script>ipt>alert(1)')).not.toContain('<');
    expect(sanitizeText('<scr<script>ipt>alert(1)')).not.toContain('script>');
  });

  it('defeats single-encoded markup', () => {
    expect(sanitizeText('&lt;script&gt;alert(1)&lt;/script&gt;')).not.toContain(
      '<'
    );
  });

  it('defeats double-encoded markup', () => {
    // Decodes to &lt;script&gt; on pass one, <script> on pass two.
    const nested = '&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;';
    const result = sanitizeText(nested);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('defeats numeric and hex entity encoding', () => {
    expect(sanitizeText('&#60;script&#62;')).not.toContain('<');
    expect(sanitizeText('&#x3c;script&#x3e;')).not.toContain('<');
    expect(sanitizeText('&#x3C;SCRIPT&#x3E;')).not.toContain('<');
  });

  it('defeats entities without a trailing semicolon', () => {
    // Browsers tolerate `&lt` without the semicolon; so must we.
    expect(sanitizeText('&ltscript&gt')).not.toContain('<');
  });

  it('defeats fullwidth lookalike characters via NFKC', () => {
    // U+FF1C FULLWIDTH LESS-THAN normalises to '<'.
    const result = sanitizeText('\uFF1Cscript\uFF1Ealert(1)');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('removes unterminated tags at end of input', () => {
    // Appending later text could otherwise complete the tag.
    expect(sanitizeText('hello<script')).toBe('hello');
    expect(sanitizeText('hello<img src=x')).toBe('hello');
  });

  it('strips event-handler attributes with the tag', () => {
    expect(sanitizeText('<img src=x onerror=alert(1)>')).toBe('');
    expect(sanitizeText('<div onclick="evil()">text</div>')).toBe('text');
  });

  it('handles mixed-case and whitespace-padded tags', () => {
    expect(sanitizeText('<ScRiPt>x</ScRiPt>')).toBe('');
    expect(sanitizeText('</script >text')).toBe('text');
  });

  it('leaves a literal ampersand literal', () => {
    /*
     * Sanitisation happens on storage; escaping belongs at render, and React
     * escapes text children already. Storing `&amp;` meant a user who wrote
     * "me & my ex" saw the escape sequence on their own case page.
     */
    expect(sanitizeText('me & my ex')).toBe('me & my ex');
    expect(sanitizeText('Q&A with my ex')).toBe('Q&A with my ex');
    // Entities we deliberately do not decode keep their text form.
    expect(sanitizeText('a &nbsp; b')).toBe('a &nbsp; b');
  });
});

describe('sanitizeText — invisible characters', () => {
  it('removes zero-width characters that hide text', () => {
    expect(sanitizeText('he\u200Bllo')).toBe('hello');
    expect(sanitizeText('he\u200Dllo')).toBe('hello');
    expect(sanitizeText('\uFEFFhello')).toBe('hello');
  });

  it('removes bidirectional overrides', () => {
    // These can visually reverse text, defeating human moderation.
    expect(sanitizeText('safe\u202Etxet esrever')).not.toContain('\u202E');
  });

  it('removes control characters but keeps newlines and tabs', () => {
    expect(sanitizeText('a\u0000b')).toBe('ab');
    expect(sanitizeText('a\u0007b')).toBe('ab');
    expect(sanitizeText('a\nb')).toBe('a\nb');
    expect(sanitizeText('a\tb')).toBe('a\tb');
  });
});

describe('sanitizeText — whitespace normalisation', () => {
  it('normalises CRLF and lone CR to LF', () => {
    expect(sanitizeText('a\r\nb')).toBe('a\nb');
    expect(sanitizeText('a\rb')).toBe('a\nb');
  });

  it('collapses 3+ newlines to a paragraph break', () => {
    expect(sanitizeText('a\n\n\n\n\nb')).toBe('a\n\nb');
    expect(sanitizeText('a\n\nb')).toBe('a\n\nb');
  });

  it('strips trailing spaces before newlines', () => {
    expect(sanitizeText('a   \nb')).toBe('a\nb');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeText('   padded   ')).toBe('padded');
  });

  it('returns empty string for empty or whitespace-only input', () => {
    expect(sanitizeText('')).toBe('');
    expect(sanitizeText('   ')).toBe('');
    expect(sanitizeText('<b></b>')).toBe('');
  });
});

describe('sanitizeText — properties', () => {
  test.prop([fc.string()])('never throws on arbitrary input', (s) => {
    expect(() => sanitizeText(s)).not.toThrow();
  });

  /*
   * The load-bearing invariant. If no angle bracket survives, the output cannot
   * open a tag in any consumer — React, a share card, or an LLM prompt.
   */
  test.prop([fc.string()])('output never contains angle brackets', (s) => {
    const result = sanitizeText(s);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  /*
   * Safety does not depend on escaping `&`. `stripMarkup` runs to a fixed point
   * and then deletes every remaining angle bracket, so a bare `&` cannot combine
   * with anything to form a tag — it is inert in text. What matters is that no
   * `&amp;` survives to be displayed literally to the user.
   */
  test.prop([fc.string()])('output never contains an escaped ampersand', (s) => {
    expect(sanitizeText(s)).not.toMatch(/&amp;/i);
  });

  test.prop([fc.string()])('is idempotent', (s) => {
    const once = sanitizeText(s);
    expect(sanitizeText(once)).toBe(once);
  });

  test.prop([fc.string()])('never contains zero-width characters', (s) => {
    expect(sanitizeText(s)).not.toMatch(/[\u200B-\u200F\uFEFF]/);
  });

  /*
   * Generated markup fragments, assembled from the pieces a real payload uses.
   * Broader than hand-written cases: it explores orderings I would not think to
   * write, which is how the splice and double-encoding paths were confirmed.
   */
  test.prop([
    fc.array(
      fc.constantFrom(
        '<script>',
        '</script>',
        '<img src=x onerror=alert(1)>',
        '&lt;',
        '&gt;',
        '&amp;lt;',
        '&#60;',
        '&#x3e;',
        '<!--',
        '-->',
        '<scr',
        'ipt>',
        '\uFF1C',
        '\u200B',
        'text',
        '\n'
      ),
      { maxLength: 12 }
    ),
  ])('no assembled payload produces markup', (parts) => {
    const result = sanitizeText(parts.join(''));
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });
});
