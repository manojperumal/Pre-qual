-- ============================================================
-- 026: Project-wide and company-wide questionnaire assignments
-- ============================================================
-- Previously an assignment always targeted one specific person on one
-- specific project. This adds two new ways to assign a questionnaire:
--
--   1. "Whole project" — every company currently on the project (and any
--      company added later) must complete it. Modeled as a *rule* that
--      fans out into one shared instance per company via triggers.
--   2. "Specific companies" — assign directly to one or more companies,
--      either tied to one project or, if project_id is left null,
--      standing across every project you share with that company.
--
-- An assignment now targets a COMPANY, not a person — any admin or
-- contributor at that company can open and complete it (same sharing
-- model already used for company_documents and questionnaire templates).
-- Whoever actually submits is still recorded via assignee_id, for audit.
--
-- Case 3 (a company owes both a project-wide and a company-specific
-- questionnaire) falls out naturally: they're two independent instance
-- rows. "Exempt" is an explicit, auditable action (is_exempt flag) on
-- the specific rule-derived instance, not a silent deletion.

-- The rule: "questionnaire X applies to every company on project P"
create table if not exists questionnaire_assignment_rules (
  id               uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references questionnaires(id) on delete cascade,
  project_id       uuid not null references projects(id) on delete cascade,
  assigned_by      uuid not null references profiles(id),
  due_date         date,
  created_at       timestamptz not null default now()
);

alter table questionnaire_assignment_rules enable row level security;

create policy "Owners and GCs can create assignment rules"
  on questionnaire_assignment_rules for insert
  with check (
    assigned_by = auth.uid()
    and (select role from profiles where id = auth.uid()) in ('owner', 'gc')
  );

create policy "Creators can manage their assignment rules"
  on questionnaire_assignment_rules for all
  using (assigned_by = auth.uid());

-- Extend assignments (the actual work item) to support a company target
alter table questionnaire_assignments
  add column if not exists company_id uuid references companies(id) on delete cascade,
  add column if not exists rule_id uuid references questionnaire_assignment_rules(id) on delete cascade,
  add column if not exists is_exempt boolean not null default false;

-- Prevent duplicate instances for the same questionnaire+company+project+rule.
-- COALESCE-to-a-sentinel lets two NULLs (e.g. two ecosystem-wide direct
-- assignments with no project) still collide correctly.
create unique index if not exists questionnaire_assignments_company_unique
  on questionnaire_assignments (
    questionnaire_id,
    company_id,
    coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(rule_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where company_id is not null;

-- ─── Fan-out triggers ───────────────────────────────────────────────────

-- When a project-wide rule is created, generate one instance per company
-- currently on the project (excluding the rule creator's own company).
create or replace function fan_out_questionnaire_rule()
returns trigger as $$
begin
  insert into questionnaire_assignments (
    questionnaire_id, project_id, company_id, rule_id, assigned_by, due_date, status
  )
  select distinct
    new.questionnaire_id, new.project_id, p.new_company_id, new.id, new.assigned_by, new.due_date, 'pending'
  from project_members pm
  join profiles p on p.id = pm.user_id
  where pm.project_id = new.project_id
    and p.new_company_id is not null
    and p.new_company_id <> coalesce((select new_company_id from profiles where id = new.assigned_by), '00000000-0000-0000-0000-000000000000'::uuid)
  on conflict (questionnaire_id, company_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(rule_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_fan_out_questionnaire_rule
  after insert on questionnaire_assignment_rules
  for each row execute procedure fan_out_questionnaire_rule();

-- When a company joins a project after a rule already exists, catch them up.
create or replace function fan_out_new_project_member()
returns trigger as $$
declare
  v_company_id uuid;
begin
  select new_company_id into v_company_id from profiles where id = new.user_id;
  if v_company_id is null then
    return new;
  end if;

  insert into questionnaire_assignments (
    questionnaire_id, project_id, company_id, rule_id, assigned_by, due_date, status
  )
  select
    r.questionnaire_id, r.project_id, v_company_id, r.id, r.assigned_by, r.due_date, 'pending'
  from questionnaire_assignment_rules r
  where r.project_id = new.project_id
    and v_company_id <> coalesce((select new_company_id from profiles where id = r.assigned_by), '00000000-0000-0000-0000-000000000000'::uuid)
  on conflict (questionnaire_id, company_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(rule_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do nothing;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_fan_out_new_project_member
  after insert on project_members
  for each row execute procedure fan_out_new_project_member();

-- ─── RLS: company-shared access to assignments + responses ─────────────

create policy "Company members can view their company's assignments"
  on questionnaire_assignments for select
  using (company_id is not null and company_id = public.current_user_company_id());

create policy "Company members can update their company's assignments"
  on questionnaire_assignments for update
  using (company_id is not null and company_id = public.current_user_company_id());

create policy "Company members can manage responses for their company's assignments"
  on questionnaire_responses for all
  using (
    assignment_id in (
      select id from questionnaire_assignments
      where company_id is not null and company_id = public.current_user_company_id()
    )
  );
