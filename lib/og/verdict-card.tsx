import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Verdict, CaseCategory } from '@/lib/types';
import { CATEGORY_LABELS, VERDICT_LABELS } from '@/lib/types';
import { formatCaseNo, voteSplit, excerpt } from '@/lib/utils';

/**
 * Shared Satori layout for verdict cards — "THE RECORD".
 *
 * Two consumers: `opengraph-image.tsx` (1200x630, link unfurls) and
 * `/api/card/[caseId]` (1080x1350, story-ready download). One layout, two frames.
 *
 * Satori constraints that shape everything here:
 *  - No Tailwind. Inline styles only.
 *  - `display: flex` or `none`. No grid, no float, no `position: sticky`.
 *  - Every text node needs an explicit font. Fonts come from `assets/*.woff`,
 *    read at request time — `next/font` is unavailable to the renderer.
 *  - **Static font instances only.** Fraunces and Newsreader ship from Google as
 *    variable fonts, which Satori collapses to weight 400 — the display serif
 *    would render at book weight. Hence the Fontsource statics.
 *  - **No emoji.** Satori cannot rasterise them without an image map, so the
 *    🚩/🟢 used elsewhere become typographic labels here.
 *  - No `backdrop-filter`, no text shadow, no `first-letter`. The drop cap used
 *    on the web page is not available, so the card leans on scale instead.
 */

// ── Palette: mirrors the @theme tokens in app/globals.css ─────────────────
const PAGE = '#FBFAF7';
const SURFACE = '#FFFFFF';
const WASH = '#EFECE5';
const INK = '#17161A';
const INK_MUTED = '#56535E';
const INK_FAINT = '#8B8794';
const RULE = '#E3DFD6';
const VERDICT_RED = '#B3202B';
const VERDICT_GREEN = '#1F6D4A';
const VERDICT_SPLIT = '#2F4A7A';
const HEAT = '#B8651A';

export interface CardFonts {
  displaySemiBold: ArrayBuffer;
  displayMedium: ArrayBuffer;
  readRegular: ArrayBuffer;
  readItalic: ArrayBuffer;
  sansRegular: ArrayBuffer;
  sansMedium: ArrayBuffer;
}

/** Reads the fonts from disk. Cached per lambda by the module-level promise. */
let fontsPromise: Promise<CardFonts> | null = null;

export function loadCardFonts(): Promise<CardFonts> {
  fontsPromise ??= (async () => {
    const dir = join(process.cwd(), 'assets');
    const [
      displaySemiBold,
      displayMedium,
      readRegular,
      readItalic,
      sansRegular,
      sansMedium,
    ] = await Promise.all([
      readFile(join(dir, 'Display-SemiBold.woff')),
      readFile(join(dir, 'Display-Medium.woff')),
      readFile(join(dir, 'Read-Regular.woff')),
      readFile(join(dir, 'Read-Italic.woff')),
      readFile(join(dir, 'Sans-Regular.woff')),
      readFile(join(dir, 'Sans-Medium.woff')),
    ]);
    return {
      displaySemiBold: toArrayBuffer(displaySemiBold),
      displayMedium: toArrayBuffer(displayMedium),
      readRegular: toArrayBuffer(readRegular),
      readItalic: toArrayBuffer(readItalic),
      sansRegular: toArrayBuffer(sansRegular),
      sansMedium: toArrayBuffer(sansMedium),
    };
  })();
  return fontsPromise;
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength
  ) as ArrayBuffer;
}

/** Font descriptors in the shape `ImageResponse` expects. */
export function cardFontConfig(fonts: CardFonts) {
  return [
    { name: 'Display', data: fonts.displaySemiBold, weight: 600 as const, style: 'normal' as const },
    { name: 'Display', data: fonts.displayMedium, weight: 500 as const, style: 'normal' as const },
    { name: 'Read', data: fonts.readRegular, weight: 400 as const, style: 'normal' as const },
    { name: 'Read', data: fonts.readItalic, weight: 400 as const, style: 'italic' as const },
    { name: 'Sans', data: fonts.sansRegular, weight: 400 as const, style: 'normal' as const },
    { name: 'Sans', data: fonts.sansMedium, weight: 500 as const, style: 'normal' as const },
  ];
}

export interface VerdictCardData {
  /** `public_id`, e.g. "CASE-7421". */
  publicId: string;
  category: CaseCategory;
  title: string;
  verdict: Verdict;
  redVotes: number;
  greenVotes: number;
  redWeight: number;
  greenWeight: number;
}

type Variant = 'og' | 'story';

/**
 * Accent per verdict. Keys match `public.verdict_type`.
 * `split` is a real outcome, so it gets ink-blue rather than error styling.
 */
const ACCENT: Record<Verdict['verdict'], { colour: string; label: string }> = {
  red: { colour: VERDICT_RED, label: VERDICT_LABELS.red },
  green: { colour: VERDICT_GREEN, label: VERDICT_LABELS.green },
  split: { colour: VERDICT_SPLIT, label: VERDICT_LABELS.split },
};

/**
 * The card, set as a printed ruling.
 *
 * `og` is the 1200x630 landscape unfurl; `story` is the 1080x1350 portrait
 * download. A single scale factor keeps the two frames consistent without
 * maintaining two layouts.
 */
