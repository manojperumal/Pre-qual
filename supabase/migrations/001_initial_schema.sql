-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

-- profiles: linked 1-to-1 with auth.users
create table profiles (
  id uuid references auth.users primary key,
  role text not null check (role in ('owner', 'gc', 'trade')),
  company_name text,
  full_name text,
  email text,
  created_at timestamptz default now()
);

-- prequalifications
create table prequalifications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid references profiles(id),
  requester_id uuid references profiles(id),
  status text default 'draft' check (status in ('draft','submitted','under_review','approved','rejected')),
  -- company info
  company_name text,
  address text,
  years_in_business int,
  trade_type text,
  license_numbers text,
  state text,
  -- insurance
  gl_carrier text,
  gl_policy text,
  gl_limits text,
  gl_expiry date,
  wc_carrier text,
  wc_policy text,
  wc_limits text,
  wc_expiry date,
  umbrella_carrier text,
  umbrella_policy text,
  umbrella_limits text,
  umbrella_expiry date,
  -- safety
  emr_value numeric,
  osha_year1 int,
  osha_year2 int,
  osha_year3 int,
  trir numeric,
  safety_program text,
  -- financial
  annual_revenue numeric,
  bonding_single numeric,
  bonding_aggregate numeric,
  bonding_company text,
  -- meta
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- prequalification_documents
create table prequalification_documents (
  id uuid primary key default gen_random_uuid(),
  prequalification_id uuid references prequalifications(id) on delete cascade,
  doc_type text check (doc_type in ('coi', 'safety', 'financial')),
  file_name text,
  storage_path text,
  uploaded_at timestamptz default now()
);

-- invitations
create table invitations (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references profiles(id),
  recipient_email text not null,
  recipient_role text check (recipient_role in ('gc', 'trade')),
  status text default 'pending' check (status in ('pending','accepted','expired')),
  prequalification_id uuid references prequalifications(id),
  created_at timestamptz default now()
);

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger prequalifications_updated_at
  before update on prequalifications
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'trade')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table prequalifications enable row level security;
alter table prequalification_documents enable row level security;
alter table invitations enable row level security;

-- PROFILES policies
create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- Allow owners and GCs to view profiles of their applicants
create policy "Requesters can view applicant profiles"
  on profiles for select
  using (
    id in (
      select applicant_id from prequalifications
      where requester_id = auth.uid()
    )
  );

-- PREQUALIFICATIONS policies
create policy "Applicants can view their own prequalifications"
  on prequalifications for select
  using (applicant_id = auth.uid());

create policy "Requesters can view prequalifications they requested"
  on prequalifications for select
  using (requester_id = auth.uid());

create policy "Applicants can insert their own prequalifications"
  on prequalifications for insert
  with check (applicant_id = auth.uid());

create policy "Applicants can update draft prequalifications"
  on prequalifications for update
  using (applicant_id = auth.uid() and status in ('draft', 'submitted'));

create policy "Requesters can update status of prequalifications"
  on prequalifications for update
  using (requester_id = auth.uid());

-- PREQUALIFICATION_DOCUMENTS policies
create policy "Access documents via prequalification access"
  on prequalification_documents for select
  using (
    prequalification_id in (
      select id from prequalifications
      where applicant_id = auth.uid() or requester_id = auth.uid()
    )
  );

create policy "Applicants can insert documents"
  on prequalification_documents for insert
  with check (
    prequalification_id in (
      select id from prequalifications
      where applicant_id = auth.uid()
    )
  );

create policy "Applicants can delete their documents"
  on prequalification_documents for delete
  using (
    prequalification_id in (
      select id from prequalifications
      where applicant_id = auth.uid()
    )
  );

-- INVITATIONS policies
create policy "Senders can view their sent invitations"
  on invitations for select
  using (sender_id = auth.uid());

create policy "Recipients can view invitations sent to their email"
  on invitations for select
  using (recipient_email = (select email from profiles where id = auth.uid()));

create policy "Owners and GCs can send invitations"
  on invitations for insert
  with check (
    sender_id = auth.uid() and
    (select role from profiles where id = auth.uid()) in ('owner', 'gc')
  );

create policy "Senders can update their invitations"
  on invitations for update
  using (sender_id = auth.uid());

create policy "Recipients can accept invitations"
  on invitations for update
  using (recipient_email = (select email from profiles where id = auth.uid()));

-- ============================================================
-- STORAGE BUCKETS (run manually in Supabase dashboard or via CLI)
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('prequal-documents', 'prequal-documents', false);
