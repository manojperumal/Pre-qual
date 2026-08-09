-- ============================================================
-- 033: Let the inviter choose the new team member's role up front
-- ============================================================
-- Team-member invites always hardcoded the new user to 'contributor',
-- requiring a separate trip to My Team to promote them to admin
-- afterward. Let the inviter pick Admin vs Contributor at invite time.

alter table invitations
  add column if not exists intended_user_role text
    check (intended_user_role in ('admin', 'contributor'))
    default 'contributor';
