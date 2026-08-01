# Setup

## 1. Prerequisites

- Node.js 20.9+ (Next.js 16 minimum). This repo was built on Node 24.
- A Supabase project
- A Groq API key (primary verdict provider) and an NVIDIA NIM key (fallback) —
  get the latter at [build.nvidia.com](https://build.nvidia.com)
- An Upstash Redis database (required in production for rate limiting)
- A Cashfree merchant account (only if you want RedFlag Pro billing)

## 2. Install

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`. Generate the fingerprint salt with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use the same command for `CRON_SECRET`. Both must be set: `VOTE_FP_SALT` is
required at boot, and the gavel cron **fails closed** without `CRON_SECRET`.

## 3. Database

This project targets an **existing** RedFlag schema (cases, votes, profiles,
payments, reports, moderation_logs, admin_audit_logs, ai_jobs, comments, and
more). `supabase/migrations/002_redflag_app_requirements.sql` adds only what the
court app needs on top of it.

Apply it with the CLI:

```bash
supabase db push
```

…or paste it into the Supabase SQL editor.

It is **additive and safe to run against live data**: every `ADD COLUMN` uses
`IF NOT EXISTS`, no column is dropped, renamed, or retyped, and existing rows are
only touched to backfill the new weighted tallies.

What it adds:

| Area | What |
|---|---|
| Vote integrity | `red_weight`/`green_weight`, `votes.weight`, `is_anonymous_vote`, anonymous fingerprint dedupe |
| Reports | `report_count` + auto-hide at 5, one report per user per case |
| Gavel | `verdict_attempts`, generated `heat` column, docket indexes |
| Billing | `cf_subscription_ref`, `cf_subscription_status`, `payments.event_id` |
| Accountability | `profiles.strikes`, `can_file_case()` |
| Ids | `next_public_case_id()` sequence, wired as the `public_id` default |
| Hardening | privileged-column triggers, vote guards, column grants, profile provisioning |

Read `docs/SECURITY.md` before changing any of it: the trust-tier rules are
enforced in three places on purpose.

### If your database is empty

The app expects the base schema to exist first. Check with:

```sql
select table_name from information_schema.tables
 where table_schema = 'public' order by table_name;
```

If `cases`, `votes`, and `profiles` are missing, create the base schema before
running migration 002 — it assumes those tables and the
`case_status` / `case_category` / `verdict_type` / `vote_type` enums.

## 4. Enable anonymous sign-ins

**This is required.** Voting depends on it.

Supabase Dashboard → Authentication → Sign In / Providers → enable
**Anonymous sign-ins**.

While you are there:
- Enable **Email** provider with OTP (used for the anonymous → verified upgrade)
- Optionally enable **Google** and add `http://localhost:3000/auth/callback` plus
  your production callback to the redirect allowlist
- Recommended: enable **leaked password protection** under Authentication →
  Policies. The Supabase advisor flags it as off by default.

## 5. Run

```bash
npm run dev
```

Optionally seed realistic cases across all three states (open / due / closed):

```bash
npm run seed
```

The seed script creates its own verified author, backdates it past the 10-minute
filing cooldown, and writes verdicts directly via the service role. It **skips
itself if more than 6 cases already exist**, so a stray second run cannot flood
the docket. **Never point it at production.**

## 6. Cashfree (optional)

1. Get your App ID and Secret Key from **Merchant Dashboard → Developers → API
   Keys**, and set `CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY`.
2. Set both `CASHFREE_ENV` and `NEXT_PUBLIC_CASHFREE_ENV` to `sandbox` while
   testing. They must match — the server picks the API host from the first, the
   browser SDK from the second.
3. Register a webhook at **Developers → Webhooks** pointing at
   `https://<your-domain>/api/cashfree/webhook`, subscribed to the subscription
   events. For local testing, tunnel with ngrok and register that URL.

Tier changes happen **only** in the webhook, after HMAC verification. A user
returning to `/account?upgraded=1` without a verified event gains nothing — the
page merely triggers a read-only reconciliation against Cashfree.

> Subscriptions require the Subscriptions product to be enabled on your Cashfree
> account. If `/pg/subscriptions` returns 404, that is why — the code surfaces
> this as "Subscriptions are not enabled on this merchant account yet."

## 7. Admin access

Admin is a **database flag**, not an env allowlist, so access can be granted
without a redeploy:

```sql
update public.profiles set is_admin = true where handle = 'your_handle';
```

Then visit `/admin/docket`. Non-admins get a generic "nothing here" rather than a
403, so the route is not confirmed to people probing.

## 8. Verify

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint flat config
npm test            # Vitest — 119 tests
npm run build       # production build
npx playwright test # 44 e2e tests, Chromium + WebKit
```

The e2e suite needs browsers once:

```bash
npx playwright install chromium webkit
```

WebKit matters here — it caught a CSP bug Chromium silently tolerated (see
Transport headers in `docs/SECURITY.md`).

## Deployment (Vercel)

1. Import the repo and add every variable from `.env.example` as a project
   environment variable.
2. Set `NEXT_PUBLIC_SITE_URL` to the production `https://` URL. This does more
   than build links: `upgrade-insecure-requests` and HSTS are enabled **only**
   when it starts with `https://`.
3. `vercel.json` already registers the gavel cron at `*/5 * * * *`. Vercel injects
   the `CRON_SECRET` bearer automatically for its own cron invocations.
4. Add the production `/auth/callback` URL to Supabase's redirect allowlist.
5. Point a Cashfree production webhook at `/api/cashfree/webhook` and flip both
   `CASHFREE_ENV` and `NEXT_PUBLIC_CASHFREE_ENV` to `production`.

### Monitoring

`GET /api/health` returns `ok`, `degraded`, or `down` (503 only when the database
is unreachable). It reports dependency status without echoing URLs or key
prefixes, so it is safe to point an uptime monitor at.

### If the cron does not run

Cases still close: `getCase()` runs a lazy gavel on read for a single overdue
case, so a visitor never sees a frozen case. The cron is throughput, not
correctness.
