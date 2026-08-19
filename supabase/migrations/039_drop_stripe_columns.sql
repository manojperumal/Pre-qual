-- ============================================================
-- 039: Drop leftover Stripe columns
-- ============================================================
-- Billing has fully moved to QuickBooks (038_quickbooks_billing.sql).
-- These columns have been unused in application code since the Stripe
-- checkout/webhook routes were removed — dropping them so the schema only
-- reflects the current payment processor.

alter table companies
  drop column if exists stripe_customer_id;

alter table subscriptions
  drop column if exists stripe_subscription_id;

alter table project_submission_payments
  drop column if exists stripe_payment_intent_id;
