-- ============================================================
-- 054: Per-question "needs clarification" flag on responses
-- ============================================================
-- Lets a reviewer (Owner/GC) flag an individual answer as needing
-- clarification from the contractor, in addition to the existing
-- questionnaire-level accept / send-back-for-clarification / reject
-- action on questionnaire_assignments.status. The note itself reuses
-- the existing mojo_feedback column.

alter table questionnaire_responses
  add column if not exists needs_clarification boolean not null default false;
