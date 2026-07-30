<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# RedFlag.GG — agent notes

Anonymous-ish Gen-Z "court": people file dating/friendship situations, the public
votes 🚩 vs 🟢, an AI judge closes the case with a verdict + roast on a
screenshot-ready card.

## Next.js 16 specifics that bite

- `middleware.ts` is deprecated. This project uses **`proxy.ts`** exporting a
  `proxy()` function. Node.js runtime only — the edge runtime is not supported there.
- `params` and `searchParams` are **Promises**, including in `opengraph-image.tsx`.
- `revalidateTag(tag)` now needs a second `cacheLife` argument. Prefer
  `updateTag(tag)` inside Server Actions for read-your-writes semantics.
- Turbopack is the default for `dev` and `build`.
- `next lint` was removed. Use `npm run lint` (ESLint CLI, flat config).

## Non-negotiable security rules

Read `docs/SECURITY.md` before touching auth, votes, verdicts, or billing.

1. **Anonymous users may vote. They may never file a case, flag, or subscribe.**
   Enforced in the server action, in RLS `WITH CHECK`, and by a DB trigger. If you
   add a new write path, enforce it there too.
2. **Never trust a tier from the client.** Always derive it server-side via
   `getViewer()` in `lib/auth/viewer.ts`.
3. **`verdict`, `status`, `toxicity`, `tier`, `strikes` and all `*_weight` /
   `*_votes` columns are service-role-only.** Client-writable paths must never
   set them; a trigger raises if they try.
4. **Redaction runs before the LLM call**, so raw PII never leaves the server.
5. **Rate limiters fail CLOSED on write paths.** If Upstash is unreachable, the
   write is rejected. Do not "fail open" for convenience.
6. **Stripe tier changes only ever happen in the webhook**, after raw-body
   signature verification and event-ID idempotency.

## Layout

```
app/(court)/        public court UI: docket, case file, submit, rules
app/(account)/      auth + billing
app/api/            cron, share-card PNG, stripe webhook
lib/actions/        server actions (the only client-reachable write surface)
lib/supabase/       client / server / service-role clients
lib/ai/             verdict prompt, providers, Zod contract
lib/moderation/     PII redaction, profanity, flagging
lib/og/             shared Satori card layout (inline styles only — no Tailwind)
supabase/migrations/
```

## Design system

"COURT BRUTALISM" — manila paper, heavy ink borders, hard offset shadows, rubber
stamps. Tokens live in `app/globals.css` under `@theme` (Tailwind v4; there is no
`tailwind.config.ts`). Fonts: Anton (display), Space Mono (docket labels), Instrument
Sans (body). Do not introduce pastels, glassmorphism, or neon — see `docs/DESIGN.md`.
