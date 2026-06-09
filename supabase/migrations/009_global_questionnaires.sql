-- Add is_global flag to questionnaires
alter table questionnaires
  add column if not exists is_global boolean not null default false;

-- Allow all authenticated users to see global questionnaires
drop policy if exists "Users can view own questionnaires" on questionnaires;
create policy "Users can view own or global questionnaires"
  on questionnaires for select
  using (created_by = auth.uid() or is_global = true);

-- Create the GC-Prequal system questionnaire
insert into questionnaires (id, created_by, name, description, is_template, is_global)
values (
  gen_random_uuid(),
  null,
  'GC-Prequal',
  'Standard General Contractor pre-qualification covering safety program coverage across all major hazard categories.',
  true,
  true
);

-- Link all 78 safety program coverage questions to GC-Prequal
insert into questionnaire_questions (questionnaire_id, question_id, order_index, is_required)
select
  (select id from questionnaires where name = 'GC-Prequal' and is_global = true limit 1),
  qb.id,
  row_number() over (order by qb.created_at) - 1,
  false
from question_bank qb
where qb.category = 'safety'
  and qb.is_global = true
  and qb.question_text like 'Does your safety program handle%'
order by qb.created_at;
