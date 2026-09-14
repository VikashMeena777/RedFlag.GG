-- ═══════════════════════════════════════════════════════════════════════════
-- 003 — Tally floor, Postgres rate limiter, data repairs
--
-- Three production issues found 2026-09-15, all verified against the live
-- database before writing this:
--
--   1. sync_case_vote_tallies() UPDATE branch could drive red_votes/green_votes
--      below zero (the DELETE branch already floored at 0; UPDATE did not).
--      Live evidence: CASE-7501 carried red_votes = -1.
--   2. With Upstash unconfigured, the app had NO working rate limiter: every
--      write path allowed unlimited requests (health endpoint reported
--      "degraded"). This adds a Postgres-backed fixed-window limiter so
--      enforcement works with zero external services.
--   3. Two seeded cases (CASE-4310, CASE-2307) have been stuck `live` since
--      June while already carrying a verdict — the gavel's `ai_verdict IS NULL`
--      guard correctly refuses to re-judge them, so nothing would ever close
--      them. They render as eternally-overdue open cases and still accept
--      votes.
--
-- Additive and idempotent where possible; the data repairs are scoped tightly
-- so seeded demo counts on healthy rows are untouched.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tally floors on the UPDATE branch ──────────────────────────────────
-- A vote change must never take a count below zero, whatever the prior state
-- of the row. Same greatest(0, …) guard the DELETE branch already had.

create or replace function public.sync_case_vote_tallies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.cases set
      red_votes    = red_votes    + (new.vote = 'red')::int,
      green_votes  = green_votes  + (new.vote = 'green')::int,
      red_weight   = red_weight   + case when new.vote = 'red'   then new.weight else 0 end,
      green_weight = green_weight + case when new.vote = 'green' then new.weight else 0 end,
      updated_at   = now()
    where id = new.case_id;
    return new;

  elsif tg_op = 'UPDATE' then
    update public.cases set
      red_votes    = greatest(0, red_votes    - (old.vote = 'red')::int   + (new.vote = 'red')::int),
      green_votes  = greatest(0, green_votes  - (old.vote = 'green')::int + (new.vote = 'green')::int),
      red_weight   = greatest(0, red_weight   - case when old.vote = 'red'   then old.weight else 0 end
                                          + case when new.vote = 'red'   then new.weight else 0 end),
      green_weight = greatest(0, green_weight - case when old.vote = 'green' then old.weight else 0 end
                                          + case when new.vote = 'green' then new.weight else 0 end),
      updated_at   = now()
    where id = new.case_id;
    return new;

  else
    update public.cases set
      red_votes    = greatest(0, red_votes    - (old.vote = 'red')::int),
      green_votes  = greatest(0, green_votes  - (old.vote = 'green')::int),
      red_weight   = greatest(0, red_weight   - case when old.vote = 'red'   then old.weight else 0 end),
      green_weight = greatest(0, green_weight - case when old.vote = 'green' then old.weight else 0 end),
      updated_at   = now()
    where id = old.case_id;
    return old;
  end if;
end;
$$;

-- ── 2. Postgres rate limiter ──────────────────────────────────────────────
-- Fixed-window counter per (name, identifier). One atomic statement per check:
-- the ON CONFLICT row lock serialises concurrent calls for the same key, so
-- counts cannot be lost to a race. Used by the app only when Upstash is not
-- configured (lib/rate-limit.ts); rows are pruned by the gavel cron.

create table if not exists public.rate_limits (
  name         text        not null,
  identifier   text        not null,
  window_start timestamptz not null default now(),
  count        integer     not null default 0,
  primary key (name, identifier)
);

alter table public.rate_limits enable row level security;

-- Belt to RLS's braces: no policies exist, but be explicit anyway.
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

create or replace function public.consume_rate_limit(
  p_name            text,
  p_identifier      text,
  p_limit           integer,
  p_window_seconds  integer
)
returns table (allowed boolean, used integer, retry_after integer)
language sql
security definer
set search_path = ''
as $$
  insert into public.rate_limits as rl (name, identifier, window_start, count)
  values (p_name, p_identifier, now(), 1)
  on conflict (name, identifier) do update
    set count = case
          when rl.window_start <= now() - make_interval(secs => p_window_seconds)
            then 1
          else rl.count + 1
        end,
        window_start = case
          when rl.window_start <= now() - make_interval(secs => p_window_seconds)
            then now()
          else rl.window_start
        end
  returning rl.count <= p_limit as allowed,
            rl.count as used,
            greatest(0, ceil(extract(epoch from
              rl.window_start + make_interval(secs => p_window_seconds) - now()
            )))::integer as retry_after;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, which would expose this at
-- /rest/v1/rpc/consume_rate_limit and let anyone burn limiter slots.
revoke execute on function public.consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer)
  to service_role;

-- ── 3a. Repair negative tallies ───────────────────────────────────────────
-- Recomputed from the ballots table, and scoped to rows whose counts actually
-- went negative, so seeded demo tallies on healthy rows are left alone.

with truth as (
  select case_id,
         count(*) filter (where vote = 'red')   as rv,
         count(*) filter (where vote = 'green') as gv,
         coalesce(sum(weight) filter (where vote = 'red'),   0) as rw,
         coalesce(sum(weight) filter (where vote = 'green'), 0) as gw
  from public.votes
  group by case_id
)
update public.cases c
   set red_votes   = truth.rv,
       green_votes = truth.gv,
       red_weight  = truth.rw,
       green_weight = truth.gw,
       updated_at  = now()
  from truth
 where c.id = truth.case_id
   and (c.red_votes < 0 or c.green_votes < 0);

-- ── 3b. Close zombie cases ────────────────────────────────────────────────
-- Cases that are still `live`/`judging` past the 12-hour session window while
-- already carrying a verdict. The gavel will never pick them up (it only
-- judges verdict-less cases, by design), so closing them here is the only
-- consistent state: their verdict is already public.

update public.cases
   set status    = 'closed',
       closed_at = coalesce(closed_at, now()),
       updated_at = now()
 where status in ('live', 'judging')
   and ai_verdict is not null
   and created_at < now() - interval '12 hours';
