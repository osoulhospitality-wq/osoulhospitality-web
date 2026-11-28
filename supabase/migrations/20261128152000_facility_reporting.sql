-- Private, opt-in period snapshots. No email, messaging, or financial actions.
create table private.fm_report_schedules (
  organization_id uuid not null, facility_id uuid not null, cadence text not null check(cadence in ('daily','weekly','monthly')),
  enabled boolean not null, next_start date, changed_by uuid not null, changed_at timestamptz not null default now(),
  last_result text check(last_result in ('generated','no_activity','owner_inactive','read_failed')), retry_after timestamptz,
  primary key (facility_id,cadence),
  foreign key (organization_id,facility_id) references public.facilities(organization_id,id),
  check(enabled = (next_start is not null))
);
create index fm_report_due on private.fm_report_schedules(next_start) where enabled;
create table private.fm_report_setting_events (
  id bigint generated always as identity primary key, facility_id uuid not null, cadence text not null,
  enabled boolean not null, actor uuid, reason text not null, recorded_at timestamptz not null default now()
);
create table private.fm_report_history (
  id bigint generated always as identity primary key, public_id uuid not null unique default gen_random_uuid(), organization_id uuid not null, facility_id uuid not null,
  cadence text not null, period_start date not null, period_end date not null, recorded_at timestamptz not null default now(),
  last_evidence_at timestamptz, opened bigint not null, completed bigint not null, visits bigint not null,
  ppm_due bigint not null, ppm_unconfirmed bigint not null, status text not null check(status in ('generated','no_activity')),
  acknowledged_by uuid, acknowledged_at timestamptz,
  unique(facility_id,cadence,period_start),
  foreign key (organization_id,facility_id) references public.facilities(organization_id,id),
  check((acknowledged_at is null) = (acknowledged_by is null))
);
create index fm_report_history_page on private.fm_report_history(facility_id,id desc);
alter table private.fm_report_schedules enable row level security;
alter table private.fm_report_setting_events enable row level security;
alter table private.fm_report_history enable row level security;
revoke all on private.fm_report_schedules,private.fm_report_setting_events,private.fm_report_history from public,anon,authenticated,service_role;
revoke all on sequence private.fm_report_setting_events_id_seq,private.fm_report_history_id_seq from public,anon,authenticated,service_role;

create function private.fm_report_role(p_site uuid) returns text
language sql stable security definer set search_path='' as $$
  select private.current_org_role(f.organization_id)::text from public.facilities f where f.id=p_site and
    (select auth.jwt()->>'aal')='aal2' and (select auth.uid()) is not null
$$;
create function private.fm_report_period_end(p_start date,p_cadence text) returns date
language sql immutable set search_path='' as $$
  select case p_cadence when 'daily' then p_start+1 when 'weekly' then p_start+7
    when 'monthly' then (p_start+interval '1 month')::date end
$$;

