-- ============================================================
-- 035: Tags + version history for question_bank
-- ============================================================
-- Duplication needs no schema change (it's just another insert), so this
-- migration covers tagging and versioning only.

alter table question_bank
  add column if not exists tags jsonb,
  add column if not exists version integer not null default 1;

-- Snapshot of a question_bank row taken right before an update is applied,
-- so editors can see what a question used to say and when it changed.
create table if not exists question_bank_versions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references question_bank(id) on delete cascade,
  version integer not null,
  question_text text not null,
  category text not null,
  answer_type text not null,
  options jsonb,
  hint text,
  allowed_file_types jsonb,
  tags jsonb,
  changed_by uuid references profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

alter table question_bank_versions enable row level security;

-- Readable by anyone who can read the current question_bank row.
create policy "Version history readable with question"
  on question_bank_versions for select
  using (question_id in (select id from question_bank));

-- Company admins can log history for their own company's custom questions.
create policy "Company admins can log custom question history"
  on question_bank_versions for insert
  with check (
    question_id in (
      select qb.id from question_bank qb
      where qb.is_global = false
        and qb.created_by in (
          select id from profiles where new_company_id = public.current_user_company_id()
        )
    )
    and exists (select 1 from profiles where id = auth.uid() and user_role = 'admin')
  );

-- Mojo Admins can log history for global questions.
create policy "Mojo admins can log global question history"
  on question_bank_versions for insert
  with check (
    question_id in (select id from question_bank where is_global = true)
    and (select is_mojo_admin from profiles where id = auth.uid())
  );
