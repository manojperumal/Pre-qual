-- ============================================================
-- 042: billing_mode is now Mojo-admin managed only
-- ============================================================
-- billing_mode used to be self-service (Owner/GC company admins could set
-- it themselves via BillingSettingsCard). It's moving to Mojo Admin only —
-- same enforcement pattern as domo_embed_url (040): a trigger blocks any
-- change to this column unless the actor is a Mojo admin, since company
-- admins already have a broad "update their own company" RLS policy (012)
-- that would otherwise still let them change it directly.

create or replace function enforce_billing_mode_mojo_only()
returns trigger as $$
begin
  if new.billing_mode is distinct from old.billing_mode
     and not coalesce((select is_mojo_admin from profiles where id = auth.uid()), false) then
    raise exception 'Only a Mojo admin can change billing_mode' using errcode = 'P0001';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_enforce_billing_mode_mojo_only
  before update of billing_mode on companies
  for each row
  execute procedure enforce_billing_mode_mojo_only();
