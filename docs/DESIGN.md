# COURT BRUTALISM — design system

Legal docket meets sticker chaos.

**Design law:** a screenshot must read as an *official verdict* at thumbnail size.
Every decision below serves that. Paper and heavy ink survive being cropped,
compressed, and viewed at 200px in someone's story. Neon and glass do not.

Tokens live in `app/globals.css` under `@theme`. There is **no
`tailwind.config.ts`** — Tailwind v4 reads tokens from CSS.

## Colour

| Token | Value | Role |
|---|---|---|
| `--color-paper` | `#F4EFE6` | page base (manila / xerox) |
| `--color-paper-dim` | `#E7DFD0` | inset panels, tape backing |
| `--color-paper-bright` | `#FBF8F2` | card surface |
| `--color-ink` | `#12100E` | borders, type, hard shadows |
| `--color-ink-soft` | `#6E665A` | metadata, timestamps |
| `--color-ink-faint` | `#A89E8D` | tertiary, disabled |
| `--color-flag-red` | `#E4172B` | red verdict, guilty |
| `--color-flag-red-lo` | `#FBD9DC` | red bar fill, stamp wash |
| `--color-flag-green` | `#12A150` | green verdict, acquitted |
| `--color-flag-green-lo` | `#D5F0E0` | green bar fill |
| `--color-judge` | `#2A1FD6` | AI judge ink; roast rule; focus ring |
| `--color-highlighter` | `#FFE94A` | marker emphasis, live badges |
| `--color-tape` | `#E3D3A4` | masking-tape category tags |

**No dark mode in v1.** Paper is the brand.

## Type

Three faces, three jobs. More would dilute the docket feel.

```
Anton        → display, verdict word, hero.  UPPERCASE only, tracking -0.02em
Space Mono   → case numbers, countdowns, labels.  tracking 0.12–0.16em, uppercase
Inter        → body, story text, form inputs
```

Anton is baked to uppercase on `h1/h2/h3` in the base layer, so callers do not
have to remember.

Scale: hero `clamp(2.5rem, 13vw, 5rem)` · verdict word `clamp(2.25rem, 11vw, 4rem)`
· card title `text-xl`/`text-2xl` · docket label `11px` · body `15px`.

> Instrument Sans was the original choice but is not reachable from the Google
> Fonts repo, so Inter took its place — same geometric, neutral-workhorse role.

### Satori parity

`assets/*.ttf` must mirror the `next/font` choices, because the OG renderer cannot
read `next/font`. Currently: `Anton-Regular`, `SpaceMono-Regular`, `SpaceMono-Bold`,
`Inter-Regular`, `Inter-SemiBold`.

Satori constraints in `lib/og/verdict-card.tsx`:
- inline styles only, no Tailwind
- `display: flex` or `none` — no grid, no float
- **no emoji** — 🚩/🟢 become typographic stamps in exported cards
- long headlines step down in size; 60 chars at full size overflows 1080×1350

## Utilities

Defined in `globals.css` via `@utility`.

- `brut` / `brut-thin` — 3px (4px at `sm+`) or 2px ink border
- `brut-shadow` / `-sm` / `-lg` / `-red` / `-green` / `-judge` — hard offset, zero blur
- `brut-press` — active state travels `+3px,+3px` into its own shadow. This is the
  tactile bit that makes voting feel like stamping. Use on every primary action.
- `brut-hover-lift` — inverse on hover, for cards
- `stamp` / `stamp-straight` — double dashed border, `rotate(-7deg)`, letterpress
- `tape` — masking-tape tag, `rotate(-1.5deg)`
- `docket-label` — the mono metadata voice
- `docket-rule` — dashed form divider
- `halftone` — xerox dot screen at 6% over cards
- `redact` — solid ink bar for masked PII
- `marker` — highlighter behind inline text
- `court-container` (680px) / `court-container-wide` (1024px)

## Motion

All animations ≤ 350ms. This is a court, not a carnival.

`gavel-slam` (320ms) · `stamp-in` (340ms) · `rise` · `bar-fill` · `pulse-live` ·
`ticker`.

Reduced motion is honoured twice: the OS media query and a manual
`html.reduce-motion` class. `stamp-in` has an explicit reduced-motion override so
a stamp never freezes mid-flight at `scale(1.7)`.

## Iconography

`lucide-react` at `strokeWidth={2.75}` — thinner strokes look weak against 3–4px
borders. Icons are chrome only (gavel, flag, timer, flame, share). The flags
themselves are typographic stamps, never lucide outlines, because emoji and stamps
survive screenshots where thin vector strokes do not.

## Layout

- **Header** — sticky, ink-on-paper, wordmark + live session count + FILE button
- **Docket** — single 680px column of manila file cards
- **Case file** — story, then either the jury box or the verdict card
- **Jury box** — two oversized 50/50 stamp buttons; the split bar is hidden until
  a vote exists, so the first juror is not anchored by a meaningless 50/50
- **Verdict card** — the shareable unit. Share controls sit *outside* the frame so
  they never appear in a screenshot.

## Accessibility

- Focus ring: 3px `--color-judge`, 2px offset — must be obvious against paper
- Vote buttons carry text labels, not emoji alone, and `aria-pressed`
- Split bars are `role="img"` with a descriptive `aria-label`
- `xs: 380px` breakpoint plus a sub-380px rule that thins borders so the
  two-button jury box never overflows
- Print styles: it is a court document, let people print it
