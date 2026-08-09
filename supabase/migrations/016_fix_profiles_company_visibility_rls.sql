-- Migration 015 introduced infinite recursion: the policy's USING clause
-- queried `profiles` from within a policy defined ON `profiles`, which
-- re-triggers RLS evaluation recursively and broke profile reads
-- app-wide (names falling back to "User").
--
-- Fix: read the caller's own company_id through a SECURITY DEFINER function,
-- which bypasses RLS for that internal lookup only.

drop policy if exists "Users can view profiles in their company" on profiles;

create or replace function public.current_user_company_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select new_company_id from profiles where id = auth.uid()
$$;

create policy "Users can view profiles in their company"
  on profiles for select
  using (
    new_company_id is not null
    and new_company_id = public.current_user_company_id()
  );
