-- ═══════════════════════════════════════════════════════════════════════════
-- 004 — RLS hardening for anonymous sign-ins
--
-- Supabase warns, when enabling Anonymous sign-ins, that anonymous users share
-- the `authenticated` role and therefore every RLS policy written for it.
-- Reviewed 2026-09-15 against the live policies; four gaps found, all
-- exploitable by a raw /rest/v1 caller bypassing the app:
--
--   1. cases INSERT policy only checked author_id = auth.uid(). An anonymous
--      session could POST a case with status='live' straight to the public
--      docket — bypassing verification, rate limits, PII redaction and
--      profanity screening (the privileged-column trigger only fires on
--      UPDATE, not INSERT).
--   2. votes INSERT/UPDATE/DELETE policies let any authenticated user forge
--      weight=3 ballots at unlimited volume (the weight check allows 1–3 and
--      nothing derives it server-side for direct calls). The app writes votes
--      exclusively through the service client, so user-role write access is
--      dead weight — removed.
--   3. reports INSERT had no verified/banned check, so five minted anonymous
--      identities could auto-hide any case (the 5-report trigger).
--   4. profiles was world-readable in full — is_admin, ban reasons, Cashfree
--      references included.
--
-- The app itself is unaffected: every write it makes to cases/votes/profiles
-- goes through the service-role client, which bypasses RLS. Only reports are
-- inserted with the user's own client, and that path keeps working for
-- verified, unbanned users.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. cases: direct inserts are verified, eligible, and land in review ────

drop policy if exists "authors insert cases" on public.cases;

create policy "verified authors file into the review queue"
  on public.cases
  for insert to authenticated
  with check (
    author_id = auth.uid()
    -- Anonymous sessions may vote; they may never file.
    and (coalesce(auth.jwt() ->> 'is_anonymous', 'false'))::boolean is false
    -- Mirrors the app gate: not banned, under the strike limit, past the
    -- 10-minute cooldown.
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and not p.is_banned
         and p.strikes < 3
         and p.created_at < now() - interval '10 minutes'
    )
    -- Anything not filed through the app starts in the moderation queue; the
    -- app publishes directly via the service client, which bypasses this.
    and status = 'pending_review'
  );

-- Authors manage lifecycle through the app (soft-delete by admin); a hard
-- DELETE would dodge the strike/moderation trail, so remove it.
drop policy if exists "authors delete own cases" on public.cases;
revoke delete on public.cases from anon, authenticated;

-- ── 2. votes: service-role writes only; reads limited to own ballots ──────

drop policy if exists "users insert own votes" on public.votes;
drop policy if exists "users update own votes" on public.votes;
drop policy if exists "users delete own votes" on public.votes;
revoke insert, update, delete on public.votes from anon, authenticated;

-- The old read policy exposed every ballot — including other users' device
-- fingerprints — to any signed-in session. The app only ever reads the
-- viewer's own votes.
drop policy if exists "votes visible to authenticated users" on public.votes;
create policy "users see own votes"
  on public.votes
  for select to authenticated
  using (auth.uid() = user_id);

-- ── 3. reports: verified, unbanned users only (mirrors the app gate) ──────

drop policy if exists "users insert own reports" on public.reports;

create policy "verified users insert own reports"
  on public.reports
  for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and (coalesce(auth.jwt() ->> 'is_anonymous', 'false'))::boolean is false
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and not p.is_banned
    )
  );

-- ── 4. profiles: stop leaking admin flags, ban reasons, billing refs ──────
-- Column-level grants: table-wide SELECT is revoked and only genuinely public
-- columns re-granted. (A column REVOKE cannot override a table GRANT in
-- Postgres — the table grant must go first.)

revoke select on public.profiles from anon, authenticated;
grant select (id, handle, avatar_seed, karma, created_at)
  on public.profiles to anon, authenticated;
