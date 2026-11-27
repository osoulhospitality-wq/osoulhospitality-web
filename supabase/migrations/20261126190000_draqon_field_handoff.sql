begin;

-- A pilot organization is opted in explicitly by database operations.
create table private.draqon_field_pilot (
  organization_id uuid primary key references public.organizations(id),
  enabled boolean not null default false
);
revoke all on private.draqon_field_pilot from public, anon, authenticated;

-- An immutable proposal snapshot. Approval and its work order commit together.
create table public.draqon_field_proposals (
  organization_id uuid not null references public.organizations(id),
  id uuid not null,
  asset_id uuid not null,
  github_issue integer check (github_issue > 0),
  summary text not null check (char_length(btrim(summary)) between 3 and 300),
  submitted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users(id),
  assigned_to uuid references auth.users(id),
  work_order_id uuid,
  approved_at timestamptz,
  primary key (organization_id,id),
  unique (organization_id,github_issue),
  unique (organization_id,work_order_id),
  foreign key (organization_id,asset_id) references public.facility_assets(organization_id,id),
  foreign key (organization_id,work_order_id) references public.facility_work_orders(organization_id,id),
  check ((approved_at is null and approved_by is null and assigned_to is null and work_order_id is null)
      or (approved_at is not null and approved_by is not null and approved_by <> submitted_by and assigned_to is not null and work_order_id is not null))
);
create index draqon_field_queue on public.draqon_field_proposals (organization_id,created_at desc);
alter table public.draqon_field_proposals enable row level security;
revoke all on public.draqon_field_proposals from public,anon,authenticated;
grant select on public.draqon_field_proposals to authenticated;
create policy member_read on public.draqon_field_proposals for select to authenticated
using (private.has_org_access(organization_id) and ((select auth.jwt())->>'aal')='aal2');

-- Application identities can read their own organization's history. Only the
-- database-owned handoff functions/triggers append records, in the business transaction.
create table public.draqon_field_events (
  organization_id uuid not null,
  proposal_id uuid not null,
  event_type text not null check (event_type in ('prepared','issued','started','visit_recorded','closed')),
  entity_id uuid not null,
  actor_id uuid not null references auth.users(id),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (organization_id,proposal_id,event_type,entity_id),
  foreign key (organization_id,proposal_id) references public.draqon_field_proposals(organization_id,id)
);
alter table public.draqon_field_events enable row level security;
revoke all on public.draqon_field_events from public,anon,authenticated;
grant select on public.draqon_field_events to authenticated;
create policy member_read on public.draqon_field_events for select to authenticated
using (private.has_org_access(organization_id) and ((select auth.jwt())->>'aal')='aal2');

create function private.draqon_event_immutable() returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'Field events are append only' using errcode='55000';
end;
$$;
create trigger draqon_event_immutable before update or delete on public.draqon_field_events
for each row execute function private.draqon_event_immutable();

