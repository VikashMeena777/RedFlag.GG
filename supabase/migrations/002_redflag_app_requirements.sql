-- ═══════════════════════════════════════════════════════════════════════════
-- 002 — RedFlag.GG app requirements (ADDITIVE ONLY)
--
-- Your project already has the core schema (cases, votes, profiles, payments,
-- reports, moderation_logs, admin_audit_logs, ai_jobs, comments, badges,
-- boosts, follows, notifications, referrals, sponsored_slots, grievance_cases).
--
-- This migration adds only what the court app needs on top, and touches nothing
-- that already exists. It is safe to run against live data:
--   - every ADD COLUMN uses IF NOT EXISTS
--   - no column is dropped, renamed, or retyped
--   - no existing row is modified except to backfill new columns with defaults
--
-- What it adds:
--   1. Tier-weighted vote tallies (anonymous 1, verified/pro 3)
--   2. Anonymous vote fingerprint dedupe
--   3. Report counting + auto-hide at threshold
--   4. Gavel bookkeeping (verdict_attempts, heat ranking)
--   5. Cashfree subscription reference + webhook idempotency
--   6. Author strikes
--   7. Sequential public_id generator
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Weighted tallies ───────────────────────────────────────────────────
-- Raw counts already exist and stay as the displayed number. Weights drive the
-- verdict prompt and the trending rank, so an anonymous swarm cannot out-shout
-- real accounts.

alter table public.cases
  add column if not exists red_weight   integer not null default 0,
  add column if not exists green_weight integer not null default 0;

-- Backfill: treat existing seeded votes as weight-1 so ordering stays sane.
update public.cases
   set red_weight   = greatest(red_weight,   red_votes),
       green_weight = greatest(green_weight, green_votes)
 where red_weight = 0 and green_weight = 0
   and (red_votes > 0 or green_votes > 0);

-- ── 2. Vote weighting + anonymous fingerprint dedupe ──────────────────────

alter table public.votes
  add column if not exists weight smallint not null default 1
    check (weight between 1 and 3),
  add column if not exists is_anonymous_vote boolean not null default false;

-- One ballot per identity per case. Should already hold; enforce it explicitly.
create unique index if not exists votes_case_user_uniq
  on public.votes (case_id, user_id);

/*
 * The loophole this closes: clearing site data mints a fresh anonymous identity,
 * which defeats (case_id, user_id). Anonymous ballots therefore also dedupe on a
 * device fingerprint — an HMAC of IP + user-agent, computed in the app.
 *
 * Verified users are deliberately exempt: several housemates behind one NAT are
 * all legitimate voters.
 *
 * `device_fingerprint` already exists on your votes table, so this only adds the
 * partial constraint.
 */
create unique index if not exists votes_anon_fingerprint_uniq
  on public.votes (case_id, device_fingerprint)
  where is_anonymous_vote and device_fingerprint is not null;

-- ── 3. Reports: counter + auto-hide ───────────────────────────────────────

alter table public.cases
  add column if not exists report_count integer not null default 0;

create or replace function public.sync_case_report_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case_id uuid;
  v_count   integer;
begin
  v_case_id := coalesce(new.target_case_id, old.target_case_id);
  if v_case_id is null then
    return coalesce(new, old);
  end if;

  select count(*) into v_count
    from public.reports
   where target_case_id = v_case_id
     and status = 'pending';

  update public.cases
     set report_count = v_count,
         -- Five distinct pending reports hide the case pending human review.
         status = case
                    when v_count >= 5 and status in ('live', 'judging')
                      then 'hidden'::public.case_status
                    else status
                  end,
         updated_at = now()
   where id = v_case_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists reports_sync_count on public.reports;
create trigger reports_sync_count
  after insert or update or delete on public.reports
  for each row execute function public.sync_case_report_count();

-- One report per user per case: stops a single account inflating the count.
create unique index if not exists reports_case_reporter_uniq
  on public.reports (target_case_id, reporter_id)
  where target_case_id is not null and reporter_id is not null;

-- ── 4. Gavel bookkeeping ──────────────────────────────────────────────────

alter table public.cases
  add column if not exists verdict_attempts smallint not null default 0;

