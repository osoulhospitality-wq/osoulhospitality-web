begin;

-- A backfilled business day is not evidence that a forecast was issued on that day.
-- Existing snapshots retain their operational history. Without a receipt they are unscored.
alter table private.facility_council_monitor_snapshots add column published_at timestamptz;
create function private.stamp_council_forecast_publication() returns trigger
language plpgsql set search_path='' as $$
begin
  new.published_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.stamp_council_forecast_publication() from public,anon,authenticated;
create trigger council_forecast_publication before insert on private.facility_council_monitor_snapshots
  for each row execute function private.stamp_council_forecast_publication();
create trigger council_forecast_append_only before update or delete on private.facility_council_monitor_snapshots
  for each row execute function private.draqon_event_immutable();

create function public.facility_council_forecast_scores(p_org uuid,p_facility uuid)
returns table(metric text,target_month date,status text,unit text,estimate numeric,actual numeric,
 signed_error numeric,absolute_error numeric,baseline_estimate numeric,baseline_absolute_error numeric,
 snapshot_id uuid,forecast_at timestamptz,method text,rule_version text,forecast_observation_ids jsonb,
 actual_source_ref text,actual_observation_id uuid,actual_verified_at timestamptz,
 resolution_id uuid,actual_decided_at timestamptz,actual_evidence_ids uuid[])
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or (auth.jwt()->>'aal') is distinct from 'aal2'
    or not coalesce(private.can_write_org(p_org),false)
    or not exists(select from public.facilities f where f.organization_id=p_org and f.id=p_facility)
  then raise insufficient_privilege; end if;

  return query
  with scoped as (
    select s.id,s.business_day,s.rule_version,s.published_at,s.facts,date_trunc('month',s.business_day::timestamp)::date period
    from private.facility_council_monitor_snapshots s
    where s.organization_id=p_org and s.facility_id=p_facility
      and s.observed_at<=s.published_at and s.published_at<=statement_timestamp()
      and (s.observed_at at time zone 'Asia/Riyadh')::date=s.business_day
      -- A run finalized after the close, even at midnight, was unavailable for forward evaluation.
      and date_trunc('month',s.published_at at time zone 'Asia/Riyadh')::date=date_trunc('month',s.business_day::timestamp)::date
  ), items as (
    select s.*,j.item,m.metric key,m.unit measure,
      count(*) over(partition by s.id,m.metric) item_count
    from scoped s cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.facts->'outlook')='array' then s.facts->'outlook' else '[]'::jsonb end) j(item)
    join private.facility_council_metric_catalog() m on m.metric=j.item->>'metric'
  ), earliest as (
    select distinct on (i.period,i.key) i.*
    from items i where i.item_count=1 and i.item->>'status'='forecast'
      and i.item->>'asOf'=to_char(i.business_day,'YYYY-MM-DD')
      and i.item->>'nextMonth'=to_char(i.period,'YYYY-MM')
      and i.item->>'historyEnd'=to_char(i.period-interval '1 month','YYYY-MM')
      and i.item->>'horizonMonths'='1' and jsonb_typeof(i.item->'estimate')='number'
      and jsonb_typeof(i.item->'observationIds')='array' and i.item->'observationIds'<>'[]'::jsonb
    order by i.period,i.key,i.published_at,i.id
  ), paired as (
    select e.*,m.observation_id,m.verified_at,m.resolution_id,m.decided_at,m.evidence,m.source_ref,
      case when m.status='conflict' then 'conflict'
           when m.status in ('verified','resolved') and m.verified_at>e.published_at
            and m.verified_at<=statement_timestamp() and (m.decided_at is null or m.decided_at<=statement_timestamp())
            and m.month<date_trunc('month',statement_timestamp() at time zone 'Asia/Riyadh')::date then 'settled'
           else 'pending' end stage,
      m.value actual_value,
      (e.item->>'estimate')::numeric forecast_value,
      case when jsonb_typeof(e.item->'lastValue')='number' then (e.item->>'lastValue')::numeric end baseline_value
    from earliest e left join public.facility_council_monthly m on m.organization_id=p_org and m.facility_id=p_facility
       and m.metric=e.key and m.month=e.period
  )
  select p.key,p.period,p.stage,p.measure,p.forecast_value,
    case when p.stage='settled' then p.actual_value end,
    case when p.stage='settled' then p.actual_value-p.forecast_value end,
    case when p.stage='settled' then abs(p.actual_value-p.forecast_value) end,
    p.baseline_value,case when p.stage='settled' then abs(p.actual_value-p.baseline_value) end,
    p.id,p.published_at,p.item->>'method',p.rule_version,p.item->'observationIds',
    case when p.stage='settled' then p.source_ref end,case when p.stage='settled' then p.observation_id end,
    case when p.stage='settled' then p.verified_at end,case when p.stage='settled' then p.resolution_id end,
    case when p.stage='settled' then p.decided_at end,
    array(select (v->>'id')::uuid from jsonb_array_elements(p.evidence) v order by v->>'id')
  from paired p order by p.period desc,p.key;
end;
$$;
revoke all on function public.facility_council_forecast_scores(uuid,uuid) from public,anon,authenticated;
grant execute on function public.facility_council_forecast_scores(uuid,uuid) to authenticated;
commit;
