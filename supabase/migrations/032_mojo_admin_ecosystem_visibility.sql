-- ============================================================
-- 032: Mojo Admin visibility into project_members and project_submissions
-- ============================================================
-- The new company detail dashboard reuses useOwnerGCs/useOwnerTrades/
-- useGCTrades to show ecosystem counts (GCs/Trades under a company).
-- Those hooks query project_members and project_submissions directly.
-- Mojo Admin's own session isn't a member of any project, so without
-- these it would silently see zero GCs/Trades for every company.

create policy "Mojo admins can view all project members"
  on project_members for select
  using (public.current_user_is_mojo_admin());

create policy "Mojo admins can view all project submissions"
  on project_submissions for select
  using (public.current_user_is_mojo_admin());