/*
 * Trending score: AI toxicity scaled by log vote volume, so a 95-toxic case with
 * 800 jurors outranks a 98 with six. Generated and stored, so ORDER BY is indexed
 * rather than computed per query.
 */
alter table public.cases
  add column if not exists heat numeric
    generated always as
      (coalesce(toxicity_score, 0) * ln(1 + red_weight + green_weight)) stored;

create index if not exists cases_heat_idx
  on public.cases (created_at desc, heat desc)
  where status = 'closed';

create index if not exists cases_docket_idx
  on public.cases (status, created_at desc);

-- Cases whose jury phase is over, for the cron sweep.
create index if not exists cases_gavel_idx
  on public.cases (created_at)
  where status in ('live', 'judging');

-- ── 5. Cashfree ───────────────────────────────────────────────────────────

alter table public.profiles
  -- Merchant-side subscription_id we generate and send to Cashfree.
  add column if not exists cf_subscription_ref    text unique,
  add column if not exists cf_subscription_status text;

/*
 * Webhook idempotency. Cashfree uses at-least-once delivery and exposes
 * `x-idempotency-header` (unique per payload), so a replayed CANCELLED event must
 * not re-revoke a tier the user has since repurchased.
 *
 * Reuses the existing `payments` table rather than adding another: a payment row
 * per webhook event is exactly the audit trail you want.
 */
alter table public.payments
  add column if not exists event_id text;

create unique index if not exists payments_event_id_uniq
  on public.payments (event_id)
  where event_id is not null;

create index if not exists payments_user_recent_idx
  on public.payments (user_id, created_at desc);

-- ── 6. Author strikes ─────────────────────────────────────────────────────
-- Removing a case strikes its author; three strikes ends filing rights. This is
-- the accountability half of requiring a verified account to file.

alter table public.profiles
  add column if not exists strikes smallint not null default 0
    check (strikes >= 0);

-- ── 7. Sequential public_id ───────────────────────────────────────────────
-- `public_id` is required and unique but had no generator, so inserts had to
-- invent one client-side and race. A sequence removes the race.

create sequence if not exists public.case_public_id_seq start with 7500;

create or replace function public.next_public_case_id()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'CASE-' || nextval('public.case_public_id_seq')::text;
$$;

alter table public.cases
  alter column public_id set default public.next_public_case_id();

-- ── 8. Filing eligibility helper ──────────────────────────────────────────
-- Mirrors the app-level check so RLS and triggers can share one definition.

create or replace function public.can_file_case(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    not p.is_banned
    and p.strikes < 3
    -- Accounts younger than 10 minutes cannot file: kills signup-spam-abandon.
    and p.created_at < now() - interval '10 minutes',
    false
  )
  from public.profiles p
  where p.id = p_user;
$$;

-- ── 9. Weighted tally maintenance ─────────────────────────────────────────
-- Counts are trigger-maintained so a concurrent vote cannot clobber a stale read.
-- Handles insert, vote change, and delete.

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
      red_votes    = red_votes    - (old.vote = 'red')::int   + (new.vote = 'red')::int,
      green_votes  = green_votes  - (old.vote = 'green')::int + (new.vote = 'green')::int,
      red_weight   = red_weight
                       - case when old.vote = 'red'   then old.weight else 0 end
                       + case when new.vote = 'red'   then new.weight else 0 end,
      green_weight = green_weight
                       - case when old.vote = 'green' then old.weight else 0 end
                       + case when new.vote = 'green' then new.weight else 0 end,
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

drop trigger if exists votes_sync_tallies on public.votes;
create trigger votes_sync_tallies
  after insert or update or delete on public.votes
  for each row execute function public.sync_case_vote_tallies();

-- ── 10. Vote guards ───────────────────────────────────────────────────────
-- Enforced in the database so a future code path cannot forget them.

create or replace function public.guard_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.case_status;
  v_author uuid;
begin
  select status, author_id into v_status, v_author
    from public.cases where id = new.case_id;

  if v_status not in ('live', 'judging') then
    raise exception 'CASE_CLOSED' using errcode = 'check_violation';
  end if;

  if v_author is not null and v_author = new.user_id then
    raise exception 'SELF_VOTE' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists votes_guard on public.votes;
