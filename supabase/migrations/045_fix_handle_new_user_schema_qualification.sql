-- ============================================================
-- 045: Fix unqualified "companies" reference in handle_new_user()
-- ============================================================
-- The trigger (017_fix_is_mojo_admin_flag.sql) inserted into "companies"
-- without schema-qualifying it, while the profiles insert right below it
-- correctly used "public.profiles". A SECURITY DEFINER trigger fired from
-- auth.users doesn't reliably have "public" on its search_path, so any
-- signup that supplies a company name (Owner or GC) failed with
-- "relation \"companies\" does not exist", surfaced to the user as the
-- generic Supabase Auth "Database error saving new user".

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
    insert into public.companies (name, type)
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
$$ language plpgsql security definer set search_path = public;
