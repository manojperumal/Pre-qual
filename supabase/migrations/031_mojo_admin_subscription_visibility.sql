-- ============================================================
-- 031: Mojo Admin visibility into subscriptions
-- ============================================================
-- subscriptions only had a "company members can view their own" policy.
-- A Mojo Admin's own session belongs to no company (new_company_id is
-- null), so it could never see ANY subscription row — meaning the
-- Companies page had no way to confirm "Activate Subscription" actually
-- worked, even though the activation insert itself (done via the
-- service-role backend) succeeded fine.

create policy "Mojo admins can view all subscriptions"
  on subscriptions for select
  using (public.current_user_is_mojo_admin());
