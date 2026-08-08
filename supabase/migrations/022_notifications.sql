-- ============================================================
-- 022: Notifications — table, RLS, and event triggers
-- ============================================================

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  link       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_created on notifications(user_id, created_at desc);
create index if not exists idx_notifications_user_unread on notifications(user_id) where is_read = false;

alter table notifications enable row level security;

create policy "Users can view own notifications"
  on notifications for select
  using (user_id = auth.uid());

create policy "Users can update own notifications"
  on notifications for update
  using (user_id = auth.uid());

create policy "Users can delete own notifications"
  on notifications for delete
  using (user_id = auth.uid());

-- Helper: base route for a profile, by effective role
create or replace function public.profile_base_path(p_profile_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case coalesce(company_type, role)
    when 'owner' then '/owner'
    when 'gc' then '/gc'
    else '/trade'
  end
  from profiles where id = p_profile_id
$$;

-- ─── Invitation accepted -> notify sender ──────────────────────────────────

create or replace function notify_invitation_accepted()
returns trigger as $$
declare
  v_recipient_name text;
  v_base text;
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    select coalesce(full_name, email) into v_recipient_name
      from profiles where email = new.recipient_email limit 1;
    v_base := public.profile_base_path(new.sender_id);

    insert into notifications (user_id, type, title, body, link)
    values (
      new.sender_id,
      'invitation_accepted',
      'Invitation accepted',
      coalesce(v_recipient_name, new.recipient_email) || ' accepted your invitation',
      coalesce(v_base, '/gc') || '/my-team'
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_notify_invitation_accepted
  after update on invitations
  for each row execute procedure notify_invitation_accepted();

-- ─── Questionnaire assigned -> notify assignee ─────────────────────────────

create or replace function notify_assignment_created()
returns trigger as $$
declare
  v_base text;
  v_qname text;
begin
  v_base := public.profile_base_path(new.assignee_id);
  select name into v_qname from questionnaires where id = new.questionnaire_id;

  insert into notifications (user_id, type, title, body, link)
  values (
    new.assignee_id,
    'assignment_created',
    'New questionnaire assigned',
    coalesce(v_qname, 'A questionnaire') || ' was assigned to you',
    coalesce(v_base, '/trade') || '/assignments/' || new.id || '/respond'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_notify_assignment_created
  after insert on questionnaire_assignments
  for each row execute procedure notify_assignment_created();

-- ─── Questionnaire status changed -> notify assigner or assignee ───────────

create or replace function notify_assignment_status_changed()
returns trigger as $$
declare
  v_base text;
  v_qname text;
begin
  if new.status is distinct from old.status then
    select name into v_qname from questionnaires where id = new.questionnaire_id;

    if new.status = 'submitted' then
      v_base := public.profile_base_path(new.assigned_by);
      insert into notifications (user_id, type, title, body, link)
      values (
        new.assigned_by,
        'assignment_submitted',
        'Questionnaire submitted',
        coalesce(v_qname, 'A questionnaire') || ' was submitted for review',
        coalesce(v_base, '/owner') || '/assignments/' || new.id || '/review'
      );
    elsif new.status in ('approved', 'rejected', 'needs_more_info') then
      v_base := public.profile_base_path(new.assignee_id);
      insert into notifications (user_id, type, title, body, link)
      values (
        new.assignee_id,
        'assignment_reviewed',
        'Questionnaire ' || replace(new.status, '_', ' '),
        coalesce(v_qname, 'Your questionnaire') || ' was ' || replace(new.status, '_', ' '),
        coalesce(v_base, '/trade') || '/assignments/' || new.id || '/respond'
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_notify_assignment_status_changed
  after update on questionnaire_assignments
  for each row execute procedure notify_assignment_status_changed();

-- ─── Project submission created/changed -> notify owner or contractor ─────

create or replace function notify_submission_status_changed()
returns trigger as $$
declare
  v_owner_id uuid;
  v_project_name text;
  v_base text;
  v_should_notify boolean;
begin
  v_should_notify := (tg_op = 'INSERT' and new.status = 'submitted')
    or (tg_op = 'UPDATE' and new.status is distinct from old.status);

  if not v_should_notify then
    return new;
  end if;

  select owner_id, name into v_owner_id, v_project_name from projects where id = new.project_id;

  if new.status = 'submitted' and v_owner_id is not null then
    insert into notifications (user_id, type, title, body, link)
    values (
      v_owner_id,
      'submission_submitted',
      'New pre-qual submission',
      'A contractor submitted their pre-qualification for ' || coalesce(v_project_name, 'a project'),
      '/owner/projects/' || new.project_id
    );
  elsif new.status in ('approved', 'rejected', 'needs_more_info') then
    v_base := public.profile_base_path(new.contractor_id);
    insert into notifications (user_id, type, title, body, link)
    values (
      new.contractor_id,
      'submission_reviewed',
      'Submission ' || replace(new.status, '_', ' '),
      'Your pre-qualification for ' || coalesce(v_project_name, 'a project') || ' was ' || replace(new.status, '_', ' '),
      coalesce(v_base, '/trade') || '/projects/' || new.project_id
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_notify_submission_status_changed
  after insert or update on project_submissions
  for each row execute procedure notify_submission_status_changed();
