-- PREPARED ONLY: tested on isolated PostgreSQL. Not applied to production.
-- Review and stage against current production schema before promotion.
-- Atomic: a preflight exception rolls back the entire migration.
begin;
do $$ begin
 if not exists(select 1 from pg_trigger where tgrelid='public.organizations'::regclass and tgname='organizations_bootstrap_owner' and tgfoid='private.bootstrap_org_owner()'::regprocedure and not tgisinternal) then
  raise exception 'Preflight: retained organization owner trigger missing or changed';
 end if;
 if exists(select 1 from public.requests r where r.assigned_to is not null and not exists(select 1 from public.organization_members m where m.organization_id=r.organization_id and m.user_id=r.assigned_to and m.active)) then
  raise exception 'Preflight: resolve invalid existing request assignments before migration';
 end if;
 if exists(select 1 from public.approvals where status='pending' and (decided_by is not null or decided_at is not null)) then
  raise exception 'Preflight: resolve inconsistent pending approvals before migration';
 end if;
end $$;

-- Never expand grants. Remove dangerous non-CRUD privileges from business roles.
revoke truncate,trigger,references on public.organizations,public.organization_members,public.suppliers,public.products,public.quotes,public.quote_lines,public.contracts,public.requests,public.request_events,public.decisions,public.approvals,public.documents,public.audit_events from authenticated;
-- Supabase default privileges must also be reviewed for future tables; scope only
-- these known tables here to avoid affecting unrelated applications.

create or replace function private.guard_request_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.requester_id is distinct from old.requester_id then
   raise exception 'requester identity is immutable' using errcode='42501';
 end if;
 if new.assigned_to is not null and (tg_op='INSERT' or new.assigned_to is distinct from old.assigned_to) then
   if not exists(select 1 from public.organization_members m where m.organization_id=new.organization_id and m.user_id=new.assigned_to and m.active) then
     raise exception 'assignee must be an active member of the request organization' using errcode='42501';
   end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_request_assignment() from public,anon,authenticated;
drop trigger if exists requests_assignment_guard on public.requests;
create trigger requests_assignment_guard before insert or update on public.requests for each row execute function private.guard_request_assignment();

create or replace function private.guard_approval_transition()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
   if new.status<>'pending' or new.decided_by is not null or new.decided_at is not null then
     raise exception 'approval must be requested pending and undecided' using errcode='42501';
   end if;
 else
   if new.requested_by is distinct from old.requested_by or new.entity_id is distinct from old.entity_id or new.entity_type is distinct from old.entity_type or new.requested_at is distinct from old.requested_at then
     raise exception 'approval subject and requester are immutable' using errcode='42501';
   end if;
   if new.status is distinct from old.status then
     if not coalesce(private.can_approve_org(new.organization_id),false) then
       raise exception 'approver role required' using errcode='42501';
     end if;
     if new.status='pending' then
       new.decided_by:=null; new.decided_at:=null;
     else
       if new.decided_by is not null and new.decided_by is distinct from auth.uid() then
         raise exception 'cannot impersonate another approver' using errcode='42501';
       end if;
       new.decided_by:=auth.uid(); new.decided_at:=statement_timestamp();
     end if;
   elsif new.decided_by is distinct from old.decided_by or new.decided_at is distinct from old.decided_at then
     raise exception 'decision attribution is immutable without a transition' using errcode='42501';
   end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_approval_transition() from public,anon,authenticated;
drop trigger if exists approvals_transition_guard on public.approvals;
create trigger approvals_transition_guard before insert or update on public.approvals for each row execute function private.guard_approval_transition();

-- Both existing triggers execute the same idempotent function; retain one.
drop trigger if exists organization_owner_bootstrap on public.organizations;
commit;
