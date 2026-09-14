-- ═══════════════════════════════════════════════════════════════════════════
-- 006 — is_service_role(): trust the execution role before the JWT claim
--
-- Caught 2026-09-15 by functionally exercising the report path for the first
-- time (the reports table had zero rows ever — the bug had never fired):
--
-- A verified user's report insert (the app's own path) failed with
-- PRIVILEGED_COLUMN. Chain: user-client INSERT → reports_sync_count trigger
-- (SECURITY DEFINER, owned by postgres) updates cases.report_count →
-- cases_privileged_guard calls is_service_role() → which checked
-- request.jwt.claim.role FIRST — still 'authenticated', the *caller's* claim —
-- so the definer-context update was misread as unprivileged and rejected.
--
-- The same defect explains the historical "vote upsert RLS error" (commit
-- 4cc2fa7): user-client vote writes tripped the tally trigger into the same
-- guard. That was worked around by moving votes to the service client; this
-- fixes the root cause.
--
-- Fix: check current_user first. current_user cannot be forged by a request —
-- it is the role the database is actually executing as. Security-definer
-- triggers owned by postgres ARE postgres and must be trusted; plain user
-- requests still fail both checks. The JWT claim remains as the second check
-- for PostgREST connections executing as `authenticator`.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.is_service_role()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- The actual execution role wins: security-definer triggers and functions
  -- owned by postgres run as postgres regardless of who triggered them.
  if current_user in ('service_role', 'supabase_admin', 'postgres') then
    return true;
  end if;

  -- PostgREST may execute as `authenticator`; the real role is in the JWT.
  return coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  ) in ('service_role', 'supabase_admin', 'postgres');
exception
  when others then
    return current_user in ('service_role', 'supabase_admin', 'postgres');
end;
$$;
