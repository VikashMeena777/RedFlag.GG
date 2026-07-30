-- ═══════════════════════════════════════════════════════════════════════════
-- RedFlag.GG — initial schema
--
-- Security model in one paragraph: anonymous users may vote and nothing else.
-- Filing, flagging and subscribing require a verified account. Privileged
-- columns (verdict, status, tallies, tier, strikes) are writable only by the
-- service role. All three of those rules are enforced here in the database, not
-- just in application code, because RLS is one config mistake away from open and
-- a trigger is not.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Enums ─────────────────────────────────────────────────────────────────

create type public.user_tier   as enum ('anonymous', 'verified', 'plus');
create type public.case_status as enum ('in_session', 'closed', 'removed');
create type public.vote_choice as enum ('red', 'green');
create type public.case_category as enum
  ('dating', 'situationship', 'friendship', 'family', 'work');

-- ── Role helpers ──────────────────────────────────────────────────────────

-- True when the current connection uses the service-role key. Used by the
-- privileged-column guard below. `auth.role()` reads the JWT role claim; the
-- service role connects without a user JWT, hence the current_user fallback.
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

-- ── Profiles ──────────────────────────────────────────────────────────────
-- One row per auth user, created automatically. `tier` is the single source of
-- truth for permissions and is never writable by the user.

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  tier          public.user_tier not null default 'anonymous',
  strikes       smallint not null default 0 check (strikes >= 0),
  filing_banned boolean  not null default false,
  -- Stripe linkage; written only by the webhook via service role.
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  plus_until    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.profiles.tier is
  'Permission tier. Maintained by triggers + Stripe webhook. Never client-writable.';

-- Effective tier, accounting for an expired RedFlag+ subscription.
create or replace function public.effective_tier(p_user uuid)
returns public.user_tier
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p.tier = 'plus'
                and p.plus_until is not null
                and p.plus_until < now()
             then 'verified'::public.user_tier
           else p.tier
         end
  from public.profiles p
  where p.id = p_user;
$$;

create or replace function public.is_verified_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.effective_tier(p_user) in ('verified', 'plus'), false);
$$;

create or replace function public.can_file(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.is_verified_user(p_user)
      and not p.filing_banned
      and p.strikes < 3
      -- Accounts younger than 10 minutes cannot file: kills signup-spam-abandon.
      and p.created_at < now() - interval '10 minutes',
    false
  )
  from public.profiles p
  where p.id = p_user;
$$;

