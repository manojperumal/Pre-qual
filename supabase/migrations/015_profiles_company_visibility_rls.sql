-- Allow users to view other profiles that belong to the same company.
-- Without this, a GC/Owner/Trade admin cannot see their own team members
-- (e.g. "My Team" list) because RLS only permitted viewing your own profile,
-- project-member profiles, or applicant profiles.

create policy "Users can view profiles in their company"
  on profiles for select
  using (
    new_company_id is not null
    and new_company_id in (
      select new_company_id from profiles where id = auth.uid()
    )
  );
