-- ============================================================
-- 025: Project location/address field
-- ============================================================
alter table projects
  add column if not exists address text;
