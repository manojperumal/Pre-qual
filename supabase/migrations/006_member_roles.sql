-- Add member_role to profiles (admin = full company access, contributor = assigned projects only)
alter table profiles
  add column if not exists member_role text not null default 'admin'
  check (member_role in ('admin', 'contributor'));
