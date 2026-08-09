-- ============================================================
-- 031: Mojo Admin visibility into subscriptions
-- ============================================================
-- subscriptions only had a "company members can view their own" policy.
-- A Mojo Admin's own session belongs to no company (new_company_id is
-- null), so it could never see ANY subscription row — meaning the
-- Companies page had no way to confirm "Activate Subscription" actually
-- worked, even though the activation insert itself (done via the
-- service-role backend) succeeded fine.

-- Defined here too (not just 030) in case that migration wasn't run yet —
-- create or replace makes this safe either way.
create or replace function public.current_user_is_mojo_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(is_mojo_admin, false) from profiles where id = auth.uid()
$$;

drop policy if exists "Mojo admins can view all subscriptions" on subscriptions;
create policy "Mojo admins can view all subscriptions"
  on subscriptions for select
  using (public.current_user_is_mojo_admin());
