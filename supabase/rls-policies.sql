-- =====================================================================
-- ROW-LEVEL SECURITY FOR evtol_users
-- =====================================================================
-- REVIEW THIS BEFORE RUNNING IT. It is written to be applied by hand in the
-- Supabase SQL editor, not executed by the application.
--
-- WHY IT MATTERS
--
-- The Supabase anon key ships inside the client bundle. That is by design —
-- anon keys are public — and the control that actually protects your data is
-- row-level security. If RLS is disabled, or a policy grants anonymous SELECT,
-- then every row of evtol_users is readable by anyone who opens the bundle and
-- issues one REST call. No amount of password hashing changes that.
--
-- This has never been verified in this project. Check it before trusting
-- anything else in the auth stack.
--
-- ORDER OF OPERATIONS
--
-- These policies assume VITE_AUTH_MODE="supabase", because they key on
-- auth.uid() — the authenticated user's id from the session JWT. Under the
-- legacy "custom" mode there IS no auth.uid(), so a policy of this shape locks
-- the application out of its own table. Migrate first, then apply.
--
-- Run the diagnostic block at the bottom FIRST to see what you have today.
-- =====================================================================


-- ── 1. Link the profile table to the auth user ───────────────────────
-- evtol_users.id is currently an application-generated id. To key policies on
-- auth.uid() the row must carry the auth user's UUID.

alter table public.evtol_users
  add column if not exists auth_uid uuid references auth.users(id) on delete cascade;

create unique index if not exists evtol_users_auth_uid_key
  on public.evtol_users(auth_uid);

-- Backfill by matching on email. Run once, AFTER accounts have migrated.
-- update public.evtol_users u
--    set auth_uid = a.id
--   from auth.users a
--  where lower(a.email) = lower(u.email)
--    and u.auth_uid is null;


-- ── 2. Turn RLS on ───────────────────────────────────────────────────
-- With RLS enabled and NO policy, the table denies everything. Policies below
-- then grant back only what is needed.

alter table public.evtol_users enable row level security;


-- ── 3. Drop anything permissive that may already exist ───────────────
-- A leftover "allow all" policy silently defeats everything below it.

drop policy if exists "public read"            on public.evtol_users;
drop policy if exists "Enable read access for all users" on public.evtol_users;
drop policy if exists "anon full access"       on public.evtol_users;


-- ── 4. A user may read and update ONLY their own row ─────────────────

create policy "read own profile"
  on public.evtol_users for select
  to authenticated
  using (auth_uid = auth.uid());

create policy "update own profile"
  on public.evtol_users for update
  to authenticated
  using      (auth_uid = auth.uid())
  with check (auth_uid = auth.uid());

-- Insert only a row that belongs to the caller, so a signed-in user cannot
-- create a profile pointing at somebody else's auth identity.
create policy "insert own profile"
  on public.evtol_users for insert
  to authenticated
  with check (auth_uid = auth.uid());

-- Deliberately NO delete policy: account deletion should cascade from
-- auth.users, not be issued by the client.


-- ── 5. Sign-up needs a uniqueness check without exposing the table ────
-- The app checks "does this email already exist" before registering. Under the
-- policies above an anonymous caller cannot see any row, which is correct — so
-- expose exactly that one fact through a function instead of opening SELECT.

create or replace function public.email_taken(check_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.evtol_users
     where lower(email) = lower(trim(check_email))
  );
$$;

revoke all on function public.email_taken(text) from public;
grant execute on function public.email_taken(text) to anon, authenticated;

-- NOTE: this is an email-enumeration oracle by construction — that is
-- unavoidable if sign-up is to say "this email is already registered". It
-- returns a single boolean and nothing else, which is the narrowest form.
-- Rate-limit it at the edge if enumeration matters to you.


-- ── 6. DIAGNOSTIC — run this FIRST, before applying anything above ────
-- Tells you whether the table is currently exposed.

-- select relname,
--        relrowsecurity  as rls_enabled,
--        relforcerowsecurity as rls_forced
--   from pg_class
--  where relname = 'evtol_users';
--
-- select policyname, roles, cmd, qual, with_check
--   from pg_policies
--  where tablename = 'evtol_users';
--
-- If rls_enabled is false, or any policy lists {anon} for cmd = SELECT,
-- every stored credential is world-readable right now.
