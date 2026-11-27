begin;

-- No enrolment rows or threshold values are seeded. A named internal job may
-- collect evidence only for a site explicitly enabled by its authorized owner.
create table private.facility_council_monitor_enrolments (
  organization_id uuid not null, facility_id uuid not null, enabled boolean not null,
  changed_by uuid not null references auth.users(id), changed_at timestamptz not null default clock_timestamp(),
  primary key(organization_id,facility_id),
  foreign key(organization_id,facility_id) references public.facilities(organization_id,id)
);
create table private.facility_council_monitor_limits (
  organization_id uuid not null, facility_id uuid not null, metric text not null,
  min_value numeric, max_value numeric, changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default clock_timestamp(),
  primary key(organization_id,facility_id,metric),
  foreign key(organization_id,facility_id) references private.facility_council_monitor_enrolments,
  check(min_value is not null or max_value is not null),
  check(min_value is null or min_value::text not in ('NaN','Infinity','-Infinity')),
  check(max_value is null or max_value::text not in ('NaN','Infinity','-Infinity')),
  check(min_value is null or max_value is null or min_value<=max_value)
);
create table private.facility_council_monitor_snapshots (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, facility_id uuid not null,
  business_day date not null, observed_at timestamptz not null,
  run_source text not null check(run_source in('scheduled','manual')), requested_by uuid references auth.users(id),
  rule_version text not null, facts jsonb not null,
  unique(organization_id,facility_id,business_day),
  foreign key(organization_id,facility_id) references private.facility_council_monitor_enrolments
);
create table private.facility_council_monitor_failures (
  organization_id uuid not null,facility_id uuid not null,business_day date not null,
  attempts int not null,last_attempt timestamptz not null,last_code text not null,recovered_at timestamptz,
  primary key(organization_id,facility_id,business_day),
  foreign key(organization_id,facility_id) references private.facility_council_monitor_enrolments
);
alter table private.facility_council_monitor_enrolments enable row level security;
alter table private.facility_council_monitor_limits enable row level security;
alter table private.facility_council_monitor_snapshots enable row level security;
alter table private.facility_council_monitor_failures enable row level security;
revoke all on private.facility_council_monitor_enrolments,private.facility_council_monitor_snapshots,
  private.facility_council_monitor_limits,private.facility_council_monitor_failures from public,anon,authenticated,service_role;

