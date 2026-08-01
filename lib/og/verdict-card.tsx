import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Verdict, CaseCategory } from '@/lib/types';
import { CATEGORY_LABELS, VERDICT_LABELS } from '@/lib/types';
import { formatCaseNo, voteSplit, excerpt } from '@/lib/utils';

/**
 * Shared Satori layout for verdict cards — "DIGITAL COURTROOM".
 *
 * Two consumers: `opengraph-image.tsx` (1200x630, link unfurls) and
 * `/api/card/[caseId]` (1080x1350, story-ready download). One layout, two frames.
 *
 * Satori constraints that shape everything here:
 *  - No Tailwind. Inline styles only.
 *  - `display: flex` or `none`. No grid, no float, no position: sticky.
 *  - Every text node needs an explicit font. Fonts come from `assets/*.woff`,
 *    read at request time — `next/font` is unavailable to the renderer.
 *  - **Static font instances only.** The Google Fonts repo ships these three
 *    families as variable fonts, which Satori collapses to weight 400 — display
 *    type would render regular instead of extrabold. Hence Fontsource statics.
 *  - **No emoji.** Satori cannot rasterise them without an image map, so the
 *    🚩/🟢 used in the web UI become typographic labels here.
 *  - No `backdrop-filter`, no `box-shadow` spread on text. Glow is faked with
 *    layered translucent panels instead.
 */

// ── Palette: mirrors the @theme tokens in app/globals.css ─────────────────
const VOID = '#07060C';
const VOID_DEEP = '#030209';
const SURFACE = '#12101C';
const SURFACE_2 = '#1A1728';
const LINE = '#2B2642';
const LINE_BRIGHT = '#423A63';
const CHALK = '#F5F2FF';
const CHALK_DIM = '#A8A1CC';
const CHALK_FAINT = '#6F688F';
const FLAG_RED = '#FF2E7E';
const FLAG_RED_DEEP = '#4A0722';
const FLAG_GREEN = '#B4FF39';
const FLAG_GREEN_DEEP = '#2B4207';
const JUDGE = '#3DE0FF';
const JUDGE_DEEP = '#06384A';
const HEAT = '#FFB627';

export interface CardFonts {
  displayExtraBold: ArrayBuffer;
  displayBold: ArrayBuffer;
  hudMedium: ArrayBuffer;
  hudBold: ArrayBuffer;
  bodyRegular: ArrayBuffer;
  bodySemiBold: ArrayBuffer;
}

/** Reads the fonts from disk. Cached per lambda by the module-level promise. */
let fontsPromise: Promise<CardFonts> | null = null;

