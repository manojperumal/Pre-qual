-- ============================================================
-- 014: Cleanup — drop legacy columns and rename new ones
-- RUN THIS ONLY after all backend + frontend code is deployed
-- and verified working against the new columns.
-- ============================================================

alter table profiles drop column if exists company_id;     -- old: references profiles(id)
alter table profiles rename column new_company_id to company_id;

alter table profiles drop column if exists company_name;   -- moved to companies.name
alter table profiles drop column if exists member_role;    -- replaced by user_role

-- Optionally drop old role column once company_type is fully adopted:
-- alter table profiles drop column if exists role;
