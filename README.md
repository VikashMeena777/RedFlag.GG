# RedFlag.GG 🚩

The internet court of red flags. File your dating drama anonymously, the public
votes red flag or green flag, then an AI judge closes the case with a verdict, a
roast, and a screenshot-ready card.

## The loop

1. **File** — a verified account posts a dating/friendship situation, anonymous to readers
2. **Jury** — anyone can vote 🚩 or 🟢, no signup required
3. **Gavel** — the case closes at the earlier of 12 hours or 100 weighted votes
4. **Verdict** — the AI judge reads the story *and* the jury split, then rules
5. **Share** — the verdict card unfurls in chat apps and downloads as a story PNG

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 · Supabase
(Postgres + anonymous auth) · Groq `llama-3.3-70b` with NVIDIA NIM fallback ·
Upstash rate limiting · Cashfree subscriptions · Satori for share cards · Vercel

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill it in
supabase db push             # applies migration 002 (additive, safe on live data)
# enable Anonymous sign-ins in the Supabase dashboard
npm run dev
```

Full instructions, including Cashfree and admin setup, are in
[`docs/SETUP.md`](docs/SETUP.md).

## Three things worth knowing before you read the code

**Voting is anonymous, filing is not.** That asymmetry is deliberate. Frictionless
voting is what makes this spread; gating the *posting* is what keeps it defensible,
because cases are about real people who never consented to appear. Anonymous
sessions upgrade in place, so a drive-by voter keeps their vote history when they
decide to file. See [`docs/SECURITY.md`](docs/SECURITY.md).

**A screenshot must read as an official verdict at thumbnail size.** Every visual
decision follows from that — manila paper, 3–4px ink borders, hard offset shadows,
rubber stamps. See [`docs/DESIGN.md`](docs/DESIGN.md).

**The database came first.** This app was written against an existing RedFlag
schema rather than the other way round, so the domain types mirror real columns:
verdicts live in `ai_verdict` / `ai_verdict_line` / `ai_roast` / `ai_summary` /
`toxicity_score`, statuses are `live` / `judging` / `closed`, verdict values are
`red` / `green` / `split`, and cases are addressed by `public_id` ("CASE-7421").
`lib/supabase/database.types.ts` is the contract; if you change SQL, change it in
the same commit.

## Scripts

```bash
npm run dev         # Turbopack dev server
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint flat config (next lint was removed in Next 16)
npm test            # Vitest — 119 tests, incl. property-based
npm run test:e2e    # Playwright — 44 tests, Chromium + WebKit
npm run seed        # realistic cases across open / due / closed
```

## Layout

```
app/(court)/          docket, case file, submit, rules
app/(account)/        verification + billing
app/(admin)/          moderation queue
app/api/              gavel cron, share-card PNG, Cashfree webhook, health
lib/actions/          server actions — the only client-reachable write surface
lib/ai/               verdict prompt, providers, Zod contract
lib/moderation/       PII redaction, profanity, report reasons
lib/billing/          Cashfree client + webhook signature verification
lib/og/               shared Satori card layout
lib/auth/             viewer resolution, vote fingerprinting
supabase/migrations/  additive app requirements
```

## Verification status

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| ESLint | clean |
| Vitest | 119 passing |
| Playwright | 44 passing (Chromium + WebKit) |
| Production build | 17 routes |
| Live database | 3 seeded cases render; privileged-column guard rejects forged verdicts |
| Supabase advisors | 0 security warnings from app code |

**Not yet exercised against live services:** a real Groq/NIM verdict generation, a
real Cashfree mandate, and the OG image unfurling in a chat app. Those need
credentials and a public URL.

## Docs

- [`docs/SECURITY.md`](docs/SECURITY.md) — trust tiers, closed loopholes, rate limits
- [`docs/DESIGN.md`](docs/DESIGN.md) — tokens, type, utilities, Satori constraints
- [`docs/SETUP.md`](docs/SETUP.md) — environment, migrations, deployment
- [`AGENTS.md`](AGENTS.md) — Next.js 16 gotchas and non-negotiable rules

## Disclaimer

Verdicts are AI-generated entertainment, not advice, therapy, or a factual finding
about any real person.
