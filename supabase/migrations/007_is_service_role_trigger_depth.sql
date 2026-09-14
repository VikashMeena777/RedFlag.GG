-- ═══════════════════════════════════════════════════════════════════════════
-- 007 — is_service_role(), take two: trigger depth, not execution role
--
-- 006's fix (check current_user first) was wrong in the other direction:
-- EVERY security-definer trigger runs as postgres, including the guards
-- themselves — so a user-initiated UPDATE reached the guard with
-- current_user = postgres and sailed through. Verified live before this
-- migration: a user-role session could forge ai_verdict and self-promote
-- is_admin.
--
-- The distinction that actually holds:
--   pg_trigger_depth() = 1 → the guard is evaluating the ORIGINAL statement.
--     Trust the requester's role: JWT claim (PostgREST), then current_user
--     (direct connections). This is the original 002 ordering.
--   pg_trigger_depth() >= 2 → the guard was reached from INSIDE another
--     trigger (report counts, vote tallies — all migration-created definer
--     code; users cannot create triggers). The write is trigger-maintained
--     bookkeeping and must be allowed even though the initiating statement
--     was a user's report insert.
--
-- Also in this migration: migration 002's column UPDATE revokes were silent
-- no-ops — you cannot revoke a *column* privilege to override a *table-level*
-- GRANT; the table grant must be revoked first and the safe columns
-- re-granted individually. Done properly here for cases and profiles, so the
-- trigger is no longer the only line of defence.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.is_service_role()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Direct privileged statement: a direct connection (current_user) or a
  -- PostgREST request carrying a service-role JWT.
  if current_user in ('service_role', 'supabase_admin', 'postgres')
     or coalesce(
          nullif(current_setting('request.jwt.claim.role', true), ''),
          (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
        ) in ('service_role', 'supabase_admin', 'postgres') then
    return true;
  end if;

  -- Depth 1 is the guard itself evaluating the original statement, so >= 2
  -- means another trigger initiated this write: trusted bookkeeping (tally
  -- maintenance, report counts) running on behalf of a user statement.
  return pg_trigger_depth() >= 2;
exception
  when others then
    return current_user in ('service_role', 'supabase_admin', 'postgres');
end;
$$;

-- ── Real column-level UPDATE enforcement ──────────────────────────────────
-- Table-level UPDATE goes away for user roles; only the non-privileged
-- columns come back. The service role keeps its table-wide grant.

revoke update on public.cases from anon, authenticated;
grant update (title, body, category, judge_persona, language, image_urls,
              media_blurred, updated_at)
  on public.cases to authenticated;

revoke update on public.profiles from anon, authenticated;
grant update (handle, avatar_seed, language, handle_changes_this_month,
              handle_changes_reset_at, jury_streak, jury_last_voted_on,
              free_boost_credits, grievance_sla_due_at, updated_at)
  on public.profiles to authenticated;
