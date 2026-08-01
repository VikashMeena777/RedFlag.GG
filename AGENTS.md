<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# RedFlag.GG — agent notes

Anonymous-ish Gen-Z "court": people file dating/friendship situations, the public
votes 🚩 vs 🟢, an AI judge closes the case with a verdict + roast on a
screenshot-ready card.

## The database came first

This app was written against an **existing** Supabase schema, not the other way
round. Do not "correct" the domain model to something tidier — it mirrors real
columns, and `lib/supabase/database.types.ts` is the contract.

| Concept | Reality |
|---|---|
| Case id | `public_id`, e.g. `CASE-7421`. Route segment is `[caseId]`. There is no slug. |
| Status | `pending_review` / `live` / `judging` / `closed` / `hidden` / `deleted` |
| Open case | `live` or `judging` — check `caseView.isOpen`, not `status === 'live'` |
| Verdict | Five columns: `ai_verdict`, `ai_verdict_line`, `ai_roast`, `ai_summary`, `toxicity_score`. Not one JSONB blob. |
| Verdict values | `red` / `green` / `split`. **No `MISTRIAL`** — a hung jury is `split`. |
| Categories | `dating` / `friendship` / `family` / `work` / `other`. No `situationship`. |
| Vote column | `votes.vote` (not `choice`), with `device_fingerprint` |
| Tier | Derived from `is_pro` / `is_admin` / `is_banned` + `auth.users.is_anonymous`. There is no `tier` column. |
| Reports | `reports` table, not `flags` |
| Deadline | Derived: `created_at + SESSION_HOURS`. There is no `closes_at` column. |

`judge_persona` is free text in the DB; always normalise it through the
`JUDGE_PERSONAS` allowlist before use.

## Next.js 16 specifics that bite

- `middleware.ts` is deprecated. This project uses **`proxy.ts`** exporting a
  `proxy()` function. Node.js runtime only — the edge runtime is not supported there.
- `params` and `searchParams` are **Promises**, including in `opengraph-image.tsx`.
- `revalidateTag(tag)` now needs a second `cacheLife` argument. Prefer
  `updateTag(tag)` inside Server Actions for read-your-writes semantics.
- Turbopack is the default for `dev` and `build`.
- `next lint` was removed. Use `npm run lint` (ESLint CLI, flat config).
- **A `'use server'` module may only export async functions.** `export const` in
  one compiles to a runtime export the client cannot resolve, and the build fails
  with "Export X doesn't exist in target module". Types and interfaces are fine
  (they are erased); values belong in a plain module — see
  `lib/moderation/report-reasons.ts`.
- `notFound()` returns **200 for streamed responses**, 404 only for non-streamed
  ones. Next injects `noindex` either way. Do not add a root-layout `robots`
  entry: it is emitted *after* that tag and contradicts it.

## Non-negotiable security rules

Read `docs/SECURITY.md` before touching auth, votes, verdicts, or billing.

1. **Anonymous users may vote. They may never file a case, report, or subscribe.**
   Enforced in the server action, in `can_file_case()`, and by column grants plus
   a trigger. If you add a new write path, enforce it there too.
2. **Never trust a tier from the client.** Always derive it server-side via
   `getViewer()` in `lib/auth/viewer.ts`.
3. **Privileged columns are service-role only**: `status`, every `ai_*`,
   `toxicity_score`, `*_votes`, `*_weight`, `report_count`, `verdict_attempts`,
   `public_id`, `author_id`, `is_pro`, `is_admin`, `is_banned`, `strikes`,
   `cf_subscription_*`. A trigger raises `PRIVILEGED_COLUMN` if anything else
   touches them.
4. **Redaction runs before the LLM call**, so raw PII never leaves the server.
5. **Rate limiters fail CLOSED on client-reachable write paths.** If Upstash is
   unreachable the write is rejected — an outage is exactly when an abuse wave is
   cheapest to run.
   The one deliberate exception is `verdict:global`, which fails **open**: it
   throttles the gavel's own AI calls, only the cron and the lazy on-read fallback
   can reach it, and failing closed meant that with Upstash unconfigured *no
   verdict was ever generated* — the limiter silently disabled the core feature.
   Read the `failOpen` comment in `lib/rate-limit.ts` before changing either.
6. **Cashfree tier changes only ever happen in the webhook**, after raw-body HMAC
   verification and idempotency. Read the body with `request.text()`; parsing JSON
   first invalidates the signature.
