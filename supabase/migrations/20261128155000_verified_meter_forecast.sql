begin;
create table private.fm_meter_verifications (
  facility_id uuid not null, period_month date not null,
  kind text not null check(kind in ('electricity_kwh','water_m3')), subject text not null,
  revision integer not null, reviewed_by uuid not null references auth.users(id),
  verified_at timestamptz not null default clock_timestamp(),
  primary key(facility_id,period_month,kind,subject,revision),
  foreign key(facility_id,period_month,kind,subject,revision) references private.fm_monthly_evidence(facility_id,period_month,kind,subject,revision)
);
alter table private.fm_meter_verifications enable row level security;
revoke all on private.fm_meter_verifications from public,anon,authenticated;

create function public.fm_verify_meter_revision(p_org uuid,p_site uuid,p_month date,p_kind text,p_subject text,p_revision integer)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or auth.jwt()->>'aal' is distinct from 'aal2'
    or coalesce(private.current_org_role(p_org)::text,'') not in ('owner','approver')
    or p_kind not in ('electricity_kwh','water_m3') or p_kind is null
    or not exists(select 1 from public.facilities where organization_id=p_org and id=p_site)
    then raise exception 'Meter verification unavailable' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_site,p_month,p_kind,p_subject),0));
  if not exists(select 1 from private.fm_monthly_evidence m where m.organization_id=p_org and m.facility_id=p_site
    and m.kind=p_kind and m.subject=p_subject and m.period_month=p_month and m.revision=p_revision
    and m.recorded_by<>auth.uid() and m.covered_days=extract(day from m.period_month+interval '1 month - 1 day')
    and m.period_month<date_trunc('month',now() at time zone 'Asia/Riyadh')::date
    and not exists(select 1 from private.fm_monthly_evidence n where n.facility_id=m.facility_id and n.kind=m.kind
      and n.subject=m.subject and n.period_month=m.period_month and n.revision>m.revision))
    then raise exception 'Revision unavailable for independent verification' using errcode='42501';end if;
  insert into private.fm_meter_verifications(facility_id,period_month,kind,subject,revision,reviewed_by)
    values(p_site,p_month,p_kind,p_subject,p_revision,auth.uid()) on conflict do nothing;
  return true;
end $$;

create function public.fm_meter_forecast_history(p_org uuid,p_site uuid,p_month date,p_kind text,p_subject text)
returns table(period_month date,kind text,subject text,revision integer,covered_days integer,consumption numeric,
 recorded_at timestamptz,verified_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or auth.jwt()->>'aal' is distinct from 'aal2'
    or coalesce(private.current_org_role(p_org)::text,'') not in ('owner','approver')
    or not exists(select 1 from public.facilities where id=p_site and organization_id=p_org)
    then raise exception 'Facility access unavailable' using errcode='42501';end if;
  if p_kind is null or p_kind not in ('electricity_kwh','water_m3') or p_subject is null or p_month is null
    or extract(day from p_month)<>1 or p_month>date_trunc('month',now() at time zone 'Asia/Riyadh')::date
    then raise exception 'Invalid meter or period' using errcode='22023';end if;
  return query select m.period_month,m.kind,m.subject,m.revision,m.covered_days,m.consumption,m.recorded_at,v.verified_at
    from private.fm_monthly_evidence m left join private.fm_meter_verifications v
      using(facility_id,period_month,kind,subject,revision)
    where m.organization_id=p_org and m.facility_id=p_site and m.kind=p_kind and m.subject=p_subject and
      m.period_month between (p_month-interval '35 months')::date and p_month
    order by m.period_month,m.revision limit 251;
end $$;
revoke all on function public.fm_verify_meter_revision(uuid,uuid,date,text,text,integer),
 public.fm_meter_forecast_history(uuid,uuid,date,text,text) from public,anon,authenticated;
grant execute on function public.fm_verify_meter_revision(uuid,uuid,date,text,text,integer),
 public.fm_meter_forecast_history(uuid,uuid,date,text,text) to authenticated;
commit;
