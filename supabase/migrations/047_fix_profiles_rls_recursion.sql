-- ============================================================
-- 047: Fix infinite RLS recursion introduced by migration 046
-- ============================================================
-- The "Senders can view profiles of accepted invitees" policy queries
-- invitations directly, but invitations already has "Recipients can view
-- invitations sent to their email" which queries profiles right back —
-- a profiles -> invitations -> profiles cycle. Postgres detects this as
-- infinite recursion when evaluating profiles RLS, breaking profile
-- fetches (and therefore login) for every user, not just the ones
-- affected by 046's new policies.
--
-- Fix: route through a SECURITY DEFINER helper (same pattern as
-- current_user_company_id()/current_user_is_mojo_admin() elsewhere in
-- this schema) — its internal query runs as the function owner, which
-- doesn't re-trigger RLS on the querying user's behalf, breaking the cycle.

drop policy if exists "Senders can view profiles of accepted invitees" on profiles;
drop policy if exists "Senders can view companies of accepted invitees" on companies;

create or replace function public.current_user_accepted_invitee_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select accepted_by from invitations
  where sender_id = auth.uid() and accepted_by is not null
$$;

create policy "Senders can view profiles of accepted invitees"
  on profiles for select
  using (id in (select public.current_user_accepted_invitee_ids()));

create policy "Senders can view companies of accepted invitees"
  on companies for select
  using (
    id in (
      select new_company_id from profiles
      where id in (select public.current_user_accepted_invitee_ids())
    )
  );