export function loadCardFonts(): Promise<CardFonts> {
  fontsPromise ??= (async () => {
    const dir = join(process.cwd(), 'assets');
    const [
      displayExtraBold,
      displayBold,
      hudMedium,
      hudBold,
      bodyRegular,
      bodySemiBold,
    ] = await Promise.all([
      readFile(join(dir, 'Display-ExtraBold.woff')),
      readFile(join(dir, 'Display-Bold.woff')),
      readFile(join(dir, 'Hud-Medium.woff')),
      readFile(join(dir, 'Hud-Bold.woff')),
      readFile(join(dir, 'Body-Regular.woff')),
      readFile(join(dir, 'Body-SemiBold.woff')),
    ]);
    return {
      displayExtraBold: toArrayBuffer(displayExtraBold),
      displayBold: toArrayBuffer(displayBold),
      hudMedium: toArrayBuffer(hudMedium),
      hudBold: toArrayBuffer(hudBold),
      bodyRegular: toArrayBuffer(bodyRegular),
      bodySemiBold: toArrayBuffer(bodySemiBold),
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
    { name: 'Display', data: fonts.displayExtraBold, weight: 800 as const, style: 'normal' as const },
    { name: 'Display', data: fonts.displayBold, weight: 700 as const, style: 'normal' as const },
    { name: 'Hud', data: fonts.hudMedium, weight: 500 as const, style: 'normal' as const },
    { name: 'Hud', data: fonts.hudBold, weight: 700 as const, style: 'normal' as const },
    { name: 'Body', data: fonts.bodyRegular, weight: 400 as const, style: 'normal' as const },
    { name: 'Body', data: fonts.bodySemiBold, weight: 600 as const, style: 'normal' as const },
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
 * `split` is a real outcome, so it gets the judge's cyan, not error styling.
 */
const ACCENT: Record<
  Verdict['verdict'],
  { neon: string; deep: string; label: string }
> = {
  red: { neon: FLAG_RED, deep: FLAG_RED_DEEP, label: VERDICT_LABELS.red },
  green: { neon: FLAG_GREEN, deep: FLAG_GREEN_DEEP, label: VERDICT_LABELS.green },
  split: { neon: JUDGE, deep: JUDGE_DEEP, label: VERDICT_LABELS.split },
};

/**
 * The card.
 *
 * `og` is the 1200x630 landscape unfurl; `story` is the 1080x1350 portrait
 * download. A single scale factor keeps the two frames visually consistent
 * without maintaining two layouts.
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
  const pad = isStory ? 72 : 60;
  const s = isStory ? 1 : 0.78;

  /*
   * Headline sizing. The schema caps the headline at 60 chars, but the display
   * face is wide — 60 chars at full size overflows the frame. Step down rather
   * than trusting one value.
   */
  const headline = data.verdict.headline;
  const headlineSize =
    headline.length > 46
      ? 60 * s
      : headline.length > 32
        ? 74 * s
        : headline.length > 20
          ? 92 * s
          : 112 * s;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: VOID,
        padding: pad,
        fontFamily: 'Body',
        position: 'relative',
      }}
    >
      {/* Verdict-coloured bloom, top-left. Radial gradients are supported. */}
      <div
        style={{
          position: 'absolute',
          top: -260 * s,
          left: -120 * s,
          width: 900 * s,
          height: 620 * s,
          display: 'flex',
          background: `radial-gradient(ellipse at center, ${accent.neon}38 0%, ${VOID}00 68%)`,
        }}
      />
      {/* Cyan counter-bloom, bottom-right. */}
      <div
        style={{
          position: 'absolute',
          right: -220 * s,
          bottom: -240 * s,
          width: 760 * s,
          height: 520 * s,
          display: 'flex',
          background: `radial-gradient(ellipse at center, ${JUDGE}22 0%, ${VOID}00 70%)`,
        }}
      />

      {/* ── Header: case no. + category ───────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 26 * s,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: 'Hud',
            fontWeight: 700,
            fontSize: 21 * s,
            letterSpacing: 3.4 * s,
            color: CHALK_FAINT,
          }}
        >
          {formatCaseNo(data.publicId)}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: `${7 * s}px ${18 * s}px`,
            borderRadius: 999,
            border: `1px solid ${LINE_BRIGHT}`,
            backgroundColor: SURFACE_2,
            fontFamily: 'Hud',
            fontWeight: 500,
            fontSize: 18 * s,
            letterSpacing: 2.6 * s,
            color: CHALK_DIM,
          }}
        >
          {CATEGORY_LABELS[data.category].toUpperCase()}
        </div>
      </div>

      {/* ── The story under review ────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          fontFamily: 'Body',
          fontWeight: 600,
          fontSize: 29 * s,
          lineHeight: 1.34,
          color: CHALK_DIM,
          marginBottom: 30 * s,
        }}
      >
        {excerpt(data.title, isStory ? 112 : 84)}
      </div>

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
            fontFamily: 'Hud',
            fontWeight: 500,
            fontSize: 18 * s,
            letterSpacing: 4.4 * s,
            color: CHALK_FAINT,
            marginBottom: 14 * s,
          }}
        >
          THE COURT FINDS
        </div>

        <div
          style={{
            display: 'flex',
            fontFamily: 'Display',
            fontWeight: 800,
            fontSize: headlineSize,
            lineHeight: 0.98,
            letterSpacing: -2.2 * s,
            color: accent.neon,
            marginBottom: 26 * s,
          }}
        >
          {headline}
        </div>

        {/* Verdict plate — flat neon, not a rotated stamp. */}
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            alignItems: 'center',
            padding: `${11 * s}px ${26 * s}px`,
            borderRadius: 999,
            backgroundColor: accent.deep,
            border: `1px solid ${accent.neon}80`,
            marginBottom: 30 * s,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'Hud',
              fontWeight: 700,
              fontSize: 26 * s,
              letterSpacing: 4 * s,
              color: accent.neon,
            }}
          >
            {accent.label}
          </div>
        </div>

        {/* The roast — the quotable part, in a recessed well. */}
        <div
          style={{
            display: 'flex',
            padding: `${22 * s}px ${24 * s}px`,
            borderRadius: 18 * s,
            backgroundColor: VOID_DEEP,
            border: `1px solid ${LINE}`,
            fontFamily: 'Body',
            fontSize: (isStory ? 32 : 28) * s,
            lineHeight: 1.46,
            color: CHALK,
          }}
        >
          {excerpt(data.verdict.roast, isStory ? 250 : 180)}
        </div>
      </div>

      {/* ── Jury split ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 32 * s }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'Hud',
            fontWeight: 700,
            fontSize: 20 * s,
            letterSpacing: 2.4 * s,
            marginBottom: 11 * s,
          }}
        >
          <div style={{ display: 'flex', color: FLAG_RED }}>
            {split.hasVotes ? `${split.red}% RED` : 'NO JURY'}
          </div>
          <div style={{ display: 'flex', color: FLAG_GREEN }}>
            {split.hasVotes ? `${split.green}% GREEN` : '—'}
          </div>
        </div>

        {/* Rounded track with a bright seam at the boundary. */}
        <div
          style={{
            display: 'flex',
            height: 16 * s,
            borderRadius: 999,
            overflow: 'hidden',
            backgroundColor: SURFACE,
            border: `1px solid ${LINE}`,
          }}
        >
          {split.hasVotes && (
            <>
              <div
                style={{
                  display: 'flex',
                  width: `${split.red}%`,
                  backgroundColor: FLAG_RED,
                }}
              />
              <div style={{ display: 'flex', width: 2, backgroundColor: CHALK }} />
              <div
                style={{
                  display: 'flex',
                  flexGrow: 1,
                  backgroundColor: FLAG_GREEN,
                }}
              />
            </>
          )}
        </div>

        {/* ── Footer: toxicity + wordmark ───────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            marginTop: 28 * s,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                fontFamily: 'Hud',
                fontWeight: 500,
                fontSize: 16 * s,
                letterSpacing: 3 * s,
                color: CHALK_FAINT,
                marginBottom: 8 * s,
              }}
            >
              TOXICITY {data.verdict.toxicity}/100
            </div>
            {/* Toxicity meter, amber → magenta. */}
            <div
              style={{
                display: 'flex',
                width: 200 * s,
                height: 8 * s,
                borderRadius: 999,
                backgroundColor: SURFACE,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  width: `${data.verdict.toxicity}%`,
                  background: `linear-gradient(90deg, ${HEAT}, ${FLAG_RED})`,
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontFamily: 'Display',
                fontWeight: 800,
                fontSize: 34 * s,
                letterSpacing: -1.4 * s,
                color: CHALK,
              }}
            >
              RedFlag.gg
            </div>
            <div
              style={{
                display: 'flex',
                fontFamily: 'Hud',
                fontWeight: 500,
                fontSize: 16 * s,
                letterSpacing: 2.2 * s,
                color: CHALK_FAINT,
              }}
            >
              {totalBallots} JURORS
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
