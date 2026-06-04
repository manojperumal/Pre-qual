-- ============================================================
-- QUESTIONNAIRE SYSTEM
-- ============================================================

-- Question bank (global + per-client custom questions)
create table question_bank (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references profiles(id) on delete set null,
  category text not null check (category in (
    'company_info', 'insurance', 'safety', 'ptp', 'bonding', 'loss_runs', 'compliance'
  )),
  question_text text not null,
  answer_type text not null check (answer_type in (
    'radio_yes_no', 'multi_select', 'document_upload', 'text_area', 'number'
  )),
  options jsonb,        -- array of strings for multi_select
  hint text,            -- helper text shown below the question
  is_global boolean default false,  -- system questions visible to all
  is_required boolean default true,
  created_at timestamptz default now()
);

-- Questionnaire templates
create table questionnaires (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references profiles(id) on delete cascade,
  name text not null,
  description text,
  is_template boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ordered questions inside a questionnaire
create table questionnaire_questions (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid references questionnaires(id) on delete cascade,
  question_id uuid references question_bank(id) on delete cascade,
  order_index int not null default 0,
  is_required boolean default true,
  unique(questionnaire_id, question_id)
);

-- Assigning a questionnaire to a contractor on a project
create table questionnaire_assignments (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid references questionnaires(id),
  project_id uuid references projects(id) on delete cascade,
  assignee_id uuid references profiles(id),
  assigned_by uuid references profiles(id),
  due_date date,
  status text default 'pending' check (status in (
    'pending', 'in_progress', 'submitted', 'approved', 'rejected', 'needs_more_info'
  )),
  reviewer_notes text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(questionnaire_id, project_id, assignee_id)
);

-- Contractor answers per question per assignment
create table questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references questionnaire_assignments(id) on delete cascade,
  question_id uuid references question_bank(id),
  answer_text text,       -- radio_yes_no, text_area, number
  answer_options jsonb,   -- multi_select: ["A","B"]
  document_path text,     -- document_upload storage path
  document_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(assignment_id, question_id)
);

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================

create trigger questionnaires_updated_at
  before update on questionnaires
  for each row execute procedure update_updated_at_column();

create trigger questionnaire_assignments_updated_at
  before update on questionnaire_assignments
  for each row execute procedure update_updated_at_column();

create trigger questionnaire_responses_updated_at
  before update on questionnaire_responses
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table question_bank enable row level security;
alter table questionnaires enable row level security;
alter table questionnaire_questions enable row level security;
alter table questionnaire_assignments enable row level security;
alter table questionnaire_responses enable row level security;

-- question_bank: global visible to all auth users; custom visible to creator
create policy "Anyone can view global questions"
  on question_bank for select
  using (is_global = true or created_by = auth.uid());

create policy "Owners and GCs can insert questions"
  on question_bank for insert
  with check (
    created_by = auth.uid() and
    (select role from profiles where id = auth.uid()) in ('owner', 'gc')
  );

create policy "Creators can update their questions"
  on question_bank for update
  using (created_by = auth.uid());

create policy "Creators can delete their questions"
  on question_bank for delete
  using (created_by = auth.uid());

-- questionnaires: creator + members of assigned projects
create policy "Creators can manage their questionnaires"
  on questionnaires for all
  using (created_by = auth.uid());

create policy "Project members can view assigned questionnaires"
  on questionnaires for select
  using (
    id in (
      select questionnaire_id from questionnaire_assignments
      where assignee_id = auth.uid()
         or assigned_by = auth.uid()
    )
  );

-- questionnaire_questions: readable if questionnaire is readable
create policy "Questionnaire questions readable with questionnaire"
  on questionnaire_questions for select
  using (
    questionnaire_id in (
      select id from questionnaires where created_by = auth.uid()
      union
      select questionnaire_id from questionnaire_assignments
      where assignee_id = auth.uid() or assigned_by = auth.uid()
    )
  );

create policy "Creators can manage questionnaire questions"
  on questionnaire_questions for all
  using (
    questionnaire_id in (select id from questionnaires where created_by = auth.uid())
  );

-- questionnaire_assignments
create policy "Assigned-by or assignee can view assignments"
  on questionnaire_assignments for select
  using (assigned_by = auth.uid() or assignee_id = auth.uid());

create policy "Owners and GCs can create assignments"
  on questionnaire_assignments for insert
  with check (
    assigned_by = auth.uid() and
    (select role from profiles where id = auth.uid()) in ('owner', 'gc')
  );

create policy "Assigned-by can update assignment status"
  on questionnaire_assignments for update
  using (assigned_by = auth.uid() or assignee_id = auth.uid());

-- questionnaire_responses
create policy "Assignee can manage their responses"
  on questionnaire_responses for all
  using (
    assignment_id in (
      select id from questionnaire_assignments where assignee_id = auth.uid()
    )
  );

