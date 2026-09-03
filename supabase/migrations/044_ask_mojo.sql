-- ============================================================
-- 044: Ask Mojo — AI-assisted safety document authoring
-- ============================================================
-- A chat-based drafting tool (Owner/GC/Trade, any company role) for
-- building safety manuals, SOPs, and similar documents — either from
-- scratch or from an uploaded reference document. The agent maintains a
-- running "current draft" per thread (extracted server-side from its
-- responses), which a company admin can publish into the existing
-- company_documents library once it's ready.

create table if not exists ask_mojo_threads (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies(id) on delete cascade,
  created_by            uuid not null references profiles(id) on delete cascade,
  title                 text not null,
  document_type         text not null default 'other' check (document_type in ('safety_manual', 'sop', 'other')),
  current_draft         text,
  status                text not null default 'drafting' check (status in ('drafting', 'published')),
  published_document_id uuid references company_documents(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger ask_mojo_threads_updated_at
  before update on ask_mojo_threads
  for each row execute procedure update_updated_at_column();

create index if not exists idx_ask_mojo_threads_company on ask_mojo_threads(company_id);

alter table ask_mojo_threads enable row level security;

create policy "Company members can view their Ask Mojo threads"
  on ask_mojo_threads for select
  using (company_id = public.current_user_company_id());

create policy "Company members can create Ask Mojo threads"
  on ask_mojo_threads for insert
  with check (company_id = public.current_user_company_id() and created_by = auth.uid());

-- Any company member can keep drafting (chat updates current_draft); the
-- separate "publish" step is enforced at the company_documents insert
-- policy (admin-only, unchanged) rather than here, so this stays permissive
-- for ordinary chat/draft updates.
create policy "Company members can update their Ask Mojo threads"
  on ask_mojo_threads for update
  using (company_id = public.current_user_company_id());

create policy "Mojo admins can view all Ask Mojo threads"
  on ask_mojo_threads for select
  using (public.current_user_is_mojo_admin());

create table if not exists ask_mojo_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references ask_mojo_threads(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ask_mojo_messages_thread on ask_mojo_messages(thread_id, created_at);

alter table ask_mojo_messages enable row level security;

create policy "Company members can view messages in their threads"
  on ask_mojo_messages for select
  using (
    thread_id in (select id from ask_mojo_threads where company_id = public.current_user_company_id())
  );

create policy "Company members can add messages to their threads"
  on ask_mojo_messages for insert
  with check (
    thread_id in (select id from ask_mojo_threads where company_id = public.current_user_company_id())
  );

create policy "Mojo admins can view all Ask Mojo messages"
  on ask_mojo_messages for select
  using (public.current_user_is_mojo_admin());

-- Reference documents uploaded to ground a thread (existing document to
-- refine, prior manual to extend, etc.) — stored in the same
-- prequal-documents bucket as everything else, path
-- "ask-mojo/{thread_id}/{filename}".
create table if not exists ask_mojo_reference_documents (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references ask_mojo_threads(id) on delete cascade,
  file_name    text not null,
  storage_path text not null,
  created_at   timestamptz not null default now()
);

alter table ask_mojo_reference_documents enable row level security;

create policy "Company members can view reference docs in their threads"
  on ask_mojo_reference_documents for select
  using (
    thread_id in (select id from ask_mojo_threads where company_id = public.current_user_company_id())
  );

create policy "Company members can add reference docs to their threads"
  on ask_mojo_reference_documents for insert
  with check (
    thread_id in (select id from ask_mojo_threads where company_id = public.current_user_company_id())
  );

-- Storage RLS for the ask-mojo/ path within prequal-documents.
create policy "Company members can upload Ask Mojo reference docs"
  on storage.objects for insert
  with check (
    bucket_id = 'prequal-documents'
    and (storage.foldername(name))[1] = 'ask-mojo'
    and exists (
      select 1 from ask_mojo_threads t
      where t.id::text = (storage.foldername(name))[2]
        and t.company_id = public.current_user_company_id()
    )
  );

create policy "Company members can view Ask Mojo reference docs"
  on storage.objects for select
  using (
    bucket_id = 'prequal-documents'
    and (storage.foldername(name))[1] = 'ask-mojo'
    and exists (
      select 1 from ask_mojo_threads t
      where t.id::text = (storage.foldername(name))[2]
        and t.company_id = public.current_user_company_id()
    )
  );

-- SOPs authored via Ask Mojo need a document_type home in the shared
-- company document library alongside the existing types.
alter table company_documents
  drop constraint if exists company_documents_document_type_check;

alter table company_documents
  add constraint company_documents_document_type_check
  check (document_type in ('safety_manual', 'coi', 'w9', 'loss_runs', 'license', 'sop', 'other'));
