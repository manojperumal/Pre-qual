-- ============================================================
-- 034: Conditional logic + file-type restrictions on questions
-- ============================================================
-- Conditional logic lives on questionnaire_questions (the join table),
-- not question_bank — a question's "show only if" trigger depends on
-- which other question precedes it in THIS questionnaire, which can
-- differ across questionnaires reusing the same bank question.

alter table questionnaire_questions
  add column if not exists depends_on_question_id uuid references question_bank(id) on delete set null,
  add column if not exists depends_on_value text;

-- File-type restriction is a property of the question itself (only
-- meaningful for answer_type = 'document_upload'). Null/empty = any file
-- type allowed.
alter table question_bank
  add column if not exists allowed_file_types jsonb;
