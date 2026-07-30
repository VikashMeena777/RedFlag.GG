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
(Postgres + RLS + anonymous auth) · Groq `llama-3.3-70b` with Gemini fallback ·
Upstash rate limiting · Stripe · Satori for share cards · Vercel

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill it in
# run supabase/migrations/001_initial_schema.sql
# enable Anonymous sign-ins in the Supabase dashboard
npm run dev
```

Full instructions, including Stripe and admin setup, are in
[`docs/SETUP.md`](docs/SETUP.md).

## Two things worth knowing before you read the code

**Voting is anonymous, filing is not.** That asymmetry is deliberate. Frictionless
voting is what makes this spread; gating the *posting* is what keeps it defensible,
because cases are about real people who never consented to appear. Anonymous
sessions upgrade to verified in place, so a drive-by voter keeps their history when
they decide to file. See [`docs/SECURITY.md`](docs/SECURITY.md).

**A screenshot must read as an official verdict at thumbnail size.** Every visual
decision follows from that — manila paper, 3–4px ink borders, hard offset shadows,
rubber stamps. See [`docs/DESIGN.md`](docs/DESIGN.md).

## Scripts

```bash
npm run dev         # Turbopack dev server
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint flat config (next lint was removed in Next 16)
npm test            # Vitest, incl. property-based tests
npm run seed        # realistic cases across all three states
```

## Layout

```
app/(court)/          docket, case file, submit, rules
app/(account)/        verification + billing
app/(admin)/          moderation queue
app/api/              gavel cron, share-card PNG, Stripe webhook
lib/actions/          server actions — the only client-reachable write surface
lib/ai/               verdict prompt, providers, Zod contract
lib/moderation/       PII redaction, profanity
lib/og/               shared Satori card layout
lib/auth/             viewer resolution, vote fingerprinting
supabase/migrations/  schema, triggers, RLS
```

## Docs

- [`docs/SECURITY.md`](docs/SECURITY.md) — trust tiers, closed loopholes, rate limits
- [`docs/DESIGN.md`](docs/DESIGN.md) — tokens, type, utilities, Satori constraints
- [`docs/SETUP.md`](docs/SETUP.md) — environment, migrations, deployment
- [`AGENTS.md`](AGENTS.md) — Next.js 16 gotchas and non-negotiable rules

## Disclaimer

Verdicts are AI-generated entertainment, not advice, therapy, or a factual finding
about any real person.
