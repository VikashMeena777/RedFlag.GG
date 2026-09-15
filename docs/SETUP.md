# Setup

## 1. Prerequisites

- Node.js 20.9+ (Next.js 16 minimum). This repo was built on Node 24.
- A Supabase project
- A Groq API key (primary verdict provider) and an NVIDIA NIM key (fallback) —
  get the latter at [build.nvidia.com](https://build.nvidia.com)
- Nothing extra: with Upstash unconfigured the app rate-limits through a
  Postgres fallback (migration 003). Upstash (free tier) is optional and only
  lowers the latency of each check.
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
- Enable the **Email** provider. No template editing is needed: verification is
  magic-link only, so the stock `{{ .ConfirmationURL }}` template is correct.
  Add `<your-site>/auth/confirm` to the redirect allowlist.
- **Email volume, know this before launch:** with the built-in mail service
  Supabase sends at most **2 emails per hour** (project-wide) — including magic
  links. Fine for testing, not for traffic. For production, configure custom
  SMTP (Authentication → SMTP) with any provider (Resend, SES, Brevo…); the app
  already maps the rate-limit error to a friendly "use Google meanwhile"
  message, and Google OAuth works regardless.
- Optionally enable **Google** and add `http://localhost:3000/auth/callback` plus
  your production callback to the redirect allowlist
- Recommended: enable **leaked password protection** under Authentication →
  Policies. The Supabase advisor flags it as off by default. (This app has no
  password sign-in at all, so it is defence-in-depth only.)

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

RedFlag Pro is a **one-time ₹99 payment for 30 days** through the standard
Payment Gateway — no Subscriptions product, no mandate, no auto-renewal, and
no phone number collected (Cashfree's API schema requires a phone value, so a
fixed placeholder is sent; the payer's own UPI/card details are entered at
checkout and never touch this app). The verified account email is the only
customer data in the order.

1. Get your App ID and Secret Key from **Merchant Dashboard → Developers → API
   Keys**, and set `CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY`.
2. Set `CASHFREE_ENV` to `sandbox` while testing, `production` for real
   payments. That single variable drives both the server's API host and the
   browser checkout SDK (the server passes the mode to the page as a prop), so
   the two sides cannot disagree.
3. Register a webhook at **Developers → Webhooks** pointing at
   `https://<your-domain>/api/cashfree/webhook`, subscribed to **ORDER_PAID**
   (and optionally PAYMENT_FAILED / PAYMENT_USER_DROPPED for the audit trail).
   For local testing, tunnel with ngrok and register that URL.

Entitlement changes happen **only** in the webhook, after HMAC verification and
two layers of idempotency (per-delivery event id, plus one paid row per order —
migration 008). A user returning to `/account?upgraded=1` without a verified
payment gains nothing — the page merely triggers a read-only reconciliation
against Cashfree's order status.

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
npm test            # Vitest — 162 tests
npm run build       # production build
npx playwright test # 52 e2e tests, Chromium + mobile
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
3. Set up the gavel cron with an **external scheduler** — see
   [`docs/CRON.md`](CRON.md). Vercel Cron is not used: the Hobby plan only fires
   once per day, and the sweep needs to run every few minutes.
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

Full scheduler setup, auth options, and troubleshooting live in
[`docs/CRON.md`](CRON.md).
