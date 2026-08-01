# Security model

Read this before touching auth, votes, verdicts, or billing.

The central risk of this product is not fraud, it is that cases are about **real
people who never consented to appear**. Everything below is arranged around that,
with vote integrity second.

## Trust tiers

Voting is frictionless because that is the viral surface. Filing is gated because
that is the liability.

| Capability | Anonymous | Verified | Pro |
|---|---|---|---|
| Read / share | yes | yes | yes |
| Vote | yes (weight 1) | yes (weight 3) | yes (weight 3) |
| File a case | **no** | 2/day | unlimited |
| Report a case | **no** | yes | yes |
| Subscribe | **no** | yes | — |

The tier is **derived, not stored**. `profiles` carries `is_pro` / `is_admin` /
`is_banned`, and anonymity comes from `auth.users.is_anonymous`. `getViewer()`
(`lib/auth/viewer.ts`) is the single place that resolves it, server-side. The
client never supplies a tier.

Anonymous sessions upgrade **in place** via `updateUser`/`linkIdentity`, so a
drive-by voter keeps their vote history when they decide to file.

## Defence in depth

Anonymous users cannot file. Enforced in three independent places, so one mistake
is not a breach:

1. **Server action** — `fileCase()` checks `viewer.canFile` (`lib/actions/cases.ts`).
2. **`can_file_case(uuid)`** — SQL function: unbanned, under the strike limit, and
   the account older than 10 minutes.
3. **Column grants + trigger** — `status` is revoked from `anon`/`authenticated`
   and `cases_privileged_guard` raises `PRIVILEGED_COLUMN` on any attempt.

## Privileged columns

`status`, `ai_verdict`, `ai_verdict_line`, `ai_roast`, `ai_summary`,
`toxicity_score`, `red_votes`, `green_votes`, `red_weight`, `green_weight`,
`report_count`, `verdict_attempts`, `public_id`, `author_id`, `is_featured`,
`is_sponsored`, plus `is_pro`, `is_admin`, `is_banned`, `is_shadow_banned`,
`pro_expires_at`, `strikes`, `karma`, `cf_subscription_*` — all **service-role
only**.

Two mechanisms:
- `REVOKE UPDATE (...)` on those columns from `anon` and `authenticated`.
- `guard_privileged_case_columns` / `guard_privileged_profile_columns` triggers
  raise `PRIVILEGED_COLUMN` for any non-service role.

Verified against the live database: an `authenticated` role attempting
`UPDATE cases SET ai_verdict = 'green'` is rejected and the value is unchanged.

**Internal functions are not callable over the API.** `EXECUTE` is revoked from
`public`/`anon`/`authenticated` on every trigger and helper function. Postgres
grants EXECUTE to PUBLIC by default, so a `SECURITY DEFINER` trigger function is
otherwise reachable at `/rest/v1/rpc/<name>` — the Supabase advisor flagged 19 of
these before they were revoked.

## Closed loopholes

1. **Ballot stuffing by clearing storage.** A cleared browser mints a fresh
   anonymous identity, defeating `(case_id, user_id)`. Anonymous ballots therefore
   also carry `device_fingerprint` = `HMAC-SHA256(VOTE_FP_SALT, ip + user-agent)`,
   with the partial unique index `votes_anon_fingerprint_uniq` on anonymous rows
   only. Verified users are exempt — a shared household NAT is legitimate.
   *No raw IP is ever stored or logged; the digest is one-way.*
2. **Anonymous swarm outvoting real users.** Tallies are weighted (1 vs 3). The
   verdict prompt and the `heat` ranking both read weights, not raw counts.
3. **Disposable-email signups.** Domain blocklist + OTP in `lib/validation.ts`.
4. **Signup-then-spam.** `can_file_case()` requires an account older than 10 min.
5. **Repeat offenders.** Removing a case strikes the author; 3 strikes sets
   `is_banned`. Voting is never revoked.
