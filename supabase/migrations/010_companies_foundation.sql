-- ============================================================
-- 010: Companies table (tenant entity) + company documents
-- ============================================================

-- The real tenant entity. Replaces company_name on profiles.
create table if not exists companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  type       text not null check (type in ('gc', 'trade', 'owner')),
  address    text,
  city       text,
  state      text,
  zip        text,
  phone      text,
  website    text,
  logo_path  text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger companies_updated_at
  before update on companies
  for each row execute procedure update_updated_at_column();

alter table companies enable row level security;

-- Company-level shared documents (Safety Manual, COI, W-9, etc.)
create table if not exists company_documents (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  document_type text not null check (document_type in (
    'safety_manual', 'coi', 'w9', 'loss_runs', 'license', 'other'
  )),
  document_name text not null,
  storage_path  text not null,
  uploaded_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz default now()
);

alter table company_documents enable row level security;

-- Add new columns to profiles — nullable during transition
alter table profiles
  add column if not exists new_company_id uuid references companies(id) on delete set null,
  add column if not exists company_type   text check (company_type in ('owner', 'gc', 'trade')),
  add column if not exists user_role      text not null default 'admin' check (user_role in ('admin', 'contributor')),
  add column if not exists is_mojo_admin  boolean not null default false;
