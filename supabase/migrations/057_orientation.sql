-- ============================================================
-- 057: Safety Mojo Orientation — site orientation & worker clearance
-- ============================================================
-- Shared-database module used by the separate Orientation app
-- (orientation/server). All tables are prefixed `orient_`.
--
-- Access model: the Orientation server connects with a privileged
-- Postgres role and enforces authorization in code (workers are not
-- Supabase auth users — they sign in with an SMS one-time code). RLS is
-- enabled with NO policies on every table so the anon/authenticated
-- PostgREST roles used by the Pre-qual client cannot read or write them
-- directly. The single exception is the security-definer function
-- `orient_company_compliance()` at the bottom, which Pre-qual uses to
-- show orientation compliance on a contractor's record (FR-26).
--
-- Immutability (FR-24): attempts, completions, attestations and the
-- audit log are append-only, enforced by triggers. Published module
-- versions cannot be changed or deleted (FR-10). The audit log is a
-- SHA-256 hash chain so tampering at the database level is detectable.
-- ============================================================

create extension if not exists "pgcrypto";

-- ─── Owner standard (FR-8, FR-9, FR-21) ───────────────────────────────────────
create table if not exists orient_standards (
  id               uuid primary key default gen_random_uuid(),
  owner_company_id uuid not null unique references companies(id) on delete cascade,
  name             text not null default 'Site Orientation Standard',
  expiry_days      int  not null default 365 check (expiry_days > 0),
  reminder_days    int[] not null default '{30,7,1}',
  languages        text[] not null default '{en,es}',
  retention_years  int  not null default 10 check (retention_years > 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ─── Per-project orientation settings ─────────────────────────────────────────
create table if not exists orient_project_settings (
  project_id             uuid primary key references projects(id) on delete cascade,
  owner_company_id       uuid references companies(id) on delete set null,
  join_code              text not null unique,
  expiry_days            int check (expiry_days is null or expiry_days > 0),
  open_days_before_start int not null default 14 check (open_days_before_start >= 0),
  ready_at               timestamptz,
  ready_by               uuid references profiles(id) on delete set null,
  api_key_hash           text,
  api_key_prefix         text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ─── Content: modules and immutable versions (FR-8 … FR-12) ───────────────────
create table if not exists orient_modules (
  id               uuid primary key default gen_random_uuid(),
  layer            text not null check (layer in ('baseline', 'project', 'trade')),
  owner_company_id uuid not null references companies(id) on delete cascade,
  project_id       uuid references projects(id) on delete cascade,
  trade            text,
  section_key      text,
  title            text not null,
  position         int  not null default 0,
  expiry_days      int check (expiry_days is null or expiry_days > 0),
  archived_at      timestamptz,
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint orient_modules_layer_scope check (
       (layer = 'baseline' and project_id is null and trade is null)
    or (layer = 'project'  and project_id is not null and trade is null)
    or (layer = 'trade'    and trade is not null)
  )
);
create index if not exists idx_orient_modules_owner   on orient_modules(owner_company_id) where archived_at is null;
create index if not exists idx_orient_modules_project on orient_modules(project_id) where archived_at is null;

create table if not exists orient_module_versions (
  id                    uuid primary key default gen_random_uuid(),
  module_id             uuid not null references orient_modules(id) on delete restrict,
  version               int  not null,
  status                text not null default 'draft' check (status in ('draft', 'published')),
  -- { segments: [{id, text:{en,es}, image_path?}], checks: [{id, prompt:{..}, options:{..}, correct_index, reteach:{..}}],
  --   delta?: { segments: [...], checks: [...] } }
  content               jsonb not null,
  change_policy         text not null default 'full' check (change_policy in ('full', 'delta', 'new_only')),
  -- { "es": { "by": "Name", "at": "2026-11-03T…" } }  — human translation review (NFR Language quality)
  translations_reviewed jsonb not null default '{}',
  content_hash          text,
  created_by            uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  published_by          uuid references profiles(id) on delete set null,
  published_at          timestamptz,
  unique (module_id, version)
);
create index if not exists idx_orient_versions_module on orient_module_versions(module_id, version desc);

create or replace function orient_protect_published_version()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'published' then
      raise exception 'Published orientation content versions cannot be deleted';
    end if;
    return old;
  end if;
  if old.status = 'published' then
    raise exception 'Published orientation content versions are immutable';
  end if;
  return new;
end $$;

drop trigger if exists orient_versions_immutable on orient_module_versions;
create trigger orient_versions_immutable
  before update or delete on orient_module_versions
  for each row execute procedure orient_protect_published_version();

-- ─── Workers and project enrollments (FR-1, FR-2, FR-13 … FR-16) ──────────────
create table if not exists orient_workers (
  id                 uuid primary key default gen_random_uuid(),
  phone              text not null unique,            -- E.164
  full_name          text not null,
  preferred_language text not null default 'en',
  photo_path         text,
  photo_captured_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists orient_enrollments (
  id                   uuid primary key default gen_random_uuid(),
  worker_id            uuid not null references orient_workers(id) on delete restrict,
  project_id           uuid not null references projects(id) on delete cascade,
  company_id           uuid references companies(id) on delete set null,
  employer_name        text,                         -- free text if employer not yet on the project
  crew                 text,
  trade                text,
  start_date           date,
  -- Stored status is recomputed by the server on every relevant event;
  -- expiry and revocation are applied at read time in orient_enrollment_status.
  status               text not null default 'not_started' check (status in (
                         'not_started', 'in_progress', 'refresh_required',
                         'pending_verification', 'cleared')),
  attested_at          timestamptz,
  expires_at           timestamptz,
  identity_verified_at timestamptz,
  identity_verified_by uuid references profiles(id) on delete set null,
  revoked_at           timestamptz,
  revoke_kind          text check (revoke_kind in ('revoked', 'suspended')),
  revoke_category      text,
  revoke_reason        text,
  revoked_by           uuid references profiles(id) on delete set null,
  credential_token     text not null unique default encode(gen_random_bytes(18), 'hex'),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (worker_id, project_id)
);
create index if not exists idx_orient_enrollments_project on orient_enrollments(project_id);
create index if not exists idx_orient_enrollments_company on orient_enrollments(company_id);

create or replace view orient_enrollment_status as
select e.*,
  case
    when e.revoked_at is not null then coalesce(e.revoke_kind, 'revoked')
    when e.expires_at is not null and e.expires_at <= now() then 'expired'
    else e.status
  end as effective_status
from orient_enrollments e;

-- Resume position per module version (FR-6)
create table if not exists orient_module_progress (
  enrollment_id     uuid not null references orient_enrollments(id) on delete cascade,
  module_version_id uuid not null references orient_module_versions(id) on delete restrict,
  segment_index     int  not null default 0,
  language          text not null default 'en',
  updated_at        timestamptz not null default now(),
  primary key (enrollment_id, module_version_id)
);

-- Every comprehension-check attempt (FR-4)
create table if not exists orient_check_attempts (
  id                uuid primary key default gen_random_uuid(),
  enrollment_id     uuid not null references orient_enrollments(id) on delete restrict,
  module_version_id uuid not null references orient_module_versions(id) on delete restrict,
  check_id          text not null,
  attempt_no        int  not null,
  selected_index    int  not null,
  correct           boolean not null,
  language          text not null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_orient_attempts_enrollment on orient_check_attempts(enrollment_id, module_version_id);

create table if not exists orient_module_completions (
  id                uuid primary key default gen_random_uuid(),
  enrollment_id     uuid not null references orient_enrollments(id) on delete restrict,
  module_version_id uuid not null references orient_module_versions(id) on delete restrict,
  mode              text not null default 'full' check (mode in ('full', 'delta')),
  language          text not null,
  completed_at      timestamptz not null default now()
);
create index if not exists idx_orient_completions_enrollment on orient_module_completions(enrollment_id);

-- Worker attestation (FR-5) — manifest lists the exact module versions attested
create table if not exists orient_attestations (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references orient_enrollments(id) on delete restrict,
  statement     text not null,
  language      text not null,
  signed_name   text not null,
  manifest      jsonb not null,
  ip            text,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_orient_attestations_enrollment on orient_attestations(enrollment_id, created_at desc);

-- Subcontractor crew invites (FR-20)
create table if not exists orient_invites (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  phone         text not null,
  full_name     text,
  crew          text,
  trade         text,
  start_date    date,
  invited_by    uuid references profiles(id) on delete set null,
  sent_at       timestamptz,
  enrollment_id uuid references orient_enrollments(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (project_id, phone)
);

-- SMS one-time codes
create table if not exists orient_otp_codes (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,
  code_hash  text not null,
  attempts   int  not null default 0,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_orient_otp_phone on orient_otp_codes(phone, created_at desc);

-- Idempotency for expiry reminders (FR-21)
create table if not exists orient_reminders_sent (
  enrollment_id uuid not null references orient_enrollments(id) on delete cascade,
  kind          text not null,       -- e.g. 'expiry:2027-11-03:7', 'expired:2027-11-03'
  sent_at       timestamptz not null default now(),
  primary key (enrollment_id, kind)
);

-- ─── Tamper-evident audit log (FR-24) ─────────────────────────────────────────
create table if not exists orient_audit_log (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  actor_type    text not null check (actor_type in ('worker', 'staff', 'system', 'api')),
  actor_id      text,
  actor_label   text,
  project_id    uuid,
  enrollment_id uuid,
  worker_id     uuid,
  event         text not null,
  payload       jsonb not null default '{}',
  prev_hash     text,
  hash          text
);
create index if not exists idx_orient_audit_project    on orient_audit_log(project_id, created_at);
create index if not exists idx_orient_audit_enrollment on orient_audit_log(enrollment_id, created_at);

create or replace function orient_audit_chain()
returns trigger language plpgsql as $$
declare
  last_hash text;
begin
  -- Serialize writers so the chain is linear.
  perform pg_advisory_xact_lock(hashtext('orient_audit_log'));
  select hash into last_hash from orient_audit_log order by id desc limit 1;
  new.created_at := coalesce(new.created_at, now());
  new.prev_hash  := coalesce(last_hash, 'genesis');
  new.hash := encode(digest(
    new.prev_hash || '|' || new.id::text || '|' || extract(epoch from new.created_at)::text || '|' ||
    new.actor_type || '|' || coalesce(new.actor_id, '') || '|' || new.event || '|' ||
    coalesce(new.project_id::text, '') || '|' || coalesce(new.enrollment_id::text, '') || '|' ||
    coalesce(new.worker_id::text, '') || '|' || new.payload::text,
    'sha256'), 'hex');
  return new;
end $$;

drop trigger if exists orient_audit_chain_trg on orient_audit_log;
create trigger orient_audit_chain_trg
  before insert on orient_audit_log
  for each row execute procedure orient_audit_chain();

create or replace function orient_append_only()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only; corrections must be appended as new entries', tg_table_name;
end $$;

do $$
declare t text;
begin
  foreach t in array array['orient_audit_log', 'orient_check_attempts',
                           'orient_module_completions', 'orient_attestations']
  loop
    execute format('drop trigger if exists %I_append_only on %I', t, t);
    execute format('create trigger %I_append_only before update or delete on %I
                    for each row execute procedure orient_append_only()', t, t);
  end loop;
end $$;

-- ─── updated_at maintenance ───────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['orient_standards', 'orient_project_settings',
                           'orient_workers', 'orient_enrollments']
  loop
    execute format('drop trigger if exists %I_updated_at on %I', t, t);
    execute format('create trigger %I_updated_at before update on %I
                    for each row execute procedure update_updated_at_column()', t, t);
  end loop;
end $$;

-- ─── Lock out PostgREST roles (server-mediated access only) ───────────────────
do $$
declare t text;
begin
  foreach t in array array['orient_standards', 'orient_project_settings', 'orient_modules',
                           'orient_module_versions', 'orient_workers', 'orient_enrollments',
                           'orient_module_progress', 'orient_check_attempts',
                           'orient_module_completions', 'orient_attestations', 'orient_invites',
                           'orient_otp_codes', 'orient_reminders_sent', 'orient_audit_log']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on orient_enrollment_status from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on orient_enrollment_status from authenticated;
  end if;
end $$;

-- ─── FR-26: orientation compliance on the contractor record ───────────────────
-- Returns per-project orientation counts for a contractor company, plus an
-- overall compliance rate. Callable by members of that company, by members of
-- companies sharing a project with it, and by Mojo admins.
create or replace function orient_company_compliance(p_company_id uuid)
returns table (
  project_id      uuid,
  project_name    text,
  workers         int,
  cleared         int,
  pending         int,
  expired         int,
  revoked         int,
  compliance_rate numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  caller_company uuid;
  caller_admin   boolean;
begin
  select new_company_id, is_mojo_admin into caller_company, caller_admin
  from profiles where id = auth.uid();

  if not coalesce(caller_admin, false)
     and caller_company is distinct from p_company_id
     and not exists (
       select 1
       from project_members a
       join profiles ap on ap.id = a.user_id and ap.new_company_id = caller_company
       join project_members b on b.project_id = a.project_id
       join profiles bp on bp.id = b.user_id and bp.new_company_id = p_company_id
     )
     and not exists (
       select 1
       from projects pr
       join profiles op on op.id = pr.owner_id and op.new_company_id = caller_company
       join orient_enrollments oe on oe.project_id = pr.id and oe.company_id = p_company_id
     )
  then
    return;
  end if;

  return query
  select s.project_id,
         pr.name::text,
         count(*)::int,
         count(*) filter (where s.effective_status = 'cleared')::int,
         count(*) filter (where s.effective_status in ('not_started', 'in_progress',
                                                     'refresh_required', 'pending_verification'))::int,
         count(*) filter (where s.effective_status = 'expired')::int,
         count(*) filter (where s.effective_status in ('revoked', 'suspended'))::int,
         round(100.0 * count(*) filter (where s.effective_status = 'cleared') / greatest(count(*), 1), 1)
  from orient_enrollment_status s
  join projects pr on pr.id = s.project_id
  where s.company_id = p_company_id
  group by s.project_id, pr.name;
end $$;

grant execute on function orient_company_compliance(uuid) to authenticated;
