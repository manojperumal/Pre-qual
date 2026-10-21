-- ============================================================
-- 055: Per-question note threads (audit trail) on questionnaire responses
-- ============================================================
-- A running, append-only thread of notes on a specific question within a
-- specific assignment, so both the contractor and the reviewer (and
-- anyone else on either company) can leave notes back and forth with a
-- visible record of who said what and when. Distinct from the existing
-- single-value company_comments/mojo_feedback fields, which hold just the
-- latest value with no history.

create table if not exists questionnaire_response_notes (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references questionnaire_assignments(id) on delete cascade,
  question_id   uuid not null references question_bank(id) on delete cascade,
  author_id     uuid not null references profiles(id) on delete cascade,
  note          text not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_response_notes_assignment_question
  on questionnaire_response_notes(assignment_id, question_id, created_at);

alter table questionnaire_response_notes enable row level security;

-- Same access shape as questionnaire_responses (026): the assignee's
-- whole company, or whoever assigned it.
create policy "Assignment parties can view response notes"
  on questionnaire_response_notes for select
  using (
    assignment_id in (
      select id from questionnaire_assignments
      where (company_id is not null and company_id = public.current_user_company_id())
         or assigned_by = auth.uid()
    )
  );

create policy "Assignment parties can add response notes"
  on questionnaire_response_notes for insert
  with check (
    author_id = auth.uid()
    and assignment_id in (
      select id from questionnaire_assignments
      where (company_id is not null and company_id = public.current_user_company_id())
         or assigned_by = auth.uid()
    )
  );

create policy "Mojo admins can view all response notes"
  on questionnaire_response_notes for select
  using (public.current_user_is_mojo_admin());
