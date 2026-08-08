-- ============================================================
-- 021: Let project owners/GCs see contractor_profiles for any project
--      member, not only those who already have a project_submissions row
-- ============================================================
-- contractor_profiles RLS previously only granted Owner/GC visibility
-- through an EXISTS join to project_submissions. But project_submissions
-- rows are only created when a contractor clicks "Save Draft" on
-- ProjectSubmissionPage — a contractor who was invited and accepted but
-- hasn't started their submission yet has zero project_submissions rows,
-- so Owner/GC had no RLS path to see whether their contractor profile
-- (company info, insurance, etc.) is even filled out. This is needed to
-- show a real "Profile Incomplete" vs "Not Started" distinction in the
-- GC/Trades list pages instead of treating both the same.
--
-- Additive — membership-based, broader than (and alongside) the existing
-- submission-based policies.

create policy "Project owners can view contractor profiles of members"
  on contractor_profiles for select
  using (
    exists (
      select 1
      from project_members pm
      join projects pr on pr.id = pm.project_id
      where pm.user_id = contractor_profiles.user_id
        and pr.owner_id = auth.uid()
    )
  );

create policy "GCs can view contractor profiles of project co-members"
  on contractor_profiles for select
  using (
    exists (
      select 1
      from project_members pm
      where pm.user_id = contractor_profiles.user_id
        and pm.project_id in (
          select project_id from project_members
          where user_id = auth.uid() and role = 'gc'
        )
    )
  );
