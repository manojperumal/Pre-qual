-- ============================================================
-- 051: Company-wide visibility for assigned questionnaires/questions
-- ============================================================
-- questionnaire_assignments got company-wide read access in 026, but the
-- questionnaires and questionnaire_questions tables it points at were never
-- given the equivalent policy — their only assignment-based SELECT access
-- (003) checks assignee_id/assigned_by literally, which stays null until
-- someone actually opens/submits. Any other admin/contributor at the
-- assigned company (the normal case for a fresh company-wide assignment)
-- could see the assignment row itself but not the questionnaire or its
-- questions — the page rendered with zero questions.

create policy "Assigned company members can view the assigned questionnaire"
  on questionnaires for select
  using (
    id in (
      select questionnaire_id from questionnaire_assignments
      where company_id = public.current_user_company_id()
    )
  );

create policy "Assigned company members can view assigned questionnaire questions"
  on questionnaire_questions for select
  using (
    questionnaire_id in (
      select questionnaire_id from questionnaire_assignments
      where company_id = public.current_user_company_id()
    )
  );
