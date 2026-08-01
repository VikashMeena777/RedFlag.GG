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
5. **Rate limiters fail CLOSED on write paths.** If Upstash is unreachable, the
   write is rejected. Do not "fail open" for convenience.
6. **Cashfree tier changes only ever happen in the webhook**, after raw-body HMAC
   verification and idempotency. Read the body with `request.text()`; parsing JSON
   first invalidates the signature.
7. **New SQL functions need `REVOKE EXECUTE`** from `public`/`anon`/
   `authenticated`. Postgres grants EXECUTE to PUBLIC by default, which exposes
   trigger functions at `/rest/v1/rpc/<name>`.
8. **TLS headers key off `NEXT_PUBLIC_SITE_URL`, not `NODE_ENV`.** `next start`
   sets production locally too; WebKit then honours `upgrade-insecure-requests` on
   localhost and the page loads with no CSS.

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

"COURT BRUTALISM" — manila paper, heavy ink borders, hard offset shadows, rubber
stamps. Tokens live in `app/globals.css` under `@theme` (Tailwind v4; there is no
`tailwind.config.ts`). Fonts: Anton (display), Space Mono (docket labels), Inter
(body). Do not introduce pastels, glassmorphism, or neon — see `docs/DESIGN.md`.

Satori cannot render emoji or Tailwind, so `lib/og/verdict-card.tsx` is inline
styles only and uses typographic stamps instead of 🚩/🟢.
