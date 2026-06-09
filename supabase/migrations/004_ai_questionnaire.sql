-- Add AI-related columns to questionnaire_responses
alter table questionnaire_responses add column if not exists mojo_feedback text;
alter table questionnaire_responses add column if not exists ai_suggested boolean default false;
alter table questionnaire_responses add column if not exists company_comments text;

-- Contractor documents table for AI-powered completion
create table if not exists contractor_documents (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references questionnaire_assignments(id) on delete cascade,
  uploaded_by uuid references profiles(id),
  document_type text not null check (document_type in (
    'safety_manual', 'osha_log', 'coi', 'loss_runs', 'other'
  )),
  document_name text not null,
  storage_path text not null,
  created_at timestamptz default now()
);

alter table contractor_documents enable row level security;

create policy "Assignee can manage their contractor documents"
  on contractor_documents for all
  using (
    uploaded_by = auth.uid() or
    assignment_id in (
      select id from questionnaire_assignments where assigned_by = auth.uid()
    )
  );