create policy "Reviewer can view responses"
  on questionnaire_responses for select
  using (
    assignment_id in (
      select id from questionnaire_assignments where assigned_by = auth.uid()
    )
  );

-- ============================================================
-- SEED: 30 GLOBAL QUESTIONS
-- ============================================================

insert into question_bank (category, question_text, answer_type, options, hint, is_global, is_required) values

-- Company Info (5)
('company_info', 'How many years has your company been in business?', 'number', null, 'Enter the number of years since company founding.', true, true),
('company_info', 'What is your primary trade type or specialty?', 'text_area', null, 'e.g. Electrical, Plumbing, Concrete, Framing, HVAC', true, true),
('company_info', 'How many full-time employees does your company employ?', 'number', null, null, true, true),
('company_info', 'Is your company currently licensed in all states where you are performing work?', 'radio_yes_no', null, null, true, true),
('company_info', 'What trade licenses does your company hold? List license numbers and issuing states.', 'text_area', null, null, true, false),

-- Insurance (6)
('insurance', 'Do you carry General Liability (GL) insurance?', 'radio_yes_no', null, null, true, true),
('insurance', 'Upload your General Liability Certificate of Insurance (COI)', 'document_upload', null, 'Must show policy number, limits, and expiration date.', true, true),
('insurance', 'Do you carry Workers'' Compensation (WC) insurance?', 'radio_yes_no', null, null, true, true),
('insurance', 'Upload your Workers'' Compensation Certificate of Insurance', 'document_upload', null, 'Must show policy number, limits, and expiration date.', true, true),
('insurance', 'Do you carry Umbrella / Excess Liability insurance?', 'radio_yes_no', null, null, true, false),
('insurance', 'What are your General Liability coverage limits?', 'multi_select', '["$1M/$2M", "$2M/$4M", "$5M/$10M", "Other"]', null, true, true),

-- Safety (8)
('safety', 'What is your current Experience Modification Rate (EMR)?', 'number', null, 'Must be 1.0 or below for most projects.', true, true),
('safety', 'What is your Total Recordable Incident Rate (TRIR) for the past 3 years?', 'number', null, null, true, true),
('safety', 'What is your DART rate (Days Away, Restricted, or Transfer) for the past 3 years?', 'number', null, null, true, false),
('safety', 'Upload your OSHA 300 Log for the past 3 years', 'document_upload', null, 'All three years required.', true, true),
('safety', 'Upload your OSHA 301 Incident Reports for the past 3 years', 'document_upload', null, null, true, false),
('safety', 'Have you received any OSHA citations in the past 3 years?', 'radio_yes_no', null, null, true, true),
('safety', 'If yes to OSHA citations, describe each citation and corrective actions taken.', 'text_area', null, null, true, false),
('safety', 'Do you have a written company safety program?', 'radio_yes_no', null, null, true, true),

-- PTP (4)
('ptp', 'Does your company have a Pre-Task Planning (PTP) program?', 'radio_yes_no', null, 'PTP is also known as Job Hazard Analysis (JHA) or Task Hazard Analysis (THA).', true, true),
('ptp', 'Describe your Pre-Task Planning process.', 'text_area', null, 'Explain how foremen conduct PTPs, frequency, and documentation.', true, false),
('ptp', 'How frequently do your foremen conduct Pre-Task Planning?', 'multi_select', '["Before every task", "Daily", "Weekly", "Only for high-risk tasks", "Other"]', null, true, true),
('ptp', 'Upload sample completed PTP forms from at least 3 different foremen over the past 2 weeks.', 'document_upload', null, 'At least 3 unique foremen required.', true, false),

-- Bonding (3)
('bonding', 'Is your company currently bonded?', 'radio_yes_no', null, null, true, true),
('bonding', 'What is your single project bonding capacity (in USD)?', 'number', null, 'Enter amount without commas or $ sign.', true, false),
('bonding', 'What is your aggregate bonding capacity (in USD)?', 'number', null, 'Enter amount without commas or $ sign.', true, false),

-- Loss Runs (2)
('loss_runs', 'Upload 5-year loss runs from your insurance carrier(s)', 'document_upload', null, 'Loss runs must be dated within 90 days and signed by your broker or carrier.', true, true),
('loss_runs', 'Have you had any individual claims exceeding $100,000 in the past 5 years?', 'radio_yes_no', null, null, true, true),

-- Compliance (2)
('compliance', 'Is your company in compliance with all applicable federal, state, and local labor laws?', 'radio_yes_no', null, 'Including but not limited to OSHA, FLSA, and state wage laws.', true, true),
('compliance', 'Do you utilize subcontractors? If so, do you require them to complete pre-qualification before working on your projects?', 'radio_yes_no', null, null, true, false);
