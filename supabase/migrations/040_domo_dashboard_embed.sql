-- ============================================================
-- 040: Domo dashboard embed (Mojo-admin managed)
-- ============================================================
-- Lets a Mojo Admin attach a public Domo dashboard embed URL to an Owner
-- company, shown on that Owner's home page. Only Mojo Admin should ever
-- set this — company admins already have a broad "update their own
-- company" RLS policy (012) for things like billing_mode, so a plain
-- column addition would let an Owner set this themselves too. Enforcing
-- via a trigger (rather than relying on the client UI never exposing the
-- field) means that stays true even against a direct API call.

alter table companies
  add column if not exists domo_embed_url text;

create or replace function enforce_domo_embed_url_mojo_only()
returns trigger as $$
begin
  if new.domo_embed_url is distinct from old.domo_embed_url
     and not coalesce((select is_mojo_admin from profiles where id = auth.uid()), false) then
    raise exception 'Only a Mojo admin can set domo_embed_url' using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_enforce_domo_embed_url_mojo_only
  before update of domo_embed_url on companies
  for each row
  execute procedure enforce_domo_embed_url_mojo_only();
