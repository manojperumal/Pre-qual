-- ============================================================
-- 024: Company logo storage bucket + RLS
-- ============================================================
-- Lets Owners and GCs (and Trades, via the same profile page) upload a
-- logo for their company so the ecosystem feels branded to them —
-- shown on their own dashboard header and in GC/Trades roster rows.

insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', true)
on conflict (id) do nothing;

-- Public read (bucket is public, but keep an explicit policy for clarity)
create policy "Anyone can view company logos"
  on storage.objects for select
  using (bucket_id = 'company-logos');

-- Company admins can upload/replace/delete their own company's logo.
-- Objects are stored at "{company_id}/...", so the first path segment
-- must match the caller's own company.
create policy "Company admins can upload their company logo"
  on storage.objects for insert
  with check (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = (
      select new_company_id::text from profiles where id = auth.uid() and user_role = 'admin'
    )
  );

create policy "Company admins can update their company logo"
  on storage.objects for update
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = (
      select new_company_id::text from profiles where id = auth.uid() and user_role = 'admin'
    )
  );

create policy "Company admins can delete their company logo"
  on storage.objects for delete
  using (
    bucket_id = 'company-logos'
    and (storage.foldername(name))[1] = (
      select new_company_id::text from profiles where id = auth.uid() and user_role = 'admin'
    )
  );
