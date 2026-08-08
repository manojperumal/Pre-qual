-- ============================================================
-- 019: GC ecosystem visibility for project_members, project_submissions,
--      contractor_profiles, and submission_documents
-- ============================================================
-- Found via a live audit of RLS on tables not tracked in migrations.
--
-- Gap 1: project_members only let a member see their OWN row (or the
-- project owner see everyone). A GC who is a project_member (not the
-- owner) could not see any other member on their own project — breaking
-- the "Assign To" dropdown in AssignQuestionnairePage and any project
-- team roster for GCs.
--
-- Gap 2: project_submissions / contractor_profiles / submission_documents
-- only granted access to the project owner or the contractor themselves.
-- But /gc/projects/:projectId/submissions/:submissionId (SubmissionReviewPage)
-- is a real GC route — GCs are expected to review Trade submissions on
-- projects they coordinate, and had zero RLS path to that data.

-- Helper to avoid infinite recursion when a project_members policy needs
-- to reference project_members itself (mirrors the profiles fix in 016).
create or replace function public.current_user_project_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select project_id from project_members where user_id = auth.uid()
$$;

-- PROJECT_MEMBERS

create policy "Project members can view co-members"
  on project_members for select
  using (project_id in (select public.current_user_project_ids()));

-- PROJECT_SUBMISSIONS

create policy "GCs can view submissions on projects they coordinate"
  on project_submissions for select
  using (
    project_id in (
      select project_id from project_members
      where user_id = auth.uid() and role = 'gc'
    )
  );

create policy "GCs can update submission status on projects they coordinate"
  on project_submissions for update
  using (
    project_id in (
      select project_id from project_members
      where user_id = auth.uid() and role = 'gc'
    )
  );

-- CONTRACTOR_PROFILES

create policy "GCs can view contractor profiles on their projects"
  on contractor_profiles for select
  using (
    exists (
      select 1
      from project_submissions ps
      join project_members pm on pm.project_id = ps.project_id
      where ps.contractor_id = contractor_profiles.user_id
        and pm.user_id = auth.uid()
        and pm.role = 'gc'
    )
  );

-- SUBMISSION_DOCUMENTS

create policy "GCs can view submission docs on their projects"
  on submission_documents for select
  using (
    exists (
      select 1
      from project_submissions ps
      join project_members pm on pm.project_id = ps.project_id
      where ps.id = submission_documents.submission_id
        and pm.user_id = auth.uid()
        and pm.role = 'gc'
    )
  );
