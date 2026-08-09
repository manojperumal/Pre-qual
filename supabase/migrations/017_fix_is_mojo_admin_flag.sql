-- ============================================================
-- 017: Fix critical cross-tenant data leak via is_mojo_admin
-- ============================================================
-- Migrations 011 and 013 set is_mojo_admin = true for every customer
-- who signs up with role = 'owner'. But RLS policies (012) treat
-- is_mojo_admin as an internal Mojo-staff superadmin flag that bypasses
-- tenant isolation entirely:
--   "Mojo admins have full company access"        on companies for all
--   "Mojo admins can view all company documents"  on company_documents
--
-- That means every Owner-type customer currently has full read/write
-- access to every other company's companies row and shared documents —
-- a cross-tenant data leak. "Owner" (a paying customer persona that
-- pre-qualifies GCs/Trades) is not the same thing as "Mojo admin"
-- (Mojo's own internal staff account). Fix both the trigger and the data.

-- 1) Correct existing data: no signup flow has ever legitimately produced
--    a real Mojo-staff account, so every current true is a bug.
update profiles set is_mojo_admin = false where is_mojo_admin = true;

-- 2) Fix the trigger so future signups never set this automatically.
--    is_mojo_admin must only ever be flipped manually for real Mojo staff.
create or replace function handle_new_user()
returns trigger as $$
declare
  v_role         text;
  v_company_name text;
  v_company_id   uuid;
  v_company_type text;
begin
  v_role         := coalesce(new.raw_user_meta_data->>'role', 'trade');
  v_company_name := coalesce(nullif(trim(new.raw_user_meta_data->>'company_name'), ''), null);
  v_company_type := case v_role when 'owner' then 'owner' when 'gc' then 'gc' else 'trade' end;

  if v_company_name is not null then
    insert into companies (name, type)
    values (v_company_name, v_company_type)
    returning id into v_company_id;
  end if;

  insert into public.profiles (
    id, email, full_name,
    role,
    company_type,
    user_role,
    is_mojo_admin,
    new_company_id
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    v_role,
    v_company_type,
    'admin',
    false,
    v_company_id
  );

  return new;
end;
$$ language plpgsql security definer;
