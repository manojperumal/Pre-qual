-- ============================================================
-- 028: Stripe customer per company
-- ============================================================
alter table companies
  add column if not exists stripe_customer_id text;
