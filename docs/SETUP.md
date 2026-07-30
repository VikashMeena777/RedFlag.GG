# Setup

## 1. Prerequisites

- Node.js 20.9+ (Next.js 16 minimum). This repo was built on Node 24.
- A Supabase project
- A Groq API key (primary verdict provider) and optionally a Gemini key (fallback)
- An Upstash Redis database (required in production for rate limiting)
- A Stripe account (only if you want RedFlag+ billing)

## 2. Install

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`. Generate the fingerprint salt with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use the same command for `CRON_SECRET`.

## 3. Database

Run `supabase/migrations/001_initial_schema.sql` against your project — either
paste it into the Supabase SQL editor or use the CLI:

```bash
supabase db push
```

The migration creates the tables, enums, triggers, and RLS policies. Read
`docs/SECURITY.md` before changing any of it: the trust-tier rules are enforced in
three places on purpose.

## 4. Enable anonymous sign-ins

**This is required.** Voting depends on it.

Supabase Dashboard → Authentication → Sign In / Providers → enable
**Anonymous sign-ins**.

While you are there:
- Enable **Email** provider with OTP (used for the anonymous → verified upgrade)
- Optionally enable **Google** and add `http://localhost:3000/auth/callback` plus
  your production callback to the redirect allowlist

## 5. Run

```bash
npm run dev
```

Optionally seed realistic cases across all three states (open / closing / closed):

```bash
npm run seed
```

The seed script creates its own verified author and writes verdicts directly via
the service role. **Never point it at production.**

## 6. Stripe (optional)

1. Create a recurring price for RedFlag+ and put its ID in `STRIPE_PLUS_PRICE_ID`.
2. Forward webhooks locally:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

3. Copy the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET`.

Tier changes happen **only** in the webhook, after signature verification. A user
returning to `/account?upgraded=1` without a verified webhook event gains nothing.

## 7. Admin access

Put your Supabase user UUID in `ADMIN_USER_IDS` (comma-separated for several
admins), then visit `/admin/docket`. Non-admins get a generic "nothing here"
rather than a 403, so the route is not confirmed to people probing.

## 8. Verify

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Deployment (Vercel)

1. Import the repo and add every variable from `.env.example` as a project
   environment variable.
2. Set `NEXT_PUBLIC_SITE_URL` to the production URL — OG images and OAuth
   redirects derive from it.
3. `vercel.json` already registers the gavel cron at `*/5 * * * *`. Vercel injects
   the `CRON_SECRET` bearer automatically for its own cron invocations.
4. Add the production `/auth/callback` URL to Supabase's redirect allowlist.
5. Point a Stripe production webhook at `/api/stripe/webhook`.

### If the cron does not run

Cases still close: `getCase()` runs a lazy gavel on read for a single overdue case,
so a visitor never sees a frozen case. The cron is throughput, not correctness.
