-- Opt-in approved preventive work. Creating a plan does not enroll it.
create table private.field_cycle_schedule_settings (
 plan_id uuid primary key references public.facility_pm_plans(id),
 organization_id uuid not null references public.organizations(id),
 approved_by uuid not null references auth.users(id),
 enabled boolean not null,
 changed_at timestamptz not null default now(),
 try_after timestamptz not null default '-infinity',
 last_error_state text
);
create index field_cycle_due_settings on private.field_cycle_schedule_settings(try_after,plan_id) where enabled;
create index field_cycle_approver_settings on private.field_cycle_schedule_settings(organization_id,approved_by) where enabled;
create table private.field_cycle_schedule_events (
 id bigint generated always as identity primary key,plan_id uuid not null references public.facility_pm_plans(id),
 event text not null check(event in ('enabled','disabled','revoked','issued','error')),
 actor uuid references auth.users(id), authorized_by uuid references auth.users(id), order_id uuid references public.facility_work_orders(id),
 error_state text,created_at timestamptz not null default clock_timestamp()
);
create index field_cycle_schedule_events_plan on private.field_cycle_schedule_events(plan_id,id);
create table private.field_cycle_scheduler_control (singleton boolean primary key check(singleton),running boolean not null);
insert into private.field_cycle_scheduler_control values (true,true);
alter table private.field_cycle_schedule_settings enable row level security;
alter table private.field_cycle_schedule_events enable row level security;
alter table private.field_cycle_scheduler_control enable row level security;
revoke all on private.field_cycle_schedule_settings,private.field_cycle_schedule_events,private.field_cycle_scheduler_control from public,anon,authenticated;
alter table public.facility_pm_occurrences add column dispatch_mode text not null default 'manual',
 add column authorized_by uuid references auth.users(id), alter column issued_by drop not null;
alter table public.facility_pm_occurrences add constraint facility_pm_dispatch_identity check (
 (dispatch_mode='manual' and issued_by is not null and authorized_by is null) or
 (dispatch_mode='scheduled' and issued_by is null and authorized_by is not null)
);

-- Shared deterministic mutation. User-facing RPC verifies a real session;
-- scheduler runs as database job and records delegated authority separately.
create function private.field_cycle_dispatch(p_org uuid,p_facility uuid,p_plan uuid,p_due date,p_actor uuid,p_delegate uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare plan public.facility_pm_plans; order_id uuid;
begin

  select * into plan from public.facility_pm_plans where organization_id=p_org and facility_id=p_facility and id=p_plan for update;
  if not found then raise exception 'Unknown schedule' using errcode='42501'; end if;
  select work_order_id into order_id from public.facility_pm_occurrences where plan_id=p_plan and due_on=p_due;
  if found then return order_id; end if;
  if plan.paused_at is not null or p_due is distinct from plan.next_due_on or p_due > (now() at time zone 'Asia/Riyadh')::date then
    raise exception 'Occurrence is outside the approved queue' using errcode='23514';
  end if;
  if exists (select 1 from public.facility_pm_occurrences o join public.facility_work_orders w on w.id=o.work_order_id
    join public.facility_pm_plans previous on previous.id=o.plan_id
    where previous.asset_id=plan.asset_id and lower(trim(previous.task))=lower(trim(plan.task)) and w.status<>'completed') then
    raise exception 'Previous preventive order is still open' using errcode='23514';
  end if;
  insert into public.facility_work_orders(organization_id,asset_id,summary) values(p_org,plan.asset_id,plan.task) returning id into order_id;
  insert into public.facility_pm_occurrences(organization_id,facility_id,plan_id,due_on,work_order_id,issued_by,dispatch_mode,authorized_by)
  values(p_org,p_facility,p_plan,p_due,order_id,p_actor,case when p_actor is null then 'scheduled' else 'manual' end,p_delegate);
  update public.facility_pm_plans set issued_count=issued_count+1,
    next_due_on=private.facility_pm_due(first_due_on,period_unit,period_count,issued_count+1) where id=p_plan;
  return order_id;
end;
$$;
revoke all on function private.field_cycle_dispatch(uuid,uuid,uuid,date,uuid,uuid) from public,anon,authenticated;
create or replace function public.facility_pm_issue(p_org uuid,p_facility uuid,p_plan uuid,p_due date) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 perform private.draqon_assert_field_actor(p_org,false);
 return private.field_cycle_dispatch(p_org,p_facility,p_plan,p_due,auth.uid(),null);
end $$;

create function public.field_cycle_schedule(p_site uuid,p_plan uuid,p_enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.field_cycle_manager(p_site); flag boolean;
begin
 if p_enabled is null then raise exception 'CYCLE_PLAN_SCOPE';end if;
 -- A disabled/paused plan must remain switchable off.
 if not exists(select from public.facility_pm_plans p join private.field_cycle_assets a on a.asset_id=p.asset_id
 where p.id=p_plan and p.organization_id=org and p.facility_id=p_site and (not p_enabled or p.paused_at is null)) then raise exception 'CYCLE_PLAN_SCOPE';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_plan::text,182));
 select enabled into flag from private.field_cycle_schedule_settings where plan_id=p_plan for update;
 if coalesce(flag,false)=p_enabled then return p_enabled;end if;
 insert into private.field_cycle_schedule_settings(plan_id,organization_id,approved_by,enabled) values(p_plan,org,auth.uid(),p_enabled)
 on conflict(plan_id) do update set enabled=excluded.enabled,approved_by=excluded.approved_by,changed_at=now(),try_after='-infinity',last_error_state=null;
 insert into private.field_cycle_schedule_events(plan_id,event,actor) values(p_plan,case when p_enabled then 'enabled' else 'disabled' end,auth.uid());
 return p_enabled;
