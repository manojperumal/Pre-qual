-- Add primary contact columns to projects
alter table projects
  add column if not exists gc_primary_contact_id uuid references profiles(id) on delete set null,
  add column if not exists trade_primary_contact_id uuid references profiles(id) on delete set null;
