-- ============================================================
-- 037: AI extraction notes on questions
-- ============================================================
-- Internal guidance for the LLM on where/how to find the answer in
-- uploaded documents (e.g. "Check the EMR value in Section 3 of the Loss
-- Runs report, not the summary page"). Injected into the AI-complete
-- prompt only — never rendered to the respondent, unlike `hint`.

alter table question_bank
  add column if not exists ai_extraction_notes text;
