-- ============================================================
-- 023: Multi-project invitations + recipient company name capture
-- ============================================================
-- Trade/GC invitations previously supported attaching exactly one project
-- (invitations.project_id). Owners and GCs need to be able to attach an
-- invite to several projects at once, or none (added to the ecosystem now,
-- connected to projects later). Also captures the trade/company name the
-- inviter enters, so the invite shows "Acme Electrical" rather than just
-- an email address, and pre-fills that name (editable) on signup.

alter table invitations
  add column if not exists recipient_company_name text;

create table if not exists invitation_projects (
  invitation_id uuid not null references invitations(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  primary key (invitation_id, project_id)
);

alter table invitation_projects enable row level security;

create policy "Senders can view their invitation projects"
  on invitation_projects for select
  using (
    invitation_id in (select id from invitations where sender_id = auth.uid())
  );

create policy "Senders can manage their invitation projects"
  on invitation_projects for all
  using (
    invitation_id in (select id from invitations where sender_id = auth.uid())
  );
