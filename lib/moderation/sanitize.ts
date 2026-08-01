/**
 * Plain-text sanitisation, with no DOM dependency.
 *
 * Replaces `isomorphic-dompurify`, which pulled in `jsdom` and broke the Vercel
 * build outright: jsdom@29 depends on an ESM-only package that a CommonJS
 * serverless bundle cannot `require()`, producing
 * `ERR_REQUIRE_ESM ... @exodus/bytes/encoding-lite.js` on every SSR request.
 *
 * Shipping a full DOM implementation was never warranted here. The app calls
 * DOMPurify with `ALLOWED_TAGS: []`, i.e. it strips *all* markup and keeps text —
 * a whitelist-free operation that needs no HTML parser.
 *
 * The threat model is narrow and worth stating, because it justifies the
 * approach: user text is stored in Postgres and rendered by React as a JSX text
 * child, which escapes `<`, `>`, `&`, `"` and `'` automatically. Nothing here is
 * ever passed to `dangerouslySetInnerHTML`. So this function is defence in depth
 * plus normalisation — the goal is that stored text contains no markup at all, so
 * it stays inert everywhere: React, share-card rendering, an LLM prompt, or a
 * future non-React consumer.
 *
 * Order matters throughout. Each step is written so its output cannot be
 * re-interpreted as markup by a later step, and the whole function is idempotent.
 */

/**
 * Named entities that decode to characters usable in an injection payload.
 *
 * Only these are decoded, deliberately. A general entity table would let
 * `&nbsp;` and friends decode into invisible characters that survive the tag
 * stripper — so anything not listed is neutralised in `escapeResidualEntities`
 * instead.
 */
const DANGEROUS_ENTITIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/&lt;?/gi, '<'],
  [/&gt;?/gi, '>'],
  [/&quot;?/gi, '"'],
  [/&apos;?/gi, "'"],
  [/&#0*39;?/g, "'"],
  [/&#x0*27;?/gi, "'"],
  [/&#0*34;?/g, '"'],
  [/&#x0*22;?/gi, '"'],
  [/&#0*60;?/g, '<'],
  [/&#x0*3c;?/gi, '<'],
  [/&#0*62;?/g, '>'],
  [/&#x0*3e;?/gi, '>'],
  // `&amp;` must be last: decoding it earlier would let `&amp;lt;` become `<`.
  [/&amp;?/gi, '&'],
];

/**
 * Decodes entities that could reconstruct markup, repeatedly.
 *
 * Multi-pass because attackers nest encodings: `&amp;lt;script&amp;gt;` decodes
 * to `&lt;script&gt;` on pass one and `<script>` on pass two. A single pass would
 * hand the tag stripper text that *looks* clean but decodes to a tag in the
 * browser. Capped to keep a pathological input from spinning.
 */
function decodeDangerousEntities(input: string): string {
  let text = input;

  for (let pass = 0; pass < 5; pass += 1) {
    const before = text;
    for (const [pattern, replacement] of DANGEROUS_ENTITIES) {
      text = text.replace(pattern, replacement);
    }
    if (text === before) break;
  }

  return text;
}

/**
 * Removes HTML tags, comments, and CDATA sections.
 *
 * Also loops: stripping can splice two fragments into a new tag, the classic
 * `<scr<script>ipt>` becoming `<script>` after one pass. Iterating to a fixed
 * point is what makes that safe.
 *
 * The unterminated-`<` case is handled last. An input ending in `<script` has no
 * closing bracket, so a tag pattern never matches it — but appending more text
 * later could complete it, so any surviving angle bracket is dropped.
 */
function stripMarkup(input: string): string {
  let text = input;

  for (let pass = 0; pass < 8; pass += 1) {
    const before = text;

    text = text
      // Comments and CDATA, including the unterminated forms browsers tolerate.
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<!--[\s\S]*$/g, '')
      .replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, '')
      // Doctype and processing instructions.
      .replace(/<![^>]*>/g, '')
      .replace(/<\?[\s\S]*?\?>/g, '')
      // Script and style, contents included: their text is code, not prose.
      .replace(/<script\b[\s\S]*?(?:<\/script\s*>|$)/gi, '')
      .replace(/<style\b[\s\S]*?(?:<\/style\s*>|$)/gi, '')
      // Any remaining complete tag.
      .replace(/<\/?[a-zA-Z][^>]*>/g, '')
      // A bracket that opens something tag-shaped but never closes.
      .replace(/<\/?[a-zA-Z][^<]*$/g, '');

    if (text === before) break;
  }

  // Nothing tag-shaped can survive, so remaining brackets are stray literals.
  return text.replace(/[<>]/g, '');
}

/**
 * Neutralises any `&` still present.
 *
 * By this point every dangerous entity has been decoded and every tag removed,
 * so a surviving `&` is either literal or an entity we chose not to decode
 * (`&nbsp;`, `&#8203;`). Escaping it to `&amp;` guarantees the output cannot be
 * re-parsed into markup by a consumer that decodes entities, while still
 * displaying as `&` — and it keeps the function idempotent, since `&amp;` decodes
 * back to `&` on a second run and re-escapes identically.
 */
function escapeResidualAmpersands(input: string): string {
  return input.replace(/&/g, '&amp;');
}

/**
 * Strips characters that are invisible but semantically active.
 *
 * These matter for a site about real people: zero-width joiners and
 * bidirectional overrides can hide text inside seemingly innocent strings, or
 * visually reverse it, defeating both the PII redaction and human moderation.
 * Removing them keeps what a moderator sees identical to what is stored.
 *
 * Kept: `\n`, `\r`, `\t`. Removed: other C0/C1 controls, zero-width characters,
 * bidi overrides, and the BOM.
 */
function stripInvisibleCharacters(input: string): string {
  return (
    input
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F]/g, '')
      .replace(/\uFEFF/g, '')
  );
}

/**
 * Converts arbitrary input to inert plain text.
 *
 * Pipeline, in required order:
 *  1. Unicode NFKC normalisation — collapses lookalike forms so `＜` cannot slip
 *     past the tag stripper as a fullwidth `<`.
 *  2. Decode dangerous entities (multi-pass) so encoded markup is exposed.
 *  3. Strip markup (multi-pass) so splice attacks cannot rebuild a tag.
 *  4. Escape residual `&` so nothing can be re-parsed downstream.
 *  5. Remove invisible/bidi characters that could hide or reverse content.
 *  6. Normalise whitespace: CRLF to LF, collapse 3+ newlines to a paragraph
 *     break, trim.
 *
 * Idempotent: `sanitizeText(sanitizeText(x)) === sanitizeText(x)`.
 */
export function sanitizeText(input: string): string {
  if (!input) return '';

  let text = input.normalize('NFKC');
  text = decodeDangerousEntities(text);
  text = stripMarkup(text);
  text = escapeResidualAmpersands(text);
  text = stripInvisibleCharacters(text);

  return text
    .replace(/\r\n?/g, '\n')
    // Collapse runs of 3+ newlines: keeps paragraphs, kills whitespace padding.
    .replace(/\n{3,}/g, '\n\n')
    // Trailing spaces before a newline are invisible noise.
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
