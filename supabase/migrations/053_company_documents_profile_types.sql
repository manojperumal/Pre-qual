-- ============================================================
-- 053: Let company_documents hold Organization profile attachments
-- ============================================================
-- The Organization profile (Insurance/Safety/PTP/Bonding steps) now lets
-- admins attach the backing files for those sections (COI, safety manual,
-- PTP plan, bonding document) directly from the profile, instead of only
-- via the separate Document Library page. They're stored in the same
-- company_documents table/bucket so questionnaire AI-complete already
-- picks them up — this just adds the two document_type values that didn't
-- exist yet ('coi' and 'safety_manual' already did).

alter table company_documents
  drop constraint if exists company_documents_document_type_check;

alter table company_documents
  add constraint company_documents_document_type_check
  check (document_type in ('safety_manual', 'coi', 'w9', 'loss_runs', 'license', 'sop', 'ptp_plan', 'bond', 'other'));
