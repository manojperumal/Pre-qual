-- ============================================================
-- 056: Per-question approve/reject decision on responses
-- ============================================================
-- Lets a reviewer (Owner/GC) approve or reject each individual answer,
-- separate from the existing needs_clarification flag (which just marks
-- "look at this again") and the overall questionnaire-level
-- accept/send-back/reject action on questionnaire_assignments.status.

alter table questionnaire_responses
  add column if not exists review_status text not null default 'pending'
  check (review_status in ('pending', 'approved', 'rejected'));