6. **Report brigading.** Verified-only, one report per user per case
   (`reports_case_reporter_uniq`), and 5 pending reports auto-hide via the
   `reports_sync_count` trigger.
7. **Cron endpoint abuse.** `CRON_SECRET` compared with `timingSafeEqual`, and the
   route **fails closed when the secret is unset**.
8. **Cashfree webhook forgery.** Signature is
   `base64(HMAC-SHA256(timestamp + rawBody, secret))`, compared in constant time.
   The body must be read with `request.text()` — parsing to JSON first changes the
   bytes and silently invalidates the HMAC. Deliveries older than one hour are
   rejected so a captured webhook is not replayable indefinitely. Idempotency uses
   `x-idempotency-header` (falling back to a hash of the verified body) stored in
   `payments.event_id` under a unique index. **Tier changes happen only here.**
9. **Open redirect on the auth callback.** `safeNext()` accepts same-origin
   relative paths only; rejects `//host` and control characters.
10. **PII reaching the LLM.** Redaction runs *before* the provider call, so raw
    contact details never leave the server.
11. **Malformed LLM output.** Every verdict is Zod-validated
    (`lib/ai/verdict-schema.ts`); failures fall through to NVIDIA NIM, then to a
    canned split verdict. A case never stays open forever.
12. **Self-voting / voting a closed case.** Blocked in the action *and* by the
    `votes_guard` trigger.
13. **`public_id` collisions.** Generated by a Postgres sequence
    (`next_public_case_id()`), so concurrent filings cannot race.

## Rate limits

`lib/rate-limit.ts`. Write paths **fail closed** — if Upstash is unreachable the
write is rejected, because an outage is exactly when an abuse wave is cheapest.
Read-only paths (share cards) fail open, since blocking them only breaks previews.

| Limit | Budget | Key |
|---|---|---|
| `case:create` | 3 / hour | user + IP |
| `vote` | 40 / min | user |
| `flag` | 10 / hour | user + IP |
| `verdict:global` | 60 / min | global |
| `card:download` | 20 / min | IP |
| `auth:otp` | 5 / 15 min | IP + email |
| `checkout` | 10 / hour | user + IP |

In development without Upstash, limiters log a warning and allow the write. In
production they reject.

## Content pipeline

Order is load-bearing. Do not reorder:

```
auth/tier → rate limit → Zod → redact (reject hard PII) → profanity → sanitize → insert
```

- **Redact** (`lib/moderation/redact.ts`): masks soft identifiers (names after a
  relationship cue, institutions); **hard-rejects** emails, phones, URLs, @handles,
  and long digit runs. Rejecting beats silent redaction — the author learns the
  rule instead of assuming it posted fine.
- **Profanity** (`lib/moderation/profanity.ts`): ordinary swearing does not block
  (this is a site about drama) but routes the case to `pending_review`. Slurs block
  outright.
- **Sanitize**: DOMPurify with `ALLOWED_TAGS: []`. Length is re-checked afterwards
  so a tag-stuffed payload cannot pass validation and then collapse.

## Transport headers

`upgrade-insecure-requests` and HSTS are sent **only when
`NEXT_PUBLIC_SITE_URL` is an `https://` origin**, not when `NODE_ENV=production`
(`next start` sets that locally too).

This is not cosmetic. WebKit honours `upgrade-insecure-requests` on
`http://localhost` where Chromium exempts it, rewriting every asset to
`https://localhost:3000` — no TLS listener, so the page renders with no CSS and no
fonts. Found via a WebKit e2e run, not in review.

## Known residual risk

Anonymous auth means identities are cheap. Fingerprinting plus weighting raises
the cost of manipulation but does not eliminate it. **Vote counts are
entertainment, not measurement.** If abuse appears, the next levers are requiring
verification to vote on trending cases, or an AI moderation pass before publish —
not more regex.

Leaked-password protection is still disabled in the Supabase dashboard
(Authentication → Policies). Worth enabling; it is a toggle, not a code change.
