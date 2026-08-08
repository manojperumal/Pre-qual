-- ============================================================
-- 020: Make questionnaire templates a real company-wide resource
-- ============================================================
-- questionnaires/questionnaire_questions RLS scoped visibility and
-- management to the literal created_by = auth.uid() user. Since
-- QuestionnairesPage describes these as "reusable questionnaire templates"
-- (a company resource, same category as company_documents), any company
-- with more than one admin could end up with templates only their author
-- could ever see or edit — invisible to every other teammate, including
-- other admins.
--
-- Fix: any company member can view the company's questionnaires; any
-- company admin can manage (create/edit/delete) them, mirroring the
-- existing company_documents policy shape (012).

-- QUESTIONNAIRES

create policy "Company members can view their company's questionnaires"
  on questionnaires for select
  using (
    created_by in (
      select id from profiles where new_company_id = public.current_user_company_id()
    )
  );

create policy "Company admins can manage their company's questionnaires"
  on questionnaires for all
  using (
    created_by in (
      select id from profiles where new_company_id = public.current_user_company_id()
    )
    and exists (select 1 from profiles where id = auth.uid() and user_role = 'admin')
  )
  with check (
    created_by in (
      select id from profiles where new_company_id = public.current_user_company_id()
    )
    and exists (select 1 from profiles where id = auth.uid() and user_role = 'admin')
  );

-- QUESTIONNAIRE_QUESTIONS (join table — visibility/management follows the questionnaire)

create policy "Company members can view their company's questionnaire questions"
  on questionnaire_questions for select
  using (
    questionnaire_id in (
      select id from questionnaires
      where created_by in (
        select id from profiles where new_company_id = public.current_user_company_id()
      )
    )
  );

create policy "Company admins can manage their company's questionnaire questions"
  on questionnaire_questions for all
  using (
    questionnaire_id in (
      select id from questionnaires
      where created_by in (
        select id from profiles where new_company_id = public.current_user_company_id()
      )
    )
    and exists (select 1 from profiles where id = auth.uid() and user_role = 'admin')
  )
  with check (
    questionnaire_id in (
      select id from questionnaires
      where created_by in (
        select id from profiles where new_company_id = public.current_user_company_id()
      )
    )
    and exists (select 1 from profiles where id = auth.uid() and user_role = 'admin')
  );
