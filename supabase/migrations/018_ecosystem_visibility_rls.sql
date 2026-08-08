-- ============================================================
-- 018: Ecosystem-scoped visibility for companies + company_documents
-- ============================================================
-- Model: Owners and GCs are paying customers who invite Trades (and GCs,
-- in the Owner's case) into their project ecosystem. Visibility of a
-- contractor's company profile and shared documents should follow that
-- ecosystem — i.e. whoever owns the project (or is the GC coordinating
-- Trades on it) should be able to see the companies and documents of
-- everyone participating on it, regardless of who originally sent the
-- invite (Owner -> GC -> Trade chains included, since this is scoped by
-- project membership, not by invite chain).
--
-- Prior to this migration, the only cross-company visibility was
-- "GCs can view trade companies on their assignments" (012), which is
-- narrowly scoped to questionnaire_assignments. Owners had no RLS path
-- at all to a GC's or Trade's companies/company_documents rows, even for
-- contractors actively on their own projects — useOwnerGCs/useOwnerTrades
-- were silently falling back to the legacy company_name text field.

-- COMPANIES

create policy "Project owners can view ecosystem companies"
  on companies for select
  using (
    id in (
      select p.new_company_id
      from profiles p
      join project_members pm on pm.user_id = p.id
      join projects pr on pr.id = pm.project_id
      where pr.owner_id = auth.uid()
    )
  );

create policy "GCs can view trade companies on shared projects"
  on companies for select
  using (
    id in (
      select p.new_company_id
      from profiles p
      join project_members pm on pm.user_id = p.id
      where pm.role = 'trade'
        and pm.project_id in (
          select project_id from project_members
          where user_id = auth.uid() and role = 'gc'
        )
    )
  );

-- COMPANY DOCUMENTS

create policy "Project owners can view ecosystem company documents"
  on company_documents for select
  using (
    company_id in (
      select p.new_company_id
      from profiles p
      join project_members pm on pm.user_id = p.id
      join projects pr on pr.id = pm.project_id
      where pr.owner_id = auth.uid()
    )
  );

create policy "GCs can view trade documents on shared projects"
  on company_documents for select
  using (
    company_id in (
      select p.new_company_id
      from profiles p
      join project_members pm on pm.user_id = p.id
      where pm.role = 'trade'
        and pm.project_id in (
          select project_id from project_members
          where user_id = auth.uid() and role = 'gc'
        )
    )
  );
