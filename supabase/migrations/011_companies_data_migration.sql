-- ============================================================
-- 011: Migrate existing profiles into companies rows
-- ============================================================

-- Step 1: Create one company per root profile (no company_id = they ARE the company)
insert into companies (id, name, type, created_at)
select
  gen_random_uuid(),
  coalesce(nullif(trim(p.company_name), ''), p.full_name, p.email),
  case p.role
    when 'owner' then 'owner'
    when 'gc'    then 'gc'
    else              'trade'
  end,
  p.created_at
from profiles p
where p.company_id is null;

-- Step 2: Link root profiles to their new company row
update profiles p
set new_company_id = c.id,
    company_type   = p.role,
    user_role      = coalesce(p.member_role, 'admin'),
    is_mojo_admin  = false
from companies c
where c.type = case p.role when 'owner' then 'owner' when 'gc' then 'gc' else 'trade' end
  and c.name = coalesce(nullif(trim(p.company_name), ''), p.full_name, p.email)
  and p.company_id is null
  and p.new_company_id is null;

-- Step 3: Link team member profiles to their owner's company
update profiles p
set new_company_id = owner_profile.new_company_id,
    company_type   = owner_profile.company_type,
    user_role      = coalesce(p.member_role, 'contributor'),
    is_mojo_admin  = false
from profiles owner_profile
where p.company_id = owner_profile.id
  and p.company_id is not null
  and owner_profile.new_company_id is not null;