-- Provision a profile whenever an auth user appears. Anonymous sign-ins land as
-- 'anonymous'; email/OAuth sign-ups with a confirmed address land as 'verified'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, tier)
  values (
    new.id,
    case
      when coalesce((new.raw_app_meta_data ->> 'is_anonymous')::boolean, false)
        then 'anonymous'::public.user_tier
      when new.email_confirmed_at is not null
        then 'verified'::public.user_tier
      else 'anonymous'::public.user_tier
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Promote anonymous → verified the moment an identity is linked and confirmed.
-- This is what lets a voter keep their history when they upgrade to file.
create or replace function public.handle_user_verified()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null
     and not coalesce((new.raw_app_meta_data ->> 'is_anonymous')::boolean, false)
  then
    update public.profiles
       set tier = case when tier = 'plus' then 'plus' else 'verified' end,
           updated_at = now()
     where id = new.id
       and tier = 'anonymous';
  end if;
  return new;
end;
$$;

create trigger on_auth_user_verified
  after update on auth.users
  for each row execute function public.handle_user_verified();

-- ── Cases ─────────────────────────────────────────────────────────────────

create table public.cases (
  id         uuid primary key default gen_random_uuid(),
  case_no    bigserial not null unique,
  slug       text not null unique,
  author_id  uuid not null references auth.users(id) on delete cascade,
  category   public.case_category not null,
  title      text not null check (char_length(title) between 8 and 80),
  body       text not null check (char_length(body) between 60 and 1200),

  status     public.case_status not null default 'in_session',
  closes_at  timestamptz not null default now() + interval '12 hours',
  vote_target integer not null default 100 check (vote_target > 0),

  -- Raw counts are what the UI shows.
  red_votes   integer not null default 0 check (red_votes   >= 0),
  green_votes integer not null default 0 check (green_votes >= 0),
  -- Weighted tallies drive the verdict and ranking (anonymous 1, verified 3).
  red_weight   integer not null default 0 check (red_weight   >= 0),
  green_weight integer not null default 0 check (green_weight >= 0),

  verdict    jsonb,
  toxicity   smallint check (toxicity between 0 and 100),
  verdict_attempts smallint not null default 0,
  verdict_generated_at timestamptz,

  is_hidden    boolean not null default false,
  needs_review boolean not null default false,
  flag_count   integer not null default 0 check (flag_count >= 0),

  created_at timestamptz not null default now(),

  -- Trending score: severity scaled by how many people showed up.
  heat numeric generated always as
    (coalesce(toxicity, 0) * ln(1 + red_weight + green_weight)) stored
);

comment on column public.cases.heat is
  'AI toxicity weighted by log vote volume. A 95-toxic case with 800 votes beats a 98 with 6.';

create index cases_docket_idx  on public.cases (status, created_at desc)
  where not is_hidden;
create index cases_heat_idx    on public.cases (created_at desc, heat desc)
  where status = 'closed' and not is_hidden;
create index cases_gavel_idx   on public.cases (closes_at)
  where status = 'in_session';
create index cases_author_idx  on public.cases (author_id, created_at desc);

-- ── Votes ─────────────────────────────────────────────────────────────────

create table public.votes (
  id        uuid primary key default gen_random_uuid(),
  case_id   uuid not null references public.cases(id) on delete cascade,
  voter_id  uuid not null references auth.users(id) on delete cascade,
  choice    public.vote_choice not null,
  weight    smallint not null default 1 check (weight between 1 and 3),
  -- HMAC(salt, ip + user-agent). One-way: no raw IP is ever stored.
  voter_fp  text,
  is_anonymous_vote boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (case_id, voter_id)
);

-- The loophole this closes: clearing storage mints a brand-new anonymous
-- identity, which would defeat the (case_id, voter_id) constraint. Anonymous
-- ballots therefore also dedupe on device fingerprint. Verified users are
-- exempt, because a shared household IP is legitimate.
create unique index votes_anon_fp_idx
  on public.votes (case_id, voter_fp)
  where is_anonymous_vote and voter_fp is not null;

create index votes_case_idx  on public.votes (case_id);
create index votes_voter_idx on public.votes (voter_id);

-- ── Flags ─────────────────────────────────────────────────────────────────

create table public.flags (
  id       uuid primary key default gen_random_uuid(),
  case_id  uuid not null references public.cases(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  reason   text not null check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  unique (case_id, user_id)
);

create index flags_case_idx on public.flags (case_id);

-- ── Moderation audit ──────────────────────────────────────────────────────

create table public.moderation_actions (
  id        uuid primary key default gen_random_uuid(),
  case_id   uuid references public.cases(id) on delete set null,
  case_no_snapshot bigint,
  action    text not null,
  actor_id  uuid references auth.users(id) on delete set null,
  note      text,
  created_at timestamptz not null default now()
);

create index moderation_case_idx on public.moderation_actions (created_at desc);

-- ── Stripe webhook idempotency ────────────────────────────────────────────

create table public.stripe_events (
  id           text primary key,
  type         text not null,
  processed_at timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

-- Maintain both raw and weighted tallies. Never computed in app code, so a
-- concurrent vote can't clobber a count with a stale read.
create or replace function public.update_case_votes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.cases set
      red_votes    = red_votes    + (new.choice = 'red')::int,
      green_votes  = green_votes  + (new.choice = 'green')::int,
      red_weight   = red_weight   + case when new.choice = 'red'   then new.weight else 0 end,
      green_weight = green_weight + case when new.choice = 'green' then new.weight else 0 end
    where id = new.case_id;

  elsif tg_op = 'UPDATE' then
    update public.cases set
      red_votes    = red_votes    - (old.choice = 'red')::int   + (new.choice = 'red')::int,
      green_votes  = green_votes  - (old.choice = 'green')::int + (new.choice = 'green')::int,
      red_weight   = red_weight
                       - case when old.choice = 'red'   then old.weight else 0 end
                       + case when new.choice = 'red'   then new.weight else 0 end,
      green_weight = green_weight
                       - case when old.choice = 'green' then old.weight else 0 end
                       + case when new.choice = 'green' then new.weight else 0 end
    where id = new.case_id;

  elsif tg_op = 'DELETE' then
    update public.cases set
      red_votes    = greatest(0, red_votes    - (old.choice = 'red')::int),
      green_votes  = greatest(0, green_votes  - (old.choice = 'green')::int),
      red_weight   = greatest(0, red_weight   - case when old.choice = 'red'   then old.weight else 0 end),
      green_weight = greatest(0, green_weight - case when old.choice = 'green' then old.weight else 0 end)
    where id = old.case_id;
    return old;
  end if;

  return new;
end;
$$;

create trigger vote_tally
  after insert or update or delete on public.votes
  for each row execute function public.update_case_votes();

-- Reject votes on cases that are not open, and self-voting. Enforced here so it
-- holds even if a future code path forgets to check.
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

  if v_status is distinct from 'in_session' then
    raise exception 'CASE_CLOSED' using errcode = 'check_violation';
  end if;

  if v_author = new.voter_id then
    raise exception 'SELF_VOTE' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger vote_guard
  before insert or update on public.votes
  for each row execute function public.guard_vote();

-- Anonymous accounts must never own a case or a flag. Third layer of the same
-- rule (action check + RLS WITH CHECK are the other two).
create or replace function public.guard_verified_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_verified_user(new.author_id) then
    raise exception 'VERIFICATION_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger case_requires_verified
  before insert on public.cases
  for each row execute function public.guard_verified_author();

create or replace function public.guard_verified_flagger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_verified_user(new.user_id) then
    raise exception 'VERIFICATION_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger flag_requires_verified
  before insert on public.flags
  for each row execute function public.guard_verified_flagger();

-- Privileged columns: service role only. This is the backstop that makes a
-- mistaken RLS policy non-catastrophic.
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

  if new.status       is distinct from old.status
     or new.verdict   is distinct from old.verdict
     or new.toxicity  is distinct from old.toxicity
     or new.red_votes is distinct from old.red_votes
     or new.green_votes  is distinct from old.green_votes
     or new.red_weight   is distinct from old.red_weight
     or new.green_weight is distinct from old.green_weight
     or new.is_hidden    is distinct from old.is_hidden
     or new.flag_count   is distinct from old.flag_count
     or new.verdict_attempts is distinct from old.verdict_attempts
     or new.case_no   is distinct from old.case_no
     or new.author_id is distinct from old.author_id
     or new.closes_at is distinct from old.closes_at
     or new.vote_target is distinct from old.vote_target
  then
    raise exception 'PRIVILEGED_COLUMN' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

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

  if new.tier is distinct from old.tier
     or new.strikes is distinct from old.strikes
     or new.filing_banned is distinct from old.filing_banned
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.plus_until is distinct from old.plus_until
  then
    raise exception 'PRIVILEGED_COLUMN' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger profiles_privileged_guard
  before update on public.profiles
  for each row execute function public.guard_privileged_profile_columns();

-- Community flagging: auto-hide at 5 distinct flags, pending human review.
create or replace function public.handle_flag_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.flags where case_id = new.case_id;

  update public.cases
     set flag_count = v_count,
         needs_review = true,
         is_hidden = (v_count >= 5)
   where id = new.case_id;

  return new;
end;
$$;

create trigger flag_threshold
  after insert on public.flags
  for each row execute function public.handle_flag_insert();

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles           enable row level security;
alter table public.cases              enable row level security;
alter table public.votes              enable row level security;
alter table public.flags              enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.stripe_events      enable row level security;

-- profiles: you may read and update only your own row, and the privileged
-- columns are blocked by trigger regardless.
create policy "own profile readable"
  on public.profiles for select
  using (auth.uid() = id);

create policy "own profile updatable"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- cases: public read of live cases; authors can additionally see their own
-- hidden ones so a takedown isn't silent.
create policy "cases publicly readable"
  on public.cases for select
  using (
    status <> 'removed'
    and (not is_hidden or author_id = auth.uid())
  );

-- The WITH CHECK is the important part: a verified author, and a case that
-- starts life neutral. A client cannot insert a pre-decided verdict.
create policy "verified users may file"
  on public.cases for insert
  with check (
    author_id = auth.uid()
    and public.can_file(auth.uid())
    and status = 'in_session'
    and verdict is null
    and toxicity is null
    and red_votes = 0 and green_votes = 0
    and red_weight = 0 and green_weight = 0
    and is_hidden = false
    and flag_count = 0
    and verdict_attempts = 0
  );

-- Authors may edit nothing but their own body/title, and only while open.
-- (Privileged columns are additionally trigger-guarded.)
create policy "authors may edit own open case"
  on public.cases for update
  using (author_id = auth.uid() and status = 'in_session')
  with check (author_id = auth.uid() and status = 'in_session');

-- votes: tallies are public, ballots are owned.
create policy "votes readable"
  on public.votes for select
  using (true);

create policy "own vote insertable"
  on public.votes for insert
  with check (voter_id = auth.uid());

create policy "own vote updatable"
  on public.votes for update
  using (voter_id = auth.uid())
  with check (voter_id = auth.uid());

-- flags: verified users may file one per case. No SELECT policy at all, so
-- flag contents are invisible to clients (admin reads go through service role).
create policy "verified users may flag"
  on public.flags for insert
  with check (user_id = auth.uid() and public.is_verified_user(auth.uid()));

-- moderation_actions and stripe_events: RLS on, zero policies. Service role only.

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANTS
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on public.moderation_actions from anon, authenticated;
revoke all on public.stripe_events      from anon, authenticated;

-- Generated and privileged columns are never directly writable by clients.
revoke update (
  case_no, author_id, status, verdict, toxicity, verdict_attempts,
  verdict_generated_at, red_votes, green_votes, red_weight, green_weight,
  is_hidden, flag_count, closes_at, vote_target, slug, created_at
) on public.cases from anon, authenticated;

revoke update (tier, strikes, filing_banned, stripe_customer_id,
               stripe_subscription_id, plus_until)
  on public.profiles from anon, authenticated;
