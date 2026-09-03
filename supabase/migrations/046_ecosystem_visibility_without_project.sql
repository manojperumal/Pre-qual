-- ============================================================
-- 046: Ecosystem visibility for accepted invitees not yet on a project
-- ============================================================
-- A company invited with no project attached (or not yet added to one of
-- the inviter's own projects) becomes genuinely invisible today: the
-- Trades/GCs pages only list project members, existing ecosystem RLS
-- (018/019) grants visibility purely via shared project membership, and
-- invitations never recorded WHO actually accepted (only recipient_email,
-- which is a placeholder for QR invites and can't be joined back to a
-- profile reliably).

alter table invitations
  add column if not exists accepted_by uuid references profiles(id) on delete set null;

-- An inviter can see the profile of anyone who accepted their invitation,
-- independent of any project relationship.
create policy "Senders can view profiles of accepted invitees"
  on profiles for select
  using (
    id in (
      select accepted_by from invitations
      where sender_id = auth.uid() and accepted_by is not null
    )
  );

-- Same, one level up, so the inviter can also see that company's own row
-- (name, city, state, logo) when rendering the ecosystem roster.
create policy "Senders can view companies of accepted invitees"
  on companies for select
  using (
    id in (
      select p.new_company_id
      from profiles p
      join invitations i on i.accepted_by = p.id
      where i.sender_id = auth.uid() and i.status = 'accepted'
    )
  );