create function public.fm_report_schedule(p_site uuid,p_cadence text,p_enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare
  org uuid; previous boolean; d date := (now() at time zone 'Asia/Riyadh')::date; next_day date;
begin
  if private.fm_report_role(p_site) is distinct from 'owner' then raise insufficient_privilege; end if;
  if p_cadence is null or p_cadence not in ('daily','weekly','monthly') or p_enabled is null then raise invalid_parameter_value; end if;
  select organization_id into strict org from public.facilities where id=p_site;
  perform pg_advisory_xact_lock(hashtextextended(p_site::text||'/'||p_cadence,0));
  select enabled into previous from private.fm_report_schedules where facility_id=p_site and cadence=p_cadence for update;
  if coalesce(previous,false)=p_enabled then return p_enabled; end if;
  if p_enabled then
    next_day:=case p_cadence when 'daily' then d+1 when 'weekly' then d+7-extract(dow from d)::integer
      when 'monthly' then (date_trunc('month',d::timestamp)+interval '1 month')::date end;
  end if;
  insert into private.fm_report_schedules(organization_id,facility_id,cadence,enabled,next_start,changed_by)
    values(org,p_site,p_cadence,p_enabled,next_day,auth.uid())
    on conflict(facility_id,cadence) do update set enabled=excluded.enabled,next_start=excluded.next_start,
      changed_by=excluded.changed_by,changed_at=now(),last_result=null,retry_after=null;
  insert into private.fm_report_setting_events(facility_id,cadence,enabled,actor,reason)
    values(p_site,p_cadence,p_enabled,auth.uid(),'owner_setting');
  return p_enabled;
end $$;

create function private.fm_generate_facility_reports() returns integer
language plpgsql security definer set search_path='' as $$
declare
  local_now timestamp := statement_timestamp() at time zone 'Asia/Riyadh';
  s private.fm_report_schedules%rowtype;
  end_day date; lower_bound timestamptz; upper_bound timestamptz;
  order_open bigint; order_done bigint; visit_count bigint; due_count bigint; misses bigint;
  latest_order timestamptz; latest_visit timestamptz; latest_issue timestamptz; result text; inserted integer; total integer:=0;
begin
  if local_now::time < time '08:00' then return 0; end if;
  for s in select * from private.fm_report_schedules x where x.enabled and
    private.fm_report_period_end(x.next_start,x.cadence)<=local_now::date and
    (x.retry_after is null or x.retry_after<=statement_timestamp())
    order by x.next_start,x.facility_id,x.cadence limit 100 for update skip locked
  loop
    begin
      if not exists(select 1 from public.organization_members m where m.organization_id=s.organization_id
          and m.user_id=s.changed_by and m.active and m.role='owner') then
        update private.fm_report_schedules set enabled=false,next_start=null,last_result='owner_inactive',changed_at=now()
          where facility_id=s.facility_id and cadence=s.cadence;
        insert into private.fm_report_setting_events(facility_id,cadence,enabled,actor,reason)
          values(s.facility_id,s.cadence,false,null,'owner_inactive');
        continue;
      end if;
      end_day:=private.fm_report_period_end(s.next_start,s.cadence);
      lower_bound:=s.next_start::timestamp at time zone 'Asia/Riyadh';
      upper_bound:=end_day::timestamp at time zone 'Asia/Riyadh';

      select count(*) filter(where w.created_at>=lower_bound and w.created_at<upper_bound),
        count(*) filter(where w.completed_at>=lower_bound and w.completed_at<upper_bound),
        greatest(max(w.created_at) filter(where w.created_at>=lower_bound and w.created_at<upper_bound),
          max(w.completed_at) filter(where w.completed_at>=lower_bound and w.completed_at<upper_bound))
        into order_open,order_done,latest_order from public.facility_assets a join public.facility_work_orders w
          on (w.organization_id,w.asset_id)=(a.organization_id,a.id) where a.organization_id=s.organization_id
          and a.facility_id=s.facility_id and ((w.created_at>=lower_bound and w.created_at<upper_bound)
            or (w.completed_at>=lower_bound and w.completed_at<upper_bound));
      select count(*),max(v.created_at) into visit_count,latest_visit from public.facility_visits v
        join public.facility_work_orders w on (w.organization_id,w.id)=(v.organization_id,v.work_order_id)
        join public.facility_assets a on (a.organization_id,a.id)=(w.organization_id,w.asset_id)
        where v.organization_id=s.organization_id and a.facility_id=s.facility_id
          and v.created_at>=lower_bound and v.created_at<upper_bound;
      select count(*),count(*) filter(where w.completed_at is null or
          (w.completed_at at time zone 'Asia/Riyadh')::date>o.due_on),max(o.issued_at)
        into due_count,misses,latest_issue from public.facility_pm_occurrences o
        left join public.facility_work_orders w on (w.organization_id,w.id)=(o.organization_id,o.work_order_id)
        where o.organization_id=s.organization_id and o.facility_id=s.facility_id and o.due_on>=s.next_start and o.due_on<end_day;
      result:=case when order_open+order_done+visit_count+due_count=0 then 'no_activity' else 'generated' end;
      insert into private.fm_report_history(organization_id,facility_id,cadence,period_start,period_end,last_evidence_at,
        opened,completed,visits,ppm_due,ppm_unconfirmed,status)
        values(s.organization_id,s.facility_id,s.cadence,s.next_start,end_day-1,greatest(latest_order,latest_visit,latest_issue),
          order_open,order_done,visit_count,due_count,misses,result)
        on conflict(facility_id,cadence,period_start) do nothing;
      get diagnostics inserted=row_count;
      total:=total+inserted;
      update private.fm_report_schedules set next_start=end_day,last_result=result,retry_after=null
        where facility_id=s.facility_id and cadence=s.cadence;
    exception when others then
      update private.fm_report_schedules set last_result='read_failed',retry_after=statement_timestamp()+interval '1 hour'
        where facility_id=s.facility_id and cadence=s.cadence;
      raise warning 'Facility report generation deferred (SQLSTATE %)', sqlstate;
    end;
  end loop;
  return total;
end $$;

create function public.fm_report_history(p_site uuid,p_before uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor_role text:=private.fm_report_role(p_site);
begin
  if actor_role is null or actor_role not in ('owner','approver') then raise insufficient_privilege; end if;
  return jsonb_build_object('can_configure',actor_role='owner','schedules',coalesce(
    (select jsonb_agg(jsonb_build_object('cadence',s.cadence,'enabled',s.enabled,'next_start',s.next_start,'state',s.last_result)
      order by s.cadence) from private.fm_report_schedules s where s.facility_id=p_site),'[]'::jsonb),
    'reports',coalesce((select jsonb_agg(to_jsonb(h)-'sort' order by h.sort desc) from (
      select r.public_id id,r.id sort,r.cadence,r.period_start,r.period_end,r.recorded_at,r.last_evidence_at,
        r.opened,r.completed,r.visits,r.ppm_due,r.ppm_unconfirmed,r.status,r.acknowledged_at
        from private.fm_report_history r where r.facility_id=p_site and (p_before is null or r.id<(select c.id from private.fm_report_history c where c.facility_id=p_site and c.public_id=p_before))
        order by r.id desc limit 21)h),'[]'::jsonb));
end $$;

create function public.fm_report_acknowledge(p_site uuid,p_report uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor_role text:=private.fm_report_role(p_site);
begin
  if actor_role is null or actor_role not in ('owner','approver') then raise insufficient_privilege; end if;
  update private.fm_report_history set acknowledged_by=auth.uid(),acknowledged_at=now()
    where public_id=p_report and facility_id=p_site and ppm_unconfirmed>0 and acknowledged_at is null;
  return exists(select 1 from private.fm_report_history where public_id=p_report and facility_id=p_site and acknowledged_at is not null);
end $$;

revoke all on function private.fm_report_role(uuid),private.fm_report_period_end(date,text),private.fm_generate_facility_reports()
  from public,anon,authenticated,service_role;
revoke all on function public.fm_report_schedule(uuid,text,boolean),public.fm_report_history(uuid,uuid),public.fm_report_acknowledge(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.fm_report_schedule(uuid,text,boolean),public.fm_report_history(uuid,uuid),public.fm_report_acknowledge(uuid,uuid) to authenticated;

do $$
declare job record; task constant text:='select private.fm_generate_facility_reports()';
begin
  select * into job from cron.job where jobname='osoul-opt-in-facility-reports';
  if found then
    if job.schedule <> '10 * * * *' or job.command <> task or job.username <> current_user then
      raise exception 'Conflicting facility report job name';
    end if;
  else
    perform cron.schedule('osoul-opt-in-facility-reports','10 * * * *',task);
  end if;
end $$;
