-- Link GC team members back to their company's primary GC account
alter table profiles
  add column if not exists company_id uuid references profiles(id) on delete set null;

-- Index for fast lookups
create index if not exists profiles_company_id_idx on profiles(company_id);
