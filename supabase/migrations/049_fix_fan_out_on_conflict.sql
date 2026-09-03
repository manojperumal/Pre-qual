-- ============================================================
-- 049: Fix ON CONFLICT mismatch in questionnaire fan-out triggers
-- ============================================================
-- Both fan-out functions (026_project_and_company_questionnaire_assignments.sql)
-- use "on conflict (questionnaire_id, company_id, coalesce(...), coalesce(...))"
-- targeting the partial unique index questionnaire_assignments_company_unique
-- (which has "where company_id is not null"). Postgres requires a partial
-- index's predicate to be repeated on the ON CONFLICT clause itself for it
-- to be usable as an arbiter — since neither trigger does that, Postgres
-- can't find a matching constraint and every insert into project_members
-- that reaches this trigger fails with "no unique or exclusion constraint
-- matching the ON CONFLICT specification".
--
-- Rewritten to use INSERT ... WHERE NOT EXISTS instead, which doesn't
-- depend on matching any particular index/constraint shape.

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
    and not exists (
      select 1 from questionnaire_assignments qa
      where qa.questionnaire_id = new.questionnaire_id
        and qa.company_id = p.new_company_id
        and coalesce(qa.project_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(new.project_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and coalesce(qa.rule_id, '00000000-0000-0000-0000-000000000000'::uuid) = new.id
    );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

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
    and not exists (
      select 1 from questionnaire_assignments qa
      where qa.questionnaire_id = r.questionnaire_id
        and qa.company_id = v_company_id
        and coalesce(qa.project_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(r.project_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and coalesce(qa.rule_id, '00000000-0000-0000-0000-000000000000'::uuid) = r.id
    );

  return new;
end;
$$ language plpgsql security definer set search_path = public;
