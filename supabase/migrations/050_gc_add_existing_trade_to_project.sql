-- ============================================================
-- 050: Let a GC add an existing trade to a project they coordinate
-- ============================================================
-- A GC can already invite a brand-new trade to a specific project (email
-- invite). This adds the other half: attaching a trade already in the
-- GC's roster (per useGCTrades — either a project_member on some other
-- project this GC coordinates, or has directly accepted an invitation
-- from this GC) to another of the GC's projects, without a fresh invite.
--
-- Every reference to project_members here goes through a SECURITY DEFINER
-- helper rather than a raw correlated subquery — a policy on
-- project_members querying project_members directly is exactly the
-- self-recursion risk current_user_project_ids() (019) was already
-- introduced to avoid.

create or replace function public.current_user_gc_project_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select project_id from project_members where user_id = auth.uid() and role = 'gc'
$$;

create or replace function public.current_user_gc_trade_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select distinct user_id from project_members
  where role = 'trade' and project_id in (select public.current_user_gc_project_ids())
$$;

create policy "GCs can add an existing trade of theirs to a project they coordinate"
  on project_members for insert
  with check (
    role = 'trade'
    and project_id in (select public.current_user_gc_project_ids())
    and (
      user_id in (select public.current_user_accepted_invitee_ids())
      or user_id in (select public.current_user_gc_trade_ids())
    )
  );