create function public.facility_council_monitor_set(p_org uuid,p_facility uuid,p_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform private.draqon_assert_field_actor(p_org,true);
  if p_enabled is null then raise exception 'Explicit consent required' using errcode='22023'; end if;
  if not exists(select from public.facilities where organization_id=p_org and id=p_facility) then raise insufficient_privilege; end if;
  insert into private.facility_council_monitor_enrolments as e(organization_id,facility_id,enabled,changed_by)
    values(p_org,p_facility,p_enabled,auth.uid()) on conflict(organization_id,facility_id)
    do update set enabled=excluded.enabled,changed_by=excluded.changed_by,changed_at=clock_timestamp()
    where e.enabled is distinct from excluded.enabled;
  return p_enabled;
end $$;
create function public.facility_council_monitor_limit(p_org uuid,p_facility uuid,p_metric text,p_min numeric,p_max numeric)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.draqon_assert_field_actor(p_org,true);
  perform 1 from private.facility_council_monitor_enrolments where organization_id=p_org and facility_id=p_facility and enabled for update;
  if not found then raise exception 'Monitoring is disabled at this site' using errcode='55000'; end if;
  if not exists(select from private.facility_council_metric_catalog() m where m.metric=p_metric) then
    raise exception 'Unknown metric' using errcode='22023';
  end if;
  if (p_min is not null and not private.facility_council_valid_value(p_metric,p_min)) or
     (p_max is not null and not private.facility_council_valid_value(p_metric,p_max)) then
    raise exception 'Threshold is outside the admissible metric domain' using errcode='22023';
  end if;
  if p_min is null and p_max is null then
    delete from private.facility_council_monitor_limits where organization_id=p_org and facility_id=p_facility and metric=p_metric;
  else
    insert into private.facility_council_monitor_limits(organization_id,facility_id,metric,min_value,max_value,changed_by)
      values(p_org,p_facility,p_metric,p_min,p_max,auth.uid()) on conflict(organization_id,facility_id,metric)
      do update set min_value=excluded.min_value,max_value=excluded.max_value,changed_by=excluded.changed_by,changed_at=clock_timestamp();
  end if;
end $$;

create function private.facility_council_monitor_capture(p_org uuid,p_facility uuid,p_source text,p_clock timestamptz,p_actor uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  day_local date := (p_clock at time zone 'Asia/Riyadh')::date;
  target_month date := (date_trunc('month',day_local::timestamp)-interval '1 month')::date;
  result uuid; evidence jsonb;
begin
  -- Same lock serializes disabling, changing a threshold and taking a snapshot.
  perform 1 from private.facility_council_monitor_enrolments where organization_id=p_org and facility_id=p_facility and enabled for update;
  if not found then return null; end if;
  select id into result from private.facility_council_monitor_snapshots where organization_id=p_org and facility_id=p_facility and business_day=day_local;
  if found then return result; end if;

  with plan as (
    select id,next_due_on from public.facility_pm_plans where organization_id=p_org and facility_id=p_facility and paused_at is null
  ), due as (
    select count(*) as plans,count(*) filter(where next_due_on<=day_local) as due_count,
      count(*) filter(where next_due_on<day_local) as overdue_count,min(next_due_on) as earliest from plan
  ), m as materialized (
    select metric,month,status,value,observation_id from public.facility_council_monthly
    where organization_id=p_org and facility_id=p_facility and month<=target_month
  ), current_month as (
    select * from m where month=target_month
  ), health as (
    select (select count(*) from private.facility_council_metric_catalog()) as expected,
      (select max(month) from m) as latest_month,
      (select max(month) from m where status in ('verified','resolved')) as latest_verified,
      count(*) filter(where status in ('verified','resolved')) as verified,
      count(*) filter(where status='conflict') as conflicts,
      (select count(*) from m where status='conflict') as historical_conflicts from current_month
  ), breach as (
    select m.metric,m.month,m.value,m.observation_id,
      case when m.value<l.min_value then 'metric_below_minimum' else 'metric_above_maximum' end as code,
      case when m.value<l.min_value then l.min_value else l.max_value end as bound
    from current_month m join private.facility_council_monitor_limits l on l.organization_id=p_org and l.facility_id=p_facility and l.metric=m.metric
      where m.status in ('verified','resolved') and (m.value<l.min_value or m.value>l.max_value)
  ), outlook as materialized (
    select private.facility_council_outlook(p_org,p_facility,day_local) as items
  ), projected as (
    select v.item,l.min_value,l.max_value,(v.item->>'estimate')::numeric as estimate
    from outlook o cross join lateral jsonb_array_elements(o.items) v(item)
    join private.facility_council_monitor_limits l on l.organization_id=p_org and l.facility_id=p_facility and l.metric=v.item->>'metric'
    where v.item->>'status'='forecast' and jsonb_typeof(v.item->'estimate')='number'
  ), signals as (
    select 1 as pos,jsonb_build_object('code','pm_due','count',due_count) as signal from due where due_count>0
    union all select 2,jsonb_build_object('code','pm_overdue','count',overdue_count) from due where overdue_count>0
    union all select 3,jsonb_build_object('code','monthly_missing','month',target_month) from health where latest_month is distinct from target_month
    union all select 4,jsonb_build_object('code','monthly_partial','verified',verified,'expected',expected) from health where latest_month=target_month and verified<expected
    union all select 5,jsonb_build_object('code','monthly_conflicts','count',historical_conflicts) from health where historical_conflicts>0
    union all select 6,jsonb_build_object('code',code,'metric',metric,'value',value,'bound',bound,'month',month,'observationId',observation_id) from breach
    union all select 7,jsonb_build_object('code',case when estimate<min_value then 'forecast_below_minimum' else 'forecast_above_maximum' end,
      'metric',item->>'metric','estimate',estimate,'bound',case when estimate<min_value then min_value else max_value end,
      'nextMonth',item->'nextMonth','sourceFrom',item->'historyStart','sourceThrough',item->'historyEnd','method',item->'method',
      'mae',item->'mae','baselineMae',item->'baselineMae','observationIds',item->'observationIds')
      from projected where estimate<min_value or estimate>max_value
  )
  select jsonb_build_object('outlook',(select items from outlook),'activePlans',d.plans,'duePlans',d.due_count,'overduePlans',d.overdue_count,'earliestDue',d.earliest,
    'latestClosedMonth',h.latest_month,'latestVerifiedMonth',h.latest_verified,'sourceHealth',
    jsonb_build_object('expectedMonth',target_month,'expectedMetrics',h.expected,'verifiedMetrics',h.verified,
      'currentConflicts',h.conflicts,'historicalConflicts',h.historical_conflicts,'state',
      case when h.latest_month is null then 'no_records' when h.latest_month<>target_month then 'outdated'
           when h.conflicts>0 then 'conflict' when h.verified<h.expected then 'partial' else 'verified' end),
    'signals',coalesce((select jsonb_agg(signal order by pos,signal->>'metric') from signals),'[]'::jsonb)
  ) into evidence from due d cross join health h;
  insert into private.facility_council_monitor_snapshots(organization_id,facility_id,business_day,observed_at,run_source,requested_by,rule_version,facts)
  values(p_org,p_facility,day_local,p_clock,p_source,p_actor,'site-daily-v1',evidence) returning id into result;
  update private.facility_council_monitor_failures set recovered_at=p_clock
    where organization_id=p_org and facility_id=p_facility and business_day=day_local and recovered_at is null;
  return result;
end $$;

create function public.facility_council_monitor_run(p_org uuid,p_facility uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  perform private.draqon_assert_field_actor(p_org,true);
  if not exists(select from public.facilities where organization_id=p_org and id=p_facility) then raise insufficient_privilege; end if;
  result:=private.facility_council_monitor_capture(p_org,p_facility,'manual',clock_timestamp(),auth.uid());
  if result is null then raise exception 'Monitoring is disabled at this site' using errcode='55000'; end if;
  return result;
end $$;

create function private.facility_council_monitor_tick() returns jsonb
language plpgsql security definer set search_path='' as $$
declare e record; instant timestamptz:=clock_timestamp(); day_local date:=(instant at time zone 'Asia/Riyadh')::date;
  recorded int:=0; errors int:=0;
begin
  -- A failed site is retried next tick. Concurrent workers skip occupied site rows.
  for e in select s.organization_id,s.facility_id from private.facility_council_monitor_enrolments s
    where s.enabled and not exists(select 1 from private.facility_council_monitor_snapshots h
      where h.organization_id=s.organization_id and h.facility_id=s.facility_id and h.business_day=day_local)
    order by s.organization_id,s.facility_id for update of s skip locked
  loop
    begin
      if private.facility_council_monitor_capture(e.organization_id,e.facility_id,'scheduled',instant,null) is not null then recorded:=recorded+1; end if;
    exception when others then
      errors:=errors+1;
      insert into private.facility_council_monitor_failures as f(organization_id,facility_id,business_day,attempts,last_attempt,last_code)
      values(e.organization_id,e.facility_id,day_local,1,instant,sqlstate)
      on conflict(organization_id,facility_id,business_day) do update set attempts=f.attempts+1,last_attempt=excluded.last_attempt,last_code=excluded.last_code,recovered_at=null;
    end;
  end loop;
  return jsonb_build_object('businessDay',day_local,'recorded',recorded,'failed',errors);
end $$;

-- Registration is optional; untouched unrelated jobs are never unscheduled. Only
-- the database operator may install the hook. Installing does not enrol any site.
create function private.facility_council_monitor_scheduler(p_install boolean default false)
returns text language plpgsql security definer set search_path='' as $$
declare job_active boolean; matches boolean;
begin
  if not exists(select 1 from pg_catalog.pg_extension where extname='pg_cron') or to_regclass('cron.job') is null
    then return 'unavailable'; end if;
  execute 'select active,command=$2 and schedule=$3 and username=current_user from cron.job where jobname=$1 limit 1'
    into job_active,matches using 'draqon-facility-council-daily','select private.facility_council_monitor_tick();','17 * * * *';
  if matches is not null then return case when matches and job_active then 'installed' else 'not_installed' end; end if;
  if p_install then
    perform cron.schedule('draqon-facility-council-daily','17 * * * *','select private.facility_council_monitor_tick();');
    return 'installed';
  end if;
  return 'not_installed';
exception when insufficient_privilege or undefined_function or undefined_column or invalid_schema_name or object_not_in_prerequisite_state or feature_not_supported then
  return 'unavailable';
end $$;

create function public.facility_council_monitor_status(p_org uuid,p_facility uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e private.facility_council_monitor_enrolments; history jsonb; limits jsonb; failure jsonb;
begin
  if auth.uid() is null or (auth.jwt()->>'aal') is distinct from 'aal2' or not coalesce(private.can_write_org(p_org),false)
    or not exists(select 1 from public.facilities where organization_id=p_org and id=p_facility) then raise insufficient_privilege; end if;
  select * into e from private.facility_council_monitor_enrolments where organization_id=p_org and facility_id=p_facility;
  select coalesce(jsonb_agg(r.item order by r.day desc),'[]'::jsonb) into history from (
    select business_day as day,facts||jsonb_build_object('id',id,'businessDay',business_day,'observedAt',observed_at,
      'runSource',run_source,'ruleVersion',rule_version) as item from private.facility_council_monitor_snapshots
    where organization_id=p_org and facility_id=p_facility order by business_day desc limit 14
  ) r;
  select coalesce(jsonb_agg(jsonb_build_object('metric',metric,'minimum',min_value,'maximum',max_value) order by metric),'[]'::jsonb) into limits
    from private.facility_council_monitor_limits where organization_id=p_org and facility_id=p_facility;
  select jsonb_build_object('businessDay',business_day,'attempts',attempts,'lastAttempt',last_attempt,'recoveredAt',recovered_at) into failure
    from private.facility_council_monitor_failures where organization_id=p_org and facility_id=p_facility order by business_day desc limit 1;
  return jsonb_build_object('enabled',coalesce(e.enabled,false),'canManage',coalesce(private.can_approve_org(p_org),false),
    'changedAt',e.changed_at,'scheduler',private.facility_council_monitor_scheduler(false),'timezone','Asia/Riyadh','ruleVersion','site-daily-v1',
    'limits',limits,'metrics',(select jsonb_agg(jsonb_build_object('metric',metric,'unit',unit) order by metric) from private.facility_council_metric_catalog()),
    'latest',history->0,'history',history,'lastFailure',failure);
end $$;
revoke all on function private.facility_council_monitor_capture(uuid,uuid,text,timestamptz,uuid),private.facility_council_monitor_tick(),
  private.facility_council_monitor_scheduler(boolean) from public,anon,authenticated,service_role;
revoke all on function public.facility_council_monitor_set(uuid,uuid,boolean),public.facility_council_monitor_limit(uuid,uuid,text,numeric,numeric),
  public.facility_council_monitor_run(uuid,uuid),public.facility_council_monitor_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.facility_council_monitor_set(uuid,uuid,boolean),public.facility_council_monitor_limit(uuid,uuid,text,numeric,numeric),
  public.facility_council_monitor_run(uuid,uuid),public.facility_council_monitor_status(uuid,uuid) to authenticated;
select private.facility_council_monitor_scheduler(true);
commit;
