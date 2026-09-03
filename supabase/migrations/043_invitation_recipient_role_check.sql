-- ============================================================
-- 043: Widen invitations.recipient_role check constraint
-- ============================================================
-- The original constraint (001_initial_schema.sql) only allowed 'gc' or
-- 'trade'. Team-member invites ('gc_member', 'owner_member',
-- 'trade_member') were added later in application code (client + server
-- both validate/accept them) but this constraint was never updated to
-- match — every team-member invite has been silently rejected at the
-- database level since, surfacing to the user as a generic
-- "Failed to create invitation" error.

alter table invitations
  drop constraint if exists invitations_recipient_role_check;

alter table invitations
  add constraint invitations_recipient_role_check
  check (recipient_role in ('gc', 'trade', 'gc_member', 'owner_member', 'trade_member'));
