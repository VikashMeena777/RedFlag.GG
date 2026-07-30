import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Verdict, CaseCategory } from '@/lib/types';
import { CATEGORY_LABELS } from '@/lib/types';
import { formatCaseNo, voteSplit, excerpt } from '@/lib/utils';

/**
 * Shared Satori layout for verdict cards.
 *
 * Two consumers: `opengraph-image.tsx` (1200x630, link unfurls) and
 * `/api/card/[slug]` (1080x1350, story-ready download). One layout, two frames.
 *
 * Satori constraints that shape everything here:
 *  - No Tailwind. Inline styles only.
 *  - `display: flex` or `none`. No grid, no float, no position: sticky.
 *  - Every text node needs an explicit font. Fonts come from `assets/*.ttf`,
 *    read at request time — `next/font` is unavailable to the renderer.
 *  - **No emoji.** Satori cannot rasterise emoji without a supplied image map,
 *    so the 🚩/🟢 used in the web UI become typographic stamps here. This is why
 *    the card reads "RED FLAG" in a stamp frame rather than showing a flag glyph.
 */

// ── Palette: must mirror the @theme tokens in app/globals.css ─────────────
const INK = '#12100E';
const INK_SOFT = '#6E665A';
const PAPER = '#F4EFE6';
const PAPER_DIM = '#E7DFD0';
const FLAG_RED = '#E4172B';
const FLAG_RED_LO = '#FBD9DC';
const FLAG_GREEN = '#12A150';
const FLAG_GREEN_LO = '#D5F0E0';
const JUDGE = '#2A1FD6';
const TAPE = '#E3D3A4';

export interface CardFonts {
  anton: ArrayBuffer;
  monoBold: ArrayBuffer;
  monoRegular: ArrayBuffer;
  sans: ArrayBuffer;
  sansSemi: ArrayBuffer;
}

/** Reads the TTFs from disk. Cached per lambda by the module-level promise. */
let fontsPromise: Promise<CardFonts> | null = null;

