-- ============================================================
-- 036: Mojo Review note + respondent-visible flag
-- ============================================================
-- Lets the person enabling "Mojo Review" on a question explain why, so the
-- Mojo reviewer sees the context in the review queue instead of just a
-- flag. No new visibility rule needed for the "show it to the respondent
-- before they answer" ask — the client already has access to
-- requires_mojo_review on every question it renders; this migration only
-- adds the note field it will display alongside that.

alter table question_bank
  add column if not exists mojo_review_note text;
