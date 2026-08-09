-- ============================================================
-- 029: Mojo Review flag on questions
-- ============================================================
-- Some questions need a Mojo Admin to review the answer before the
-- inviting company sees it as final. This is a per-question flag:
--   - Global questions: only a Mojo Admin can enable/disable it.
--   - Company (custom) questions: any admin at the creating company can
--     enable/disable it — mirrors the company-wide sharing already used
--     for questionnaires (020) rather than restricting to the original
--     author.

alter table question_bank
  add column if not exists requires_mojo_review boolean not null default false;

-- Company admins can manage any custom question created by their company
-- (not just their own) — including toggling requires_mojo_review.
create policy "Company admins can manage their company's custom questions"
  on question_bank for all
  using (
    is_global = false
    and created_by in (
      select id from profiles where new_company_id = public.current_user_company_id()
    )
    and exists (select 1 from profiles where id = auth.uid() and user_role = 'admin')
  )
  with check (
    is_global = false
    and created_by in (
      select id from profiles where new_company_id = public.current_user_company_id()
    )
    and exists (select 1 from profiles where id = auth.uid() and user_role = 'admin')
  );

-- Mojo Admins can manage global questions (including this flag).
create policy "Mojo admins can manage global questions"
  on question_bank for all
  using (
    is_global = true
    and (select is_mojo_admin from profiles where id = auth.uid())
  )
  with check (
    is_global = true
    and (select is_mojo_admin from profiles where id = auth.uid())
  );
