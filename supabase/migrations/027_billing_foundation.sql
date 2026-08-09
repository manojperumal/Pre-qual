-- ============================================================
-- 027: Billing foundation
-- ============================================================
-- Owner/GC companies choose how invited companies pay for pre-qual
-- processing:
--   'pays_all'       — the inviting company covers everyone they invite.
--   'platform_only'  — invited companies must pay for their own
--                       processing, either per-project or via a
--                       platform-wide annual subscription.
--
-- Mojo is always the payee in both modes — billing_mode only decides
-- WHO gets billed, never where the money settles (no Stripe Connect
-- needed). Payment is required at submission time, not at invite
-- acceptance, so a company can join the ecosystem and fill out their
-- profile for free.

alter table companies
  add column if not exists billing_mode text not null default 'pays_all'
    check (billing_mode in ('pays_all', 'platform_only'));

-- Platform-wide annual subscription — lives on the paying company itself,
-- independent of which inviter's project it's used against.
create table if not exists subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies(id) on delete cascade,
  plan                  text not null default 'annual' check (plan in ('annual')),
  status                text not null default 'active' check (status in ('active', 'past_due', 'canceled')),
  current_period_start  timestamptz not null default now(),
  current_period_end    timestamptz not null,
  stripe_subscription_id text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_subscriptions_company on subscriptions(company_id);

alter table subscriptions enable row level security;

create policy "Company members can view their subscription"
  on subscriptions for select
  using (company_id = public.current_user_company_id());

-- Per-project one-time processing fee. Keyed by (project_id, company_id)
-- rather than a specific submission row, so it isn't tied to the
-- submission's insert/update lifecycle (a company might pay before any
-- draft exists) and one payment covers any resubmission on that project.
create table if not exists project_submission_payments (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references projects(id) on delete cascade,
  company_id              uuid not null references companies(id) on delete cascade,
  amount_cents            integer not null,
  currency                text not null default 'usd',
  status                  text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  stripe_payment_intent_id text,
  created_at              timestamptz not null default now(),
  paid_at                 timestamptz,
  unique (project_id, company_id)
);

create index if not exists idx_submission_payments_company on project_submission_payments(company_id);

alter table project_submission_payments enable row level security;

create policy "Company members can view their submission payments"
  on project_submission_payments for select
  using (company_id = public.current_user_company_id());

create policy "Project owners can view submission payments on their projects"
  on project_submission_payments for select
  using (
    exists (select 1 from projects where id = project_submission_payments.project_id and owner_id = auth.uid())
  );

-- A Trade/GC needs to look up the billing_mode of whoever governs their
-- submission (the project owner or coordinating GC), but existing RLS
-- (018) only grants visibility in the other direction (owner/GC looking
-- down at their ecosystem). Add the reverse: any project member can see
-- the companies row of the project's owner and of any GC coordinating it.
create policy "Project members can view their project's governing companies"
  on companies for select
  using (
    id in (
      select p.new_company_id
      from projects pr
      join profiles p on p.id = pr.owner_id
      where pr.id in (select project_id from project_members where user_id = auth.uid())
    )
    or id in (
      select gc.new_company_id
      from project_members pm
      join profiles gc on gc.id = pm.user_id
      where pm.role = 'gc'
        and pm.project_id in (select project_id from project_members where user_id = auth.uid())
    )
  );

-- ─── Resolve who governs billing for a given contractor on a project ──────
-- If the submitting company IS the project's coordinating GC, billing is
-- governed by the project owner. Otherwise (a Trade), it's governed by the
-- coordinating GC if one exists on the project, else the project owner.
create or replace function governing_billing_company(p_project_id uuid, p_contractor_company_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_contractor_company_id = (
      select gc.new_company_id
      from project_members pm
      join profiles gc on gc.id = pm.user_id
      where pm.project_id = p_project_id and pm.role = 'gc'
      limit 1
    )
    then (select p.new_company_id from projects pr join profiles p on p.id = pr.owner_id where pr.id = p_project_id)
    else coalesce(
      (select gc.new_company_id
       from project_members pm
       join profiles gc on gc.id = pm.user_id
       where pm.project_id = p_project_id and pm.role = 'gc'
       limit 1),
      (select p.new_company_id from projects pr join profiles p on p.id = pr.owner_id where pr.id = p_project_id)
    )
  end
$$;

-- ─── Enforce payment at submission time ────────────────────────────────
create or replace function enforce_submission_payment()
returns trigger as $$
declare
  v_contractor_company uuid;
  v_governing_company uuid;
  v_billing_mode text;
  v_has_subscription boolean;
  v_has_payment boolean;
begin
  select new_company_id into v_contractor_company from profiles where id = new.contractor_id;
  if v_contractor_company is null then
    return new; -- can't determine a company (legacy/edge data) — don't block
  end if;

  v_governing_company := governing_billing_company(new.project_id, v_contractor_company);
  if v_governing_company is null or v_governing_company = v_contractor_company then
    return new; -- no distinct governing company found (e.g. project owner submitting to their own project)
  end if;

  select billing_mode into v_billing_mode from companies where id = v_governing_company;
  if coalesce(v_billing_mode, 'pays_all') = 'pays_all' then
    return new;
  end if;

  select exists(
    select 1 from subscriptions
    where company_id = v_contractor_company and status = 'active' and current_period_end > now()
  ) into v_has_subscription;
  if v_has_subscription then
    return new;
  end if;

  select exists(
    select 1 from project_submission_payments
    where project_id = new.project_id and company_id = v_contractor_company and status = 'paid'
  ) into v_has_payment;
  if not v_has_payment then
    raise exception 'Payment required before this pre-qualification can be submitted' using errcode = 'P0001';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_enforce_submission_payment
  before insert or update of status on project_submissions
  for each row
  when (new.status = 'submitted' and (old.status is null or old.status is distinct from 'submitted'))
  execute procedure enforce_submission_payment();