-- Hold the actor's active membership until transaction completion. A concurrent
-- revocation serializes with the acceptance of the write that it authorizes.
create function private.draqon_assert_field_actor(p_org uuid,p_approval boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or (auth.jwt()->>'aal') is distinct from 'aal2' then
    raise exception 'Verified field session required' using errcode='42501';
  end if;
  perform 1 from public.organization_members
    where organization_id=p_org and user_id=auth.uid() and active
    and (role in ('owner','approver') or (not p_approval and role='analyst')) for share;
  if not found then raise exception 'Current field membership does not permit this action' using errcode='42501'; end if;
end;
$$;
revoke all on function private.draqon_assert_field_actor(uuid,boolean) from public,anon,authenticated;

create function public.draqon_prepare_field(p_org uuid,p_id uuid,p_asset uuid,p_summary text,p_issue integer default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.draqon_field_proposals;
begin
  perform private.draqon_assert_field_actor(p_org,false);
  insert into public.draqon_field_proposals(organization_id,id,asset_id,summary,github_issue,submitted_by)
  values(p_org,p_id,p_asset,btrim(p_summary),p_issue,auth.uid())
  on conflict do nothing;
  if found then
    insert into public.draqon_field_events(organization_id,proposal_id,event_type,entity_id,actor_id)
    values(p_org,p_id,'prepared',p_id,auth.uid());
  end if;
  select * into existing from public.draqon_field_proposals where organization_id=p_org and id=p_id;
  if not found or existing.submitted_by<>auth.uid() or existing.asset_id is distinct from p_asset
      or existing.summary is distinct from btrim(p_summary) or existing.github_issue is distinct from p_issue then
    raise exception 'Proposal reference is already in use with different details' using errcode='23505';
  end if;
  return existing.id;
end;
$$;

create function public.draqon_approve_field(p_org uuid,p_id uuid,p_assignee uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare item public.draqon_field_proposals; order_id uuid;
begin
  perform private.draqon_assert_field_actor(p_org,true);
  select * into strict item from public.draqon_field_proposals where organization_id=p_org and id=p_id for update;
  if item.work_order_id is not null then
    if item.assigned_to is distinct from p_assignee then
      raise exception 'Already assigned to a different person' using errcode='23505';
    end if;
    return item.work_order_id;
  end if;
  if item.submitted_by=auth.uid() then
    raise exception 'A second person must approve this proposal' using errcode='42501';
  end if;
  perform 1 from private.draqon_field_pilot where organization_id=p_org and enabled for share;
  if not found then raise exception 'Field handoff is paused' using errcode='55000'; end if;
  perform 1 from public.organization_members where organization_id=p_org and user_id=p_assignee
    and active and role in ('owner','approver','analyst') for share;
  if not found then raise exception 'Choose an active operational assignee' using errcode='23514'; end if;
  insert into public.facility_work_orders(organization_id,asset_id,summary)
  values(p_org,item.asset_id,item.summary) returning id into order_id;
  update public.draqon_field_proposals set approved_by=auth.uid(),assigned_to=p_assignee,
    approved_at=now(),work_order_id=order_id where organization_id=p_org and id=p_id;
  insert into public.draqon_field_events(organization_id,proposal_id,event_type,entity_id,actor_id)
  values(p_org,p_id,'issued',order_id,auth.uid());
  return order_id;
end;
$$;
revoke all on function public.draqon_prepare_field(uuid,uuid,uuid,text,integer),public.draqon_approve_field(uuid,uuid,uuid) from public,anon;
grant execute on function public.draqon_prepare_field(uuid,uuid,uuid,text,integer),public.draqon_approve_field(uuid,uuid,uuid) to authenticated;
-- The stop controls issuance of NEW linked orders. Existing authorized teams
-- continue service on issued orders under the facility state machine.
create function private.draqon_audit_field_transition() returns trigger
language plpgsql security definer set search_path='' as $$
declare proposal uuid; order_id uuid; kind text;
begin
  if tg_table_name='facility_visits' then
    order_id:=new.work_order_id;
    kind:='visit_recorded';
  else
    order_id:=new.id;
    kind:=case new.status when 'in_progress' then 'started' when 'completed' then 'closed' end;
  end if;
  select id into proposal from public.draqon_field_proposals
    where organization_id=new.organization_id and work_order_id=order_id;
  if not found then return new; end if;
  perform private.draqon_assert_field_actor(new.organization_id,kind='closed');
  insert into public.draqon_field_events(organization_id,proposal_id,event_type,entity_id,actor_id)
  values(new.organization_id,proposal,kind,new.id,auth.uid());
  return new;
end;
$$;
create trigger draqon_audit_order after update of status on public.facility_work_orders
for each row when (old.status is distinct from new.status) execute function private.draqon_audit_field_transition();
create trigger draqon_audit_visit after insert on public.facility_visits
for each row execute function private.draqon_audit_field_transition();
revoke all on function private.draqon_event_immutable(),private.draqon_audit_field_transition() from public,anon,authenticated;
commit;
