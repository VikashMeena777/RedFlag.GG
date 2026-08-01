# DIGITAL COURTROOM — design system

A late-night verdict feed: black void, neon evidence, chrome type. Reads like a
dating app that got angry, not a paper document.

**Design law:** a screenshot must read as a *verdict* at thumbnail size. Here that
is achieved with **glow and contrast**, not borders — one neon accent dominates
each card, and the verdict word is the largest thing on it.

Tokens live in `app/globals.css` under `@theme`. There is **no
`tailwind.config.ts`** — Tailwind v4 reads tokens from CSS.

## Why this replaced the previous system

The first iteration was "Court Brutalism": manila paper, black ink, Anton, hard
offset shadows. An audit against the sibling project `35-SpillBoard` scored them
**8/10 visually identical** — same paper/ink token names one hex digit apart
(`#12100E` vs `#121110`), the same Anton display face forced uppercase, the same
`3px 3px 0` / `6px 6px 0` shadow idiom, and a character-for-character identical
header (`bg-paper/95 backdrop-blur-sm`).

Two products in one repo family cannot share a design language that closely. The
constraints below are what keep them apart, and
`e2e/court.spec.ts` asserts them so the boundary is not left to reviewer memory.

### Hard constraints

- no paper/manila backgrounds, no black hard-offset shadows
- no Anton, no uppercase-by-default headings
- no square-by-default geometry, no halftone dot screens
- no yellow highlighter

## Colour

| Token | Value | Role |
|---|---|---|
| `--color-void` | `#07060C` | page base |
| `--color-void-deep` | `#030209` | recessed wells, footer |
| `--color-surface` | `#12101C` | card base |
| `--color-surface-2` | `#1A1728` | card top (gradient) |
| `--color-surface-3` | `#241F37` | chips, tracks, skeletons |
| `--color-line` | `#2B2642` | hairline borders |
| `--color-line-bright` | `#423A63` | hover/focus borders, scrollbar |
| `--color-chalk` | `#F5F2FF` | primary type |
| `--color-chalk-dim` | `#A8A1CC` | body copy, metadata |
| `--color-chalk-faint` | `#6F688F` | tertiary, HUD labels |
| `--color-flag-red` | `#FF2E7E` | red flag — hot magenta |
| `--color-flag-red-deep` | `#4A0722` | red chip/tile fill |
| `--color-flag-green` | `#B4FF39` | green flag — acid lime |
| `--color-flag-green-deep` | `#2B4207` | green chip/tile fill |
| `--color-judge` | `#3DE0FF` | the AI judge; focus ring |
| `--color-judge-deep` | `#06384A` | judge chip fill |
| `--color-pro` | `#9D5CFF` | Pro tier |
| `--color-heat` | `#FFB627` | toxicity ramp |

Red is **magenta, not fire-engine** — it reads "danger" while staying in the
same tonal family as the cyan and lime, so the three neons can sit together
without clashing. Toxicity gets its own amber ramp so it never competes with the
red/green verdict axis.

**Dark only.** There is no light mode; the void is the brand.

## Type

Three faces, three jobs.

```
Bricolage Grotesque  → display. Variable, wide, slightly unhinged. MIXED CASE.
Azeret Mono          → HUD: case numbers, timers, counts. Squarer than Space Mono.
Plus Jakarta Sans    → body. Rounder terminals than Inter; friendlier on dark.
```

Display type is **mixed case with tight negative tracking** (`-0.035em` to
`-0.05em`), weight 800. Uppercase display is the sibling project's voice and is
deliberately avoided.

Scale: hero `clamp(2.6rem, 12vw, 4.4rem)` · verdict word
`clamp(2rem, 9vw, 3.4rem)` · card title `clamp(1.3rem, 4.6vw, 1.6rem)` · HUD
`11px` at `0.16em` tracking · body `15px`.

### Satori parity

`assets/*.woff` must mirror the `next/font` choices, because the OG renderer
cannot read `next/font`.

**Static instances only.** All three families ship from Google Fonts as *variable*
fonts, which Satori collapses to weight 400 — display type would silently render
regular instead of extrabold. The files therefore come from Fontsource:

```
Display-ExtraBold.woff  Display-Bold.woff
Hud-Medium.woff         Hud-Bold.woff
Body-Regular.woff       Body-SemiBold.woff
```