7. **New SQL functions need `REVOKE EXECUTE`** from `public`/`anon`/
   `authenticated`. Postgres grants EXECUTE to PUBLIC by default, which exposes
   trigger functions at `/rest/v1/rpc/<name>`.
8. **TLS-only headers are added at RUNTIME in `proxy.ts`, not in `next.config.ts`.**
   `upgrade-insecure-requests` and HSTS are appended only when the request actually
   arrives over TLS (`x-forwarded-proto`'s *first* hop, or `request.nextUrl.protocol`).
   Do not move them back into `next.config.ts`: `headers()` runs at **build** time
   and freezes into `routes-manifest.json`, so no runtime env var can change it.
   Neither `NODE_ENV` nor `NEXT_PUBLIC_SITE_URL` is a valid signal — `next start`
   sets production locally, and the site URL is a build-time guess about a request
   that has not happened yet. Getting this wrong is not cosmetic: WebKit honours
   `upgrade-insecure-requests` on `http://localhost` (Chromium exempts it), rewriting
   every asset to `https://localhost:3000` where no TLS listener exists — the page
   then renders with no CSS and no fonts. Only the first forwarded hop is trusted,
   so a client cannot spoof `https` by appending one.

## Layout

```
app/(court)/        public court UI: docket, case file, submit, rules
app/(account)/      auth + billing
app/(admin)/        moderation queue
app/api/            cron, share-card PNG, Cashfree webhook, health
lib/actions/        server actions (the only client-reachable write surface)
lib/supabase/       client / server / service-role clients
lib/ai/             verdict prompt, providers, Zod contract
lib/moderation/     PII redaction, profanity, report reasons
lib/billing/        Cashfree client + webhook signature verification
lib/og/             shared Satori card layout (inline styles only — no Tailwind)
supabase/migrations/
```

## Design system

**"DIGITAL COURTROOM"** — black void, neon evidence, chrome type. Tokens live in
`app/globals.css` under `@theme` (Tailwind v4; there is no `tailwind.config.ts`).

| | |
|---|---|
| Base | `--color-void` `#07060C`, glass panels at 22px radius, 1px hairlines |
| Verdicts | magenta `#FF2E7E` / lime `#B4FF39` / cyan `#3DE0FF`, announced via `edge-*` bloom |
| Fonts | Bricolage Grotesque (display, **mixed case**, w800) · Azeret Mono (HUD) · Plus Jakarta Sans (body) |
| Primitives | `components/ui/neon.tsx` — `Panel`, `NeonButton`, `Chip`, `SplitBar`, `HeatBar`, `Rule`, `LiveDot`, `VerdictBadge` |

This **replaced** an earlier "Court Brutalism" system (manila paper, black ink,
Anton, hard offset shadows) because it scored 8/10 visually identical to the
sibling project `35-SpillBoard` — same token names one hex digit apart, same
display face, same shadow idiom.

**Do not drift back.** Forbidden: paper/manila backgrounds, black hard-offset
shadows (`6px 6px 0 0`), Anton, uppercase-by-default headings, square-by-default
geometry, halftone dot screens, yellow highlighter. `e2e/court.spec.ts` asserts
the retired tokens stay gone and that no element has an offset shadow, so a
regression fails CI rather than review. Full reference: `docs/DESIGN.md`.

Satori cannot render emoji or Tailwind, so `lib/og/verdict-card.tsx` is inline
styles only and uses typographic labels instead of 🚩/🟢. It also needs **static**
font instances (`assets/*.woff` from Fontsource) — all three families ship from
Google Fonts as variable fonts, which Satori collapses to weight 400.

## Scheduled jobs

Cron is **external** (cron-job.org), not Vercel Cron — the Hobby plan fires only
once per day and the gavel needs every 5 minutes. `vercel.json` therefore has no
`crons` block. `/api/cron/gavel` accepts a bearer token, `x-cron-secret`, or
`?key=`, fails closed without `CRON_SECRET`, and self-limits to a ~20s budget so
it answers inside a scheduler timeout. Setup and troubleshooting: `docs/CRON.md`.

**Never re-judge a decided case.** `findDueCases()` and `persistVerdict()` both
filter `ai_verdict IS NULL`. Status alone is insufficient — a case can carry a
verdict while still `live`, and without that guard a rate-limited sweep overwrote
genuine rulings with the canned "hung jury" fallback. Capacity failures (429,
timeout) must not spend `verdict_attempts`; only a validation failure does.