create trigger votes_guard
  before insert or update on public.votes
  for each row execute function public.guard_vote();

-- ── 11. Privileged column guard ───────────────────────────────────────────
-- Verdicts, tallies, tier and strikes are service-role only. This is the backstop
-- that makes a mistaken RLS policy non-catastrophic.

create or replace function public.is_service_role()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    current_user
  ) in ('service_role', 'supabase_admin', 'postgres');
exception
  when others then
    return current_user in ('service_role', 'supabase_admin', 'postgres');
end;
$$;

create or replace function public.guard_privileged_case_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_service_role() then
    return new;
  end if;

  if new.status          is distinct from old.status
     or new.ai_verdict      is distinct from old.ai_verdict
     or new.ai_roast        is distinct from old.ai_roast
     or new.ai_verdict_line is distinct from old.ai_verdict_line
     or new.ai_summary      is distinct from old.ai_summary
     or new.toxicity_score  is distinct from old.toxicity_score
     or new.red_votes       is distinct from old.red_votes
     or new.green_votes     is distinct from old.green_votes
     or new.red_weight      is distinct from old.red_weight
     or new.green_weight    is distinct from old.green_weight
     or new.report_count    is distinct from old.report_count
     or new.verdict_attempts is distinct from old.verdict_attempts
     or new.public_id       is distinct from old.public_id
     or new.author_id       is distinct from old.author_id
     or new.is_featured     is distinct from old.is_featured
     or new.is_sponsored    is distinct from old.is_sponsored
  then
    raise exception 'PRIVILEGED_COLUMN' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists cases_privileged_guard on public.cases;
create trigger cases_privileged_guard
  before update on public.cases
  for each row execute function public.guard_privileged_case_columns();

create or replace function public.guard_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_service_role() then
    return new;
  end if;

  if new.is_pro is distinct from old.is_pro
     or new.is_admin        is distinct from old.is_admin
     or new.is_banned       is distinct from old.is_banned
     or new.is_shadow_banned is distinct from old.is_shadow_banned
     or new.pro_expires_at  is distinct from old.pro_expires_at
     or new.strikes         is distinct from old.strikes
     or new.karma           is distinct from old.karma
     or new.cf_subscription_ref    is distinct from old.cf_subscription_ref
     or new.cf_subscription_status is distinct from old.cf_subscription_status
  then
    raise exception 'PRIVILEGED_COLUMN' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_privileged_guard on public.profiles;
create trigger profiles_privileged_guard
  before update on public.profiles
  for each row execute function public.guard_privileged_profile_columns();

-- ── 12. Profile provisioning ──────────────────────────────────────────────
-- `handle` and `avatar_seed` are NOT NULL with no default, so an auth user with
-- no profile row would break every write. Provision on signup, including
-- anonymous sign-ins.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handle text;
begin
  -- Short, collision-resistant, and not derived from the email.
  v_handle := 'juror_' || substr(replace(new.id::text, '-', ''), 1, 10);

  insert into public.profiles (id, handle, avatar_seed, language)
  values (new.id, v_handle, substr(md5(new.id::text), 1, 12), 'en')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 13. Column-level grants ───────────────────────────────────────────────
-- Belt to the trigger's braces.

revoke update (
  public_id, author_id, status, ai_verdict, ai_summary, ai_verdict_line,
  ai_roast, ai_reasoning, ai_confidence, toxicity_score, red_votes, green_votes,
  red_weight, green_weight, report_count, verdict_attempts, is_featured,
  is_sponsored, sponsor_brand, sponsor_logo_url, created_at
) on public.cases from anon, authenticated;

revoke update (
  is_pro, is_admin, is_banned, is_shadow_banned, pro_expires_at, strikes,
  karma, cf_subscription_ref, cf_subscription_status
) on public.profiles from anon, authenticated;

revoke all on public.admin_audit_logs from anon, authenticated;
revoke all on public.moderation_logs   from anon, authenticated;
revoke all on public.payments          from anon, authenticated;
revoke all on public.ai_jobs           from anon, authenticated;