export function VerdictCard({
  data,
  variant,
}: {
  data: VerdictCardData;
  variant: Variant;
}) {
  const accent = ACCENT[data.verdict.verdict];
  const split = voteSplit(data.redWeight, data.greenWeight);
  const totalBallots = data.redVotes + data.greenVotes;

  const isStory = variant === 'story';
  const pad = isStory ? 76 : 64;
  const s = isStory ? 1 : 0.78;

  /*
   * Headline sizing. The schema caps the headline at 60 chars, but a serif at
   * display size is wide — step down rather than trusting one value.
   */
  const headline = data.verdict.headline;
  const headlineSize =
    headline.length > 46
      ? 58 * s
      : headline.length > 32
        ? 70 * s
        : headline.length > 20
          ? 86 * s
          : 104 * s;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: PAGE,
        padding: pad,
        fontFamily: 'Sans',
        // A hairline inset frame, the way a printed notice is boxed.
        border: `${Math.round(10 * s)}px solid ${SURFACE}`,
      }}
    >
      {/* ── Slug line ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'Sans',
          fontWeight: 500,
          fontSize: 19 * s,
          letterSpacing: 2 * s,
          textTransform: 'uppercase',
          color: INK_FAINT,
        }}
      >
        <div style={{ display: 'flex' }}>{formatCaseNo(data.publicId)}</div>
        <div style={{ display: 'flex' }}>
          {CATEGORY_LABELS[data.category]}
        </div>
      </div>

      {/* ── The story under review, as a standfirst ───────────────────── */}
      <div
        style={{
          display: 'flex',
          fontFamily: 'Read',
          fontSize: 28 * s,
          lineHeight: 1.4,
          color: INK_MUTED,
          marginTop: 26 * s,
        }}
      >
        {excerpt(data.title, isStory ? 112 : 84)}
      </div>

      {/* Heavy rule: the break between filing and ruling. */}
      <div
        style={{
          display: 'flex',
          height: 2 * s,
          backgroundColor: INK,
          marginTop: 30 * s,
        }}
      />

      {/* ── The ruling ────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: 'Sans',
            fontWeight: 500,
            fontSize: 18 * s,
            letterSpacing: 2.4 * s,
            textTransform: 'uppercase',
            color: INK_FAINT,
            marginBottom: 14 * s,
          }}
        >
          The court finds
        </div>

        <div
          style={{
            display: 'flex',
            fontFamily: 'Display',
            fontWeight: 600,
            fontSize: headlineSize,
            lineHeight: 1.04,
            letterSpacing: -2 * s,
            color: accent.colour,
            marginBottom: 20 * s,
          }}
        >
          {headline}
        </div>

        <div
          style={{
            display: 'flex',
            fontFamily: 'Display',
            fontWeight: 600,
            fontSize: 24 * s,
            letterSpacing: -0.4 * s,
            color: accent.colour,
            marginBottom: 30 * s,
          }}
        >
          {accent.label}
        </div>

        {/* The roast — a pull-quote with a heavy left rule. */}
        <div
          style={{
            display: 'flex',
            borderLeft: `${Math.round(4 * s)}px solid ${INK}`,
            paddingLeft: 24 * s,
            fontFamily: 'Display',
            fontWeight: 500,
            fontSize: (isStory ? 34 : 29) * s,
            lineHeight: 1.36,
            letterSpacing: -0.5 * s,
            color: INK,
          }}
        >
          {excerpt(data.verdict.roast, isStory ? 240 : 176)}
        </div>
      </div>

      {/* ── Jury data, as a footnote ──────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34 * s }}>
        {/* Thin split bar: red left, green right. */}
        <div
          style={{
            display: 'flex',
            height: 6 * s,
            backgroundColor: WASH,
          }}
        >
          {split.hasVotes && (
            <>
              <div
                style={{
                  display: 'flex',
                  width: `${split.red}%`,
                  backgroundColor: VERDICT_RED,
                }}
              />
              <div
                style={{
                  display: 'flex',
                  flexGrow: 1,
                  backgroundColor: VERDICT_GREEN,
                }}
              />
            </>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'Sans',
            fontWeight: 500,
            fontSize: 18 * s,
            letterSpacing: 1.6 * s,
            textTransform: 'uppercase',
            marginTop: 12 * s,
          }}
        >
          <div style={{ display: 'flex', color: VERDICT_RED }}>
            {split.hasVotes ? `${split.red}% red flag` : 'No jury'}
          </div>
          <div style={{ display: 'flex', color: INK_FAINT }}>
            {totalBallots} jurors
          </div>
          <div style={{ display: 'flex', color: VERDICT_GREEN }}>
            {split.hasVotes ? `${split.green}% green` : '—'}
          </div>
        </div>

        {/* Hairline above the colophon. */}
        <div
          style={{
            display: 'flex',
            height: 1,
            backgroundColor: RULE,
            marginTop: 26 * s,
          }}
        />

        {/* ── Colophon: toxicity + wordmark ─────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 18 * s,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'Sans',
              fontWeight: 500,
              fontSize: 17 * s,
              letterSpacing: 1.6 * s,
              textTransform: 'uppercase',
              color: HEAT,
            }}
          >
            Toxicity {data.verdict.toxicity}/100
          </div>

          <div
            style={{
              display: 'flex',
              fontFamily: 'Display',
              fontWeight: 600,
              fontSize: 30 * s,
              letterSpacing: -1 * s,
              color: INK,
            }}
          >
            RedFlag
            <span style={{ color: VERDICT_RED }}>.gg</span>
          </div>
        </div>
      </div>
    </div>
  );
}