Other Satori constraints in `lib/og/verdict-card.tsx`:
- inline styles only, no Tailwind
- `display: flex` or `none` — no grid, no float
- **no emoji** — 🚩/🟢 become typographic labels in exported cards
- no `backdrop-filter`; glow is faked with layered translucent panels
- long headlines step down in size; 60 chars at full size overflows the frame

## Utilities

Defined in `globals.css` via `@utility`.

**Surfaces** — `panel` (gradient + hairline + inset top highlight, 22px radius),
`panel-flat`, `panel-sunk` (recessed well for inputs and quoted evidence).

**Neon edges** — `edge-red` / `edge-green` / `edge-judge` / `edge-pro` tint a
panel's border and lay a coloured bloom outside it. This is how a card announces
its verdict, replacing the rubber stamp entirely.

**Text bloom** — `glow-red` / `glow-green` / `glow-judge`. Small doses only;
glowing body copy is unreadable.

**Chrome type** — `chrome` (brushed-metal gradient via `background-clip: text`,
with a colour fallback so text never vanishes) and `chrome-live` (shimmer, used
only on hover).

**Actions** — `pill` base (999px radius) plus `pill-red` / `pill-green` /
`pill-judge` / `pill-glass` / `pill-ghost`. Press is `scale(0.96)` — a
*compression*, not the sibling's translate-into-shadow.

**Chrome** — `hud` (mono metadata voice), `chip` + tone variants, `hairline`
(gradient divider that fades at both ends).

**Devices** — `redact` (blurred neon bar, reads as digitally scrubbed rather than
marker-penned), `underglow` (cyan→magenta underline sweep, replaces the yellow
highlighter), `scanline` (slow sweep marking a live case), `gridlines`.

**Layout** — `court-container` (640px feed) / `court-container-wide` (1056px).

## Motion

`verdict-in` (420ms) punches the verdict in from the screen plane with a blur
release — deliberately not a rotation, since a rotating stamp is the sibling's
signature. Plus `slam`, `rise`, `bar-fill` (clip-path reveal), `breathe` (live
dot), `scan`, `ticker`, `shimmer`.

Reduced motion is honoured twice: the OS media query and a manual
`html.reduce-motion` class. Two explicit overrides matter:
- `verdict-in` resets to its resting state, or the verdict would strand blurred
  and pushed 120px toward the viewer
- `scanline` is hidden outright — an infinitely sweeping strip is exactly what
  this setting exists for

## Iconography

`lucide-react` at `strokeWidth={2.25}` — lighter than the previous system's 2.75,
because thin strokes read correctly against 1px hairlines and would look clumsy
at the old weight. Icons are chrome only; verdicts are typographic.

## Layout

- **Header** — floating glass bar (`bg-void/70 backdrop-blur-xl`) so content
  scrolls *under* it and the page bloom stays visible
- **Docket** — single 640px column
- **Case file** — story, then either the jury box or the verdict card
- **Jury box** — two large tiles; unselected is a glass tile with a coloured icon,
  selected floods with the neon. The difference must be obvious at a glance,
  because "did my vote register?" is the one question this UI must never leave open
- **Verdict card** — the shareable unit, with a verdict-coloured bloom behind the
  ruling. Share controls sit *outside* the frame so they never appear in a
  screenshot

## Accessibility

- Focus ring: 2px cyan, 3px offset, plus a 6px bloom — visible over both neon and
  void
- Vote buttons carry text labels, not icons alone, and `aria-pressed`
- Split bars are `role="img"` with a descriptive `aria-label`
- The custom checkbox in the filing form keeps a real `sr-only` input, so
  `required` validation and form serialisation still work
- Contrast: `chalk-dim` on `void` is the floor for body copy; `chalk-faint` is
  reserved for non-essential metadata
- Print styles invert to ink-on-white, since a printed verdict should be legible

## Known engine differences

Two WebKit behaviours cost real debugging time and are worth knowing:

1. **`upgrade-insecure-requests` on localhost.** WebKit honours it where Chromium
   exempts localhost, rewriting every asset to `https://localhost:3000` — the page
   then loads with no CSS and no fonts. TLS headers therefore key off
   `NEXT_PUBLIC_SITE_URL`, not `NODE_ENV`. See `next.config.ts`.
2. **Mid-animation computed styles.** WebKit reports the animating keyframe value
   for `box-shadow`, so the anti-regression test must exclude `0px 0px 0px 0px`
   when detecting hard offset shadows.
