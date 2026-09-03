-- ============================================================
-- 048: Let a project's owner add themselves as a project_member
-- ============================================================
-- project_members has never had a tracked INSERT policy — the only place
-- rows were ever reliably created was the invitation-accept server route,
-- which uses the service-role client and bypasses RLS entirely. But
-- useCreateProject/useBulkCreateProjects (client/src/hooks/useProjects.ts)
-- also insert a project_members row for the creator, running as the
-- authenticated user — which RLS has been silently rejecting (with no
-- error surfaced, since the insert result was never checked) since
-- project creation went client-side.
--
-- This never showed up for Owners, whose own project lists are keyed off
-- projects.owner_id, not project_members. It surfaced once GCs could own
-- projects too: a GC's "Attach to Project" picker (useMyProjects, which
-- IS project_members-based) showed nothing for projects that GC had just
-- created, because they were never actually recorded as a member of them.

create policy "Project owners can add themselves as a member"
  on project_members for insert
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and exists (select 1 from projects where id = project_id and owner_id = auth.uid())
  );

-- Backfill: every existing project whose owner never got a project_members
-- row because of the missing policy above.
insert into project_members (project_id, user_id, role)
select p.id, p.owner_id, 'owner'
from projects p
where not exists (
  select 1 from project_members pm where pm.project_id = p.id and pm.user_id = p.owner_id
);
