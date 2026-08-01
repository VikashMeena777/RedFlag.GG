# Scheduled jobs (cron)

RedFlag.GG uses an **external scheduler** rather than Vercel Cron.

## Why not Vercel Cron

Vercel's Hobby plan allows cron jobs, but only **once per day** and only at an
approximate time. The gavel sweep needs to run every few minutes — a case that
closed at 09:02 should not wait until tomorrow for its verdict. Per-minute
schedules require the Pro plan.

[cron-job.org](https://cron-job.org) is free, runs down to every minute, keeps an
execution history with response bodies, and emails on failure. Any scheduler that
can send an authenticated HTTPS request works equally well — see
[Alternatives](#alternatives).

## The jobs

| # | Job | Endpoint | Schedule | Required |
|---|---|---|---|---|
| 1 | **Gavel sweep** | `GET /api/cron/gavel` | every 5 min | **Yes** |
| 2 | Health ping | `GET /api/health` | every 15 min | Optional |

There is exactly one required job. Everything else in the app is request-driven.

### 1. Gavel sweep — required

Closes cases whose jury phase has ended (12 hours elapsed, or 100 weighted votes
reached) and generates their AI verdicts.

- **URL:** `https://your-domain.com/api/cron/gavel`
- **Method:** GET (POST also accepted)
- **Auth:** `Authorization: Bearer <CRON_SECRET>`
- **Schedule:** every 5 minutes
- **Timeout:** 30s

Each run processes up to 10 cases and stops after a 20-second internal budget, so
it always answers well within a normal HTTP timeout. Anything left over is picked
up on the next tick.

**This is throughput, not correctness.** If the scheduler dies entirely, cases
still close: `getCase()` runs a lazy gavel when someone opens an overdue case. The
cron exists so a case closes promptly even if nobody visits it.

### 2. Health ping — optional

`GET /api/health` returns `ok`, `degraded`, or `down`, and needs no auth. It
reports dependency status without leaking URLs or key prefixes, so it is safe to
point a public monitor at.

Useful on a free Vercel/Supabase tier where idle projects cold-start or pause.

---

## Setup: cron-job.org

### Step 1 — Generate the secret

If `CRON_SECRET` is not already set:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Add it to your Vercel project (Settings → Environment Variables) **and** to
`.env.local`. Redeploy so the running deployment picks it up.

> The endpoint **fails closed** when `CRON_SECRET` is unset — it returns 401 and
> runs nothing. An unauthenticated endpoint that triggers LLM spend is not
> something to leave open by default.

### Step 2 — Create the account

Sign up at [console.cron-job.org](https://console.cron-job.org) and verify your
email. No card required.

### Step 3 — Create the gavel job

**Create cronjob** → fill in:

| Field | Value |
|---|---|
| Title | `RedFlag — gavel sweep` |
| URL | `https://your-domain.com/api/cron/gavel` |
| Execution schedule | **Every 5 minutes** |
| Request method | `GET` |

Then open **Advanced**:

| Setting | Value | Why |
|---|---|---|
| Headers | `Authorization: Bearer <CRON_SECRET>` | Authenticates the call |
| Request timeout | `30` seconds | The route self-limits to ~20s |
| Treat redirects as success | off | A redirect means something is wrong |
| Save responses | **on** | The response body is the debugging record |
| Notify on failure | on | Silent cron failure is the worst failure |

Save, then hit **TEST RUN**. A healthy response looks like:

```json
{ "swept": 0, "remaining": 0, "results": [] }
```

`swept: 0` is correct when no cases are due. To prove it does real work, seed a
case whose deadline has passed:

```bash
npm run seed   # includes cases backdated past the 12h window
```

…then run the test again and expect `swept: 1` or more.

### Step 4 — Health ping (optional)

Same flow, with:

| Field | Value |
|---|---|
| Title | `RedFlag — health` |
| URL | `https://your-domain.com/api/health` |
| Schedule | Every 15 minutes |
| Headers | *(none — this endpoint is public)* |

---

## Authentication

The endpoint accepts the secret three ways, all compared in constant time:

| Method | Format | Use when |
|---|---|---|
| **Bearer** *(preferred)* | `Authorization: Bearer <secret>` | Default |
| Custom header | `x-cron-secret: <secret>` | Scheduler reserves `Authorization` |
| Query string | `?key=<secret>` | Scheduler cannot send headers at all |

**Prefer a header.** A query string ends up in access logs, proxy logs, and the
scheduler's own execution history — three copies of your secret in places you do
not control. The query fallback exists so setup is never blocked, not because it
is fine.

---

## Verifying it works

```bash
# Correct secret — expect 200 and a JSON summary
curl -i -H "Authorization: Bearer $CRON_SECRET" \
     https://your-domain.com/api/cron/gavel

# No secret — expect 401
curl -i https://your-domain.com/api/cron/gavel

# Wrong secret — expect 401
curl -i -H "Authorization: Bearer wrong" \
     https://your-domain.com/api/cron/gavel
```

Response fields:

| Field | Meaning |
|---|---|
| `swept` | Cases closed this run |
| `remaining` | Cases that were due but did not fit the time budget |
| `tookMs` | Wall-clock duration |
| `results[]` | Per-case outcome: `closed`, `hung_jury`, `retry_later`, `skipped` |

A persistently non-zero `remaining` means volume has outgrown a 5-minute cadence
— shorten the interval before raising the batch size, since the batch is bounded
by the time budget rather than the count.

---

## Troubleshooting

**401 on every run.** `CRON_SECRET` differs between the scheduler and the
deployment. Environment variables are baked in at deploy time, so a value changed
after the last deploy is not live until you redeploy.

**Timeouts.** The route self-limits to ~20s, so a timeout points at cold starts
or a slow AI provider. Confirm `requestTimeout` is 30s, then check `/api/health`
for `providers`.

**`swept: 0` forever.** Expected when nothing is due. Verify with:

```sql
select public_id, status, created_at, red_weight + green_weight as weighted
  from public.cases
 where status in ('live', 'judging')
 order by created_at;
```

A case is due at `created_at + 12h`, or once weighted votes reach 100.

**Verdicts never generate.** Check `results[].outcome`:
- `retry_later` — provider failed or the global rate limit was hit; it retries
- `hung_jury` — three attempts failed, so a canned split verdict was written
- `skipped` — another worker already closed it (harmless race)

If every case reports `hung_jury`, neither `GROQ_API_KEY` nor `NVIDIA_API_KEY` is
reaching the deployment. `/api/health` reports which providers are configured.

---

## Alternatives

Nothing here is cron-job.org-specific — the endpoint only needs an authenticated
HTTPS request on a schedule.

**GitHub Actions** (free for public repos; note that scheduled workflows are
frequently delayed under load and are disabled after 60 days of repo inactivity):

```yaml
# .github/workflows/gavel.yml
name: Gavel sweep
on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:

jobs:
  sweep:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger gavel
        run: |
          curl -fsS --max-time 30 \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            "${{ secrets.SITE_URL }}/api/cron/gavel"
```

**Supabase `pg_cron` + `pg_net`** — keeps scheduling next to the data, but the
secret then lives in the database. Requires both extensions enabled.

**Upstash QStash** — free tier includes scheduled messages, with built-in retries
and a dead-letter queue. Worth it if you outgrow best-effort delivery.

**Returning to Vercel Cron** — on Pro, add back to `vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron/gavel", "schedule": "*/5 * * * *" }]
}
```

Vercel injects `Authorization: Bearer $CRON_SECRET` automatically, so the
endpoint needs no changes. Delete the external job first, or both will run.

---

## Schedule reference

cron-job.org's UI uses dropdowns rather than cron expressions, and its API takes
arrays instead of a `*/5` string. The mapping for reference:

| Cadence | Cron expression | cron-job.org API |
|---|---|---|
| Every 5 min | `*/5 * * * *` | `minutes: [0,5,10,15,20,25,30,35,40,45,50,55]` |
| Every 15 min | `*/15 * * * *` | `minutes: [0,15,30,45]` |
| Hourly | `0 * * * *` | `minutes: [0]`, `hours: [-1]` |

In the API, `[-1]` means "every", and omitted fields default to empty — so a job
created without a `minutes` array never runs.
