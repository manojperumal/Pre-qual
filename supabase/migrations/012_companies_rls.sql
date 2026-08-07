-- ============================================================
-- 012: RLS policies for companies and company_documents
-- ============================================================

-- COMPANIES

create policy "Company members can view their company"
  on companies for select
  using (
    id in (select new_company_id from profiles where id = auth.uid())
  );

create policy "Company admins can update their company"
  on companies for update
  using (
    id in (
      select new_company_id from profiles
      where id = auth.uid() and user_role = 'admin'
    )
  );

create policy "Mojo admins have full company access"
  on companies for all
  using (
    (select is_mojo_admin from profiles where id = auth.uid())
  );

create policy "GCs can view trade companies on their assignments"
  on companies for select
  using (
    id in (
      select p.new_company_id
      from profiles p
      join questionnaire_assignments qa on qa.assignee_id = p.id
      where qa.assigned_by in (
        select id from profiles where new_company_id in (
          select new_company_id from profiles where id = auth.uid()
        )
      )
    )
  );

-- COMPANY DOCUMENTS

create policy "Company members can view company documents"
  on company_documents for select
  using (
    company_id in (select new_company_id from profiles where id = auth.uid())
  );

create policy "Company admins can manage company documents"
  on company_documents for all
  using (
    company_id in (
      select new_company_id from profiles
      where id = auth.uid() and user_role = 'admin'
    )
  );

create policy "Mojo admins can view all company documents"
  on company_documents for select
  using (
    (select is_mojo_admin from profiles where id = auth.uid())
  );

create policy "GCs can view documents of assigned trades"
  on company_documents for select
  using (
    company_id in (
      select p.new_company_id
      from profiles p
      join questionnaire_assignments qa on qa.assignee_id = p.id
      where qa.assigned_by in (
        select id from profiles where new_company_id in (
          select new_company_id from profiles where id = auth.uid()
        )
      )
    )
  );
