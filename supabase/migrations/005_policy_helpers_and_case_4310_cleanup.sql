-- ═══════════════════════════════════════════════════════════════════════════
-- 005 — Policy helpers (fixes 004's profiles column conflict) + vote cleanup
--
-- 004 revoked table-wide SELECT on profiles, which broke its own insert
-- policies: they reference profiles.is_banned / .strikes, columns the
-- authenticated role can no longer read. Every direct insert then failed with
-- "permission denied for table profiles" — safe (deny), but for the wrong
-- reason, and the legitimate verified direct-file path was denied too.
--
-- Fix: no-arg SECURITY DEFINER helpers. They read the privileged columns with
-- elevated rights but only ever check the *caller's own* account (auth.uid()
-- inside the function — there is no parameter to probe another user with), so
-- the column lockdown stays intact and the policies regain their intended
-- semantics.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.caller_may_file()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    -- Anonymous sessions may vote, never file.
    (coalesce(auth.jwt() ->> 'is_anonymous', 'false'))::boolean is false
    -- Mirrors the app gate: not banned, under the strike limit, past the
    -- 10-minute cooldown.
    and not p.is_banned
    and p.strikes < 3
    and p.created_at < now() - interval '10 minutes',
    false
  )
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function public.caller_may_report()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (coalesce(auth.jwt() ->> 'is_anonymous', 'false'))::boolean is false
    and not p.is_banned,
    false
  )
  from public.profiles p
  where p.id = auth.uid();
$$;

-- Policy expressions check EXECUTE like any other call, so the authenticated
-- role needs exactly this much — and nothing else gets it.
revoke execute on function public.caller_may_file() from public, anon, authenticated;
revoke execute on function public.caller_may_report() from public, anon, authenticated;
grant execute on function public.caller_may_file() to authenticated;
grant execute on function public.caller_may_report() to authenticated;

-- Rewire the two policies onto the helpers.

drop policy if exists "verified authors file into the review queue" on public.cases;
create policy "verified authors file into the review queue"
  on public.cases
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.caller_may_file()
    -- Anything not filed through the app starts in the moderation queue; the
    -- app publishes directly via the service client, which bypasses this.
    and status = 'pending_review'
  );

drop policy if exists "verified users insert own reports" on public.reports;
create policy "verified users insert own reports"
  on public.reports
  for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and public.caller_may_report()
  );

-- ── Data cleanup ──────────────────────────────────────────────────────────
-- CASE-4310 was re-opened fresh (tallies zeroed) but its two stale zombie-era
-- ballots survived — the delete ran in the same batch as a failed statement
-- and rolled back. Removing them keeps ballots and tallies consistent; the
-- tally trigger's greatest(0, …) floor keeps the zeroed counts at zero.

delete from public.votes
 where case_id = (select id from public.cases where public_id = 'CASE-4310');