export function loadCardFonts(): Promise<CardFonts> {
  fontsPromise ??= (async () => {
    const dir = join(process.cwd(), 'assets');
    const [anton, monoBold, monoRegular, sans, sansSemi] = await Promise.all([
      readFile(join(dir, 'Anton-Regular.ttf')),
      readFile(join(dir, 'SpaceMono-Bold.ttf')),
      readFile(join(dir, 'SpaceMono-Regular.ttf')),
      readFile(join(dir, 'Inter-Regular.ttf')),
      readFile(join(dir, 'Inter-SemiBold.ttf')),
    ]);
    return {
      anton: toArrayBuffer(anton),
      monoBold: toArrayBuffer(monoBold),
      monoRegular: toArrayBuffer(monoRegular),
      sans: toArrayBuffer(sans),
      sansSemi: toArrayBuffer(sansSemi),
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
    { name: 'Anton', data: fonts.anton, weight: 400 as const, style: 'normal' as const },
    { name: 'SpaceMono', data: fonts.monoRegular, weight: 400 as const, style: 'normal' as const },
    { name: 'SpaceMono', data: fonts.monoBold, weight: 700 as const, style: 'normal' as const },
    { name: 'Inter', data: fonts.sans, weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: fonts.sansSemi, weight: 600 as const, style: 'normal' as const },
  ];
}

export interface VerdictCardData {
  caseNo: number;
  category: CaseCategory;
  title: string;
  verdict: Verdict;
  redVotes: number;
  greenVotes: number;
  redWeight: number;
  greenWeight: number;
}

type Variant = 'og' | 'story';

const ACCENT: Record<Verdict['verdict'], { ink: string; wash: string; label: string }> = {
  RED_FLAG: { ink: FLAG_RED, wash: FLAG_RED_LO, label: 'RED FLAG' },
  GREEN_FLAG: { ink: FLAG_GREEN, wash: FLAG_GREEN_LO, label: 'GREEN FLAG' },
  MISTRIAL: { ink: JUDGE, wash: '#DCDAFB', label: 'MISTRIAL' },
};

/**
 * The card.
 *
 * `og` is the 1200x630 landscape unfurl; `story` is the 1080x1350 portrait
 * download. Scale factors are derived from the story width so the two frames
 * stay visually consistent without maintaining two layouts.
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
  const pad = isStory ? 72 : 56;
  const s = isStory ? 1 : 0.78; // shared scale factor

  /*
   * Headline sizing. The schema caps the headline at 60 chars, but Anton is wide
   * and 60 chars at full size overflows the frame — so step the size down for
   * longer strings rather than trusting a single value.
   */
  const headline = data.verdict.headline.toUpperCase();
  const headlineSize =
    headline.length > 44
      ? 62 * s
      : headline.length > 30
        ? 78 * s
        : headline.length > 18
          ? 96 * s
          : 118 * s;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: PAPER,
        padding: pad,
        fontFamily: 'Inter',
        position: 'relative',
      }}
    >
      {/* Ink frame */}
      <div
        style={{
          position: 'absolute',
          top: pad * 0.42,
          left: pad * 0.42,
          right: pad * 0.42,
          bottom: pad * 0.42,
          border: `${Math.round(6 * s)}px solid ${INK}`,
          display: 'flex',
        }}
      />

      {/* ── Header: case no. + category tape ─────────────────────────── */}
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
            fontFamily: 'SpaceMono',
            fontWeight: 700,
            fontSize: 24 * s,
            letterSpacing: 3 * s,
            color: INK,
          }}
        >
          {formatCaseNo(data.caseNo)}
        </div>
        <div
          style={{
            display: 'flex',
            backgroundColor: TAPE,
            padding: `${8 * s}px ${20 * s}px`,
            fontFamily: 'SpaceMono',
            fontWeight: 700,
            fontSize: 20 * s,
            letterSpacing: 3 * s,
            color: INK,
          }}
        >
          {CATEGORY_LABELS[data.category].toUpperCase()}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          height: 3 * s,
          backgroundColor: INK,
          marginBottom: 30 * s,
        }}
      />

      {/* ── The story title ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          fontFamily: 'Inter',
          fontWeight: 600,
          fontSize: 30 * s,
          lineHeight: 1.32,
          color: INK_SOFT,
          marginBottom: 34 * s,
        }}
      >
        {excerpt(data.title, isStory ? 110 : 82)}
      </div>

      {/* ── The ruling ──────────────────────────────────────────────── */}
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
            fontFamily: 'SpaceMono',
            fontWeight: 700,
            fontSize: 20 * s,
            letterSpacing: 4 * s,
            color: INK_SOFT,
            marginBottom: 14 * s,
          }}
        >
          THE COURT FINDS
        </div>

        <div
          style={{
            display: 'flex',
            fontFamily: 'Anton',
            fontSize: headlineSize,
            lineHeight: 0.94,
            letterSpacing: -1.5 * s,
            color: INK,
            marginBottom: 26 * s,
          }}
        >
          {headline}
        </div>

        {/* Verdict stamp */}
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            border: `${Math.round(5 * s)}px double ${accent.ink}`,
            backgroundColor: accent.wash,
            padding: `${10 * s}px ${26 * s}px`,
            transform: 'rotate(-5deg)',
            marginBottom: 30 * s,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'SpaceMono',
              fontWeight: 700,
              fontSize: 30 * s,
              letterSpacing: 4 * s,
              color: accent.ink,
            }}
          >
            {accent.label}
          </div>
        </div>

        {/* The roast — the quotable part */}
        <div
          style={{
            display: 'flex',
            borderLeft: `${Math.round(7 * s)}px solid ${JUDGE}`,
            paddingLeft: 24 * s,
            fontFamily: 'Inter',
            fontSize: (isStory ? 33 : 29) * s,
            lineHeight: 1.44,
            color: INK,
          }}
        >
          {excerpt(data.verdict.roast, isStory ? 260 : 190)}
        </div>
      </div>

      {/* ── Jury split bar ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 32 * s }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'SpaceMono',
            fontWeight: 700,
            fontSize: 22 * s,
            letterSpacing: 2 * s,
            marginBottom: 10 * s,
          }}
        >
          <div style={{ display: 'flex', color: FLAG_RED }}>
            {split.hasVotes ? `${split.red}% RED` : 'NO JURY'}
          </div>
          <div style={{ display: 'flex', color: FLAG_GREEN }}>
            {split.hasVotes ? `${split.green}% GREEN` : '—'}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            height: 30 * s,
            border: `${Math.round(4 * s)}px solid ${INK}`,
            backgroundColor: PAPER_DIM,
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
              <div
                style={{
                  display: 'flex',
                  width: `${split.green}%`,
                  backgroundColor: FLAG_GREEN,
                }}
              />
            </>
          )}
        </div>

        {/* ── Footer: sentence + wordmark ───────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 26 * s,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontFamily: 'SpaceMono',
                fontSize: 17 * s,
                letterSpacing: 3 * s,
                color: INK_SOFT,
              }}
            >
              SENTENCE
            </div>
            <div
              style={{
                display: 'flex',
                fontFamily: 'Anton',
                fontSize: 34 * s,
                letterSpacing: -0.5 * s,
                color: INK,
              }}
            >
              {data.verdict.sentence.toUpperCase()}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div
              style={{
                display: 'flex',
                fontFamily: 'Anton',
                fontSize: 36 * s,
                letterSpacing: -1 * s,
                color: INK,
              }}
            >
              REDFLAG.GG
            </div>
            <div
              style={{
                display: 'flex',
                fontFamily: 'SpaceMono',
                fontSize: 17 * s,
                letterSpacing: 2 * s,
                color: INK_SOFT,
              }}
            >
              {totalBallots} JURORS · TOXICITY {data.verdict.toxicity}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
