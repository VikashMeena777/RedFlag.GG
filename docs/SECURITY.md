# Security model

Read this before touching auth, votes, verdicts, or billing.

The central risk of this product is not fraud, it is that cases are about **real
people who never consented to appear**. Everything below is arranged around that,
with vote integrity second.

## Trust tiers

Voting is frictionless because that is the viral surface. Filing is gated because
that is the liability.

| Capability | Anonymous | Verified | RedFlag+ |
|---|---|---|---|
| Read / share | yes | yes | yes |
| Vote | yes (weight 1) | yes (weight 3) | yes (weight 3) |
| File a case | **no** | 2/day | unlimited |
| Report a case | **no** | yes | yes |
| Subscribe | **no** | yes | — |

`profiles.tier` is the single source of truth. It is resolved server-side by
`getViewer()` (`lib/auth/viewer.ts`) and **never** read from the client.

## Defence in depth

Anonymous users cannot file. That rule is enforced in three independent places, so
one mistake is not a breach:

1. **Server action** — `fileCase()` checks `viewer.canFile` (`lib/actions/cases.ts`).
2. **RLS `WITH CHECK`** — the `verified users may file` policy calls `can_file()`.
3. **DB trigger** — `case_requires_verified` raises `VERIFICATION_REQUIRED`.

The same pattern applies to flagging (`flag_requires_verified`).

## Privileged columns

`status`, `verdict`, `toxicity`, `red_votes`, `green_votes`, `red_weight`,
`green_weight`, `is_hidden`, `flag_count`, `verdict_attempts`, `tier`, `strikes`,
`filing_banned`, and all `stripe_*` columns are **service-role only**.

Two mechanisms:
- `REVOKE UPDATE (...)` on those columns from `anon` and `authenticated`.
- `guard_privileged_case_columns` / `guard_privileged_profile_columns` triggers
  raise `PRIVILEGED_COLUMN` if any other role changes them.

This is why a client can never insert a pre-decided verdict or promote itself to
`plus`.

## Closed loopholes

1. **Ballot stuffing by clearing storage.** A cleared browser mints a fresh
   anonymous identity, defeating `UNIQUE(case_id, voter_id)`. Anonymous ballots
   therefore also carry `voter_fp` = `HMAC-SHA256(VOTE_FP_SALT, ip + user-agent)`,
   with a partial unique index `votes_anon_fp_idx` on anonymous rows only.
   Verified users are exempt — a shared household NAT is legitimate.
   *No raw IP is ever stored or logged; the digest is one-way.*
2. **Anonymous swarm outvoting real users.** Tallies are weighted (1 vs 3) and the
   verdict prompt plus the `heat` ranking both read weights, not raw counts.
3. **Disposable-email signups.** Domain blocklist + OTP (the address must receive
   mail) in `lib/validation.ts`.
4. **Signup-then-spam.** `can_file()` requires an account older than 10 minutes.
5. **Repeat offenders.** Removing a case strikes the author; 3 strikes sets
   `filing_banned`. Voting is never revoked.
6. **Cron endpoint abuse.** `CRON_SECRET` compared with `timingSafeEqual`, and the
   route **fails closed when the secret is unset**.
7. **Share-card abuse.** `/api/card/[slug]` serves only `closed` + `not hidden`
   cases, is IP rate-limited, and 404s otherwise — it can never leak a hidden body.
8. **Stripe webhook forgery.** Raw-body signature verification (`request.text()`,
   never parsed JSON first) plus event-ID idempotency in `stripe_events`. Tier
   changes happen **only** in the webhook.
9. **Open redirect on the auth callback.** `safeNext()` accepts same-origin
   relative paths only; rejects `//host` and control characters.
10. **PII reaching the LLM.** Redaction runs *before* the provider call, so raw
    contact details never leave the server.
11. **Malformed LLM output.** Every verdict is Zod-validated
    (`lib/ai/verdict-schema.ts`); failures are treated as provider failures and
    fall through to Gemini, then to a canned mistrial.
12. **Self-voting / voting a closed case.** Blocked in the action *and* by the
    `vote_guard` trigger.

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
  (this is a site about drama) but sets `needs_review`. Slurs block outright.
- **Sanitize**: DOMPurify with `ALLOWED_TAGS: []`. Length is re-checked afterwards
  so a tag-stuffed payload cannot pass validation and then collapse.

## Known residual risk

Anonymous auth means identities are cheap. Fingerprinting plus weighting raises
the cost of manipulation but does not eliminate it. **Vote counts are
entertainment, not measurement.** If abuse appears, the next levers are requiring
verification to vote on trending cases, or an AI moderation pass before publish —
not more regex.
