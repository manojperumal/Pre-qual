-- ============================================================
-- 038: QuickBooks billing (replaces Stripe)
-- ============================================================
-- Pre-Qual connects ONE QuickBooks Online company (via OAuth) to process
-- payments for all companies on the platform — mirrors how a single
-- Stripe account served every customer before. quickbooks_connection
-- holds that single connection's tokens; service-role only (no RLS
-- policies grant any row to end users, so it's invisible via the
-- client, only reachable through supabaseAdmin on the server).
create table if not exists quickbooks_connection (
  id                        text primary key default 'default',
  environment               text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  realm_id                  text not null,
  access_token              text not null,
  access_token_expires_at   timestamptz not null,
  refresh_token             text not null,
  refresh_token_expires_at  timestamptz not null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

alter table quickbooks_connection enable row level security;
-- Intentionally no policies — only supabaseAdmin (service role) can read/write this table.

alter table companies
  add column if not exists quickbooks_customer_id text;

alter table project_submission_payments
  add column if not exists quickbooks_payment_id text;

alter table subscriptions
  add column if not exists quickbooks_recurring_id text;