end $$;
create function public.field_cycle_scheduled(p_site uuid) returns uuid[] language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(private.field_form_access(p_site),false) then raise exception 'CYCLE_ACCESS' using errcode='42501';end if;
 return array(select s.plan_id from private.field_cycle_schedule_settings s join public.facility_pm_plans p on p.id=s.plan_id
 join public.organization_members m on m.user_id=s.approved_by and m.organization_id=s.organization_id
 where p.facility_id=p_site and s.enabled and p.paused_at is null and m.active and m.role in ('owner','approver') order by s.plan_id);
end $$;
revoke all on function public.field_cycle_scheduled(uuid),public.field_cycle_schedule(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.field_cycle_scheduled(uuid),public.field_cycle_schedule(uuid,uuid,boolean) to authenticated;

create function private.field_cycle_revoke_schedule() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.active and new.role in ('owner','approver') then return new;end if;
 end if;
 if old.active and old.role in ('owner','approver') then
 with revoked as (update private.field_cycle_schedule_settings set enabled=false,changed_at=now()
 where organization_id=old.organization_id and approved_by=old.user_id and enabled returning plan_id)
 insert into private.field_cycle_schedule_events(plan_id,event,actor,authorized_by) select plan_id,'revoked',auth.uid(),old.user_id from revoked;
 end if;
 return null;
end $$;
revoke all on function private.field_cycle_revoke_schedule() from public,anon,authenticated;
create trigger field_cycle_revoke_schedule after update of active,role or delete on public.organization_members
for each row execute function private.field_cycle_revoke_schedule();

create function private.field_cycle_tick(max_plans integer default 25) returns integer
language plpgsql security definer set search_path='' as $$
declare due record; issued uuid; count_issued int:=0; valid boolean;
begin
 if max_plans is null or max_plans not between 1 and 100 then raise exception 'Invalid dispatch batch';end if;
 perform 1 from private.field_cycle_scheduler_control where singleton and running for share;
 if not found then return 0;end if;
 for due in
  select s.plan_id,s.approved_by,p.organization_id,p.facility_id,p.next_due_on from private.field_cycle_schedule_settings s
  join public.facility_pm_plans p on p.id=s.plan_id
  join public.organization_members m on m.organization_id=p.organization_id and m.user_id=s.approved_by
  where s.enabled and s.try_after<=clock_timestamp() and m.active and m.role in ('owner','approver')
  and p.paused_at is null and p.next_due_on<=(now() at time zone 'Asia/Riyadh')::date
  and not exists(select from public.facility_pm_occurrences o join public.facility_pm_plans previous on previous.id=o.plan_id
    join public.facility_work_orders w on w.id=o.work_order_id where previous.asset_id=p.asset_id and lower(trim(previous.task))=lower(trim(p.task)) and w.status<>'completed')
  order by p.next_due_on,p.id limit max_plans for update of s skip locked
 loop
  begin
   perform 1 from public.organization_members where organization_id=due.organization_id and user_id=due.approved_by
    and active and role in ('owner','approver') for share;
   if not found then continue;end if;
   -- Serialize with manual issuance and refuse to log a manual occurrence as a scheduled one.
   select p.paused_at is null and p.next_due_on=due.next_due_on into valid from public.facility_pm_plans p where p.id=due.plan_id for update;
   if not coalesce(valid,false) then continue;end if;
   issued:=private.field_cycle_dispatch(due.organization_id,due.facility_id,due.plan_id,due.next_due_on,null,due.approved_by);
   insert into private.field_cycle_schedule_events(plan_id,event,authorized_by,order_id) values(due.plan_id,'issued',due.approved_by,issued);
   update private.field_cycle_schedule_settings set try_after='-infinity',last_error_state=null where plan_id=due.plan_id and last_error_state is not null;
   count_issued:=count_issued+1;
  exception when others then
   update private.field_cycle_schedule_settings set try_after=clock_timestamp()+interval '1 hour',last_error_state=sqlstate where plan_id=due.plan_id;
   insert into private.field_cycle_schedule_events(plan_id,event,authorized_by,error_state) values(due.plan_id,'error',due.approved_by,sqlstate);
  end;
 end loop;
 return count_issued;
end $$;
revoke all on function private.field_cycle_tick(int) from public,anon,authenticated;
-- Native background role only. All plans initially disabled. Scoped kill switch:
-- UPDATE private.field_cycle_scheduler_control SET running=false WHERE singleton;
do $$begin
 if not exists(select from pg_extension where extname='pg_cron') then execute 'create extension pg_cron';end if;
end $$;
select cron.schedule('osoul-approved-field-maintenance','*/10 * * * *','select private.field_cycle_tick(25)');
notify pgrst,'reload schema';
