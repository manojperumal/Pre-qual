-- ============================================================
-- 041: prequal-documents storage bucket + RLS
-- ============================================================
-- The prequal-documents bucket serves two different upload flows sharing
-- one bucket, distinguished by their path shape:
--   1. Project submission documents — "{submission_id}/{doc_type}/{file}"
--      (client/src/pages/ProjectSubmissionPage.tsx)
--   2. Company document library    — "company-docs/{company_id}/{file}"
--      (client/src/hooks/useCompany.ts)
--
-- Unlike company-logos (024), this bucket never got its storage.objects
-- RLS policies committed as a migration — they existed only in the
-- Supabase project directly, so recreating the bucket after it was lost
-- left it with a working bucket but zero storage policies, and every
-- upload was rejected. This migration is the durable fix.

insert into storage.buckets (id, name, public)
values ('prequal-documents', 'prequal-documents', false)
on conflict (id) do nothing;

-- ─── Project submission documents: "{submission_id}/{doc_type}/{file}" ───

create policy "Contractors can upload their own submission documents"
  on storage.objects for insert
  with check (
    bucket_id = 'prequal-documents'
    and exists (
      select 1 from project_submissions ps
      where ps.id::text = (storage.foldername(name))[1]
        and ps.contractor_id = auth.uid()
    )
  );

create policy "Contractors can view their own submission documents"
  on storage.objects for select
  using (
    bucket_id = 'prequal-documents'
    and exists (
      select 1 from project_submissions ps
      where ps.id::text = (storage.foldername(name))[1]
        and ps.contractor_id = auth.uid()
    )
  );

create policy "Project owners can view submission documents on their projects"
  on storage.objects for select
  using (
    bucket_id = 'prequal-documents'
    and exists (
      select 1 from project_submissions ps
      join projects pr on pr.id = ps.project_id
      where ps.id::text = (storage.foldername(name))[1]
        and pr.owner_id = auth.uid()
    )
  );

create policy "GCs can view submission documents on projects they coordinate"
  on storage.objects for select
  using (
    bucket_id = 'prequal-documents'
    and exists (
      select 1 from project_submissions ps
      join project_members pm on pm.project_id = ps.project_id
      where ps.id::text = (storage.foldername(name))[1]
        and pm.user_id = auth.uid()
        and pm.role = 'gc'
    )
  );

-- ─── Company document library: "company-docs/{company_id}/{file}" ───

create policy "Company admins can manage their company documents"
  on storage.objects for all
  using (
    bucket_id = 'prequal-documents'
    and (storage.foldername(name))[1] = 'company-docs'
    and (storage.foldername(name))[2] = (
      select new_company_id::text from profiles where id = auth.uid() and user_role = 'admin'
    )
  )
  with check (
    bucket_id = 'prequal-documents'
    and (storage.foldername(name))[1] = 'company-docs'
    and (storage.foldername(name))[2] = (
      select new_company_id::text from profiles where id = auth.uid() and user_role = 'admin'
    )
  );

create policy "Company members can view their company documents"
  on storage.objects for select
  using (
    bucket_id = 'prequal-documents'
    and (storage.foldername(name))[1] = 'company-docs'
    and (storage.foldername(name))[2] = (
      select new_company_id::text from profiles where id = auth.uid()
    )
  );

-- ─── Mojo admins: full visibility, same as every other table in the app ───

create policy "Mojo admins can view all prequal documents"
  on storage.objects for select
  using (
    bucket_id = 'prequal-documents'
    and (select is_mojo_admin from profiles where id = auth.uid())
  );
