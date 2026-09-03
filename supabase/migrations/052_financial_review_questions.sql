-- ============================================================
-- 052: Financial review category + global question bank additions
-- ============================================================
-- "Financial review" didn't exist as a question_bank category — widen the
-- constraint, then seed a standard set of financial pre-qualification
-- questions as global (Mojo-owned) questions, available to add to any
-- questionnaire via the builder. Not auto-linked to any existing
-- questionnaire (e.g. GC-Prequal) — that's a separate, deliberate step.

alter table question_bank
  drop constraint if exists question_bank_category_check;

alter table question_bank
  add constraint question_bank_category_check
  check (category in (
    'company_info', 'insurance', 'safety', 'ptp', 'bonding', 'financial', 'loss_runs', 'compliance'
  ));

insert into question_bank (category, question_text, answer_type, options, hint, is_global, is_required) values
  ('financial', 'What was your company''s total annual revenue for the most recently completed fiscal year (USD)?', 'number', null, 'Report gross revenue, not net income.', true, true),
  ('financial', 'What is your company''s current single-project bonding capacity (USD)?', 'number', null, 'The largest single project your surety will currently bond.', true, true),
  ('financial', 'What is your company''s aggregate (total program) bonding capacity (USD)?', 'number', null, 'The total value of all bonded work your surety will support at one time.', true, true),
  ('financial', 'Can your company provide CPA-reviewed or audited financial statements upon request?', 'radio_yes_no', null, null, true, true),
  ('financial', 'Upload your most recent financial statement (CPA-reviewed or audited, if available).', 'document_upload', null, 'A compiled statement is acceptable if reviewed/audited financials are not available.', true, false),
  ('financial', 'Has your company filed for bankruptcy, reorganization, or received a bankruptcy discharge in the past 7 years?', 'radio_yes_no_comments', null, 'If yes, explain the circumstances and current status.', true, true),
  ('financial', 'Has your company had a surety bond claim filed against it in the past 5 years?', 'radio_yes_no_comments', null, 'If yes, explain the claim and its resolution.', true, true),
  ('financial', 'Does your company have any outstanding liens, judgments, or unresolved disputes related to nonpayment?', 'radio_yes_no_comments', null, 'If yes, provide details including amount and current status.', true, true),
  ('financial', 'Has your company experienced a revenue decline of more than 25% in either of the past two fiscal years?', 'radio_yes_no_comments', null, 'If yes, explain the cause (e.g. lost contract, market conditions, one-time event).', true, true),
  ('financial', 'Provide a bank or financial institution reference (name and contact) for credit verification.', 'text_area', null, null, true, false);
