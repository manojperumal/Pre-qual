-- Add radio_yes_no_comments answer type
alter table question_bank drop constraint if exists question_bank_answer_type_check;
alter table question_bank add constraint question_bank_answer_type_check
  check (answer_type in (
    'radio_yes_no', 'radio_yes_no_comments', 'multi_select', 'document_upload', 'text_area', 'number'
  ));

-- Add per-question comment columns to responses
alter table questionnaire_responses
  add column if not exists company_comments text,
  add column if not exists mojo_feedback text;

-- Update the 78 safety program coverage questions to the new type
update question_bank
set answer_type = 'radio_yes_no_comments'
where category = 'safety'
  and is_global = true
  and question_text like 'Does your safety program handle%';
