-- ============================================================
-- 030: Mojo review queue for flagged answers
-- ============================================================
-- Mojo review runs informationally alongside the Owner/GC's own
-- approve/reject decision — it never blocks their action. It just gives
-- Mojo Admins their own queue of answers to questions flagged
-- requires_mojo_review (029), independent of who's reviewing the
-- overall submission.

alter table questionnaire_responses
  add column if not exists mojo_reviewed_at timestamptz,
  add column if not exists mojo_reviewed_by uuid references profiles(id);

-- Helper to check is_mojo_admin without the same-table recursion problem
-- (mirrors current_user_company_id() from migration 016).
create or replace function public.current_user_is_mojo_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(is_mojo_admin, false) from profiles where id = auth.uid()
$$;

-- Mojo Admins need direct (non-impersonated) read access to everything
-- the review queue displays, plus write access to mark a response reviewed.
create policy "Mojo admins can view all profiles"
  on profiles for select
  using (public.current_user_is_mojo_admin());

create policy "Mojo admins can view all projects"
  on projects for select
  using (public.current_user_is_mojo_admin());

create policy "Mojo admins can view all questionnaires"
  on questionnaires for select
  using (public.current_user_is_mojo_admin());

create policy "Mojo admins can view all questionnaire assignments"
  on questionnaire_assignments for select
  using (public.current_user_is_mojo_admin());

create policy "Mojo admins can view all questionnaire responses"
  on questionnaire_responses for select
  using (public.current_user_is_mojo_admin());

create policy "Mojo admins can update questionnaire responses"
  on questionnaire_responses for update
  using (public.current_user_is_mojo_admin());
