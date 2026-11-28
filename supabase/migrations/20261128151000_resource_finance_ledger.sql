begin;

-- One append-only revision chain per facility, month, meter/unit and measurement kind.
create table private.fm_monthly_evidence (
  organization_id uuid not null,
  facility_id uuid not null,
  period_month date not null check (extract(day from period_month) = 1),
  kind text not null check (kind in ('electricity_kwh','water_m3','unit_finance_sar')),
  subject text not null check (length(subject) between 1 and 80 and btrim(subject)=subject),
  revision integer not null check(revision > 0),
  covered_days integer not null check(covered_days between 1 and extract(day from period_month + interval '1 month - 1 day')),
  consumption numeric(16,3),
  net_revenue numeric(16,2),
  other_direct_cost numeric(16,2),
  maintenance_cost numeric(16,2),
  downtime_days numeric(6,2),
  source_reference text not null check(length(btrim(source_reference)) between 2 and 400),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (facility_id, period_month, kind, subject, revision),
  foreign key (organization_id,facility_id) references public.facilities(organization_id,id),
  check(consumption is null or (consumption >= 0 and consumption < 'Infinity'::numeric)),
  check(other_direct_cost is null or (other_direct_cost >= 0 and other_direct_cost < 'Infinity'::numeric)),
  check(maintenance_cost is null or (maintenance_cost >= 0 and maintenance_cost < 'Infinity'::numeric)),
  check(net_revenue is null or net_revenue between -99999999999999.99 and 99999999999999.99),
  check(downtime_days is null or downtime_days between 0 and covered_days),
  check((kind in ('electricity_kwh','water_m3') and consumption is not null
    and num_nonnulls(net_revenue,other_direct_cost,maintenance_cost,downtime_days)=0)
    or (kind='unit_finance_sar' and consumption is null
    and num_nonnulls(net_revenue,other_direct_cost,maintenance_cost,downtime_days)>0))
);
alter table private.fm_monthly_evidence enable row level security;
revoke all on private.fm_monthly_evidence from public, anon, authenticated;

create function public.fm_record_monthly_evidence(
  p_org uuid, p_site uuid, p_month date, p_kind text, p_subject text, p_expected integer,
  p_covered_days integer, p_reference text, p_consumption numeric default null,
  p_revenue numeric default null,p_other_cost numeric default null,p_maintenance numeric default null,p_downtime numeric default null
) returns integer language plpgsql security definer set search_path='' as $$
declare current_revision integer; subject_key text := btrim(p_subject); today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  if auth.uid() is null or auth.jwt()->>'aal' is distinct from 'aal2'
    or coalesce(private.current_org_role(p_org)::text,'') not in ('owner','approver')
    or not exists (select 1 from public.facilities where id=p_site and organization_id=p_org)
    then raise exception 'Facility access unavailable' using errcode='42501'; end if;
  if p_month is null or p_month>today or p_covered_days>today-p_month+1 or p_expected is null or p_expected<0
    then raise exception 'Invalid month, coverage or revision' using errcode='22023'; end if;
  -- Serialize check-and-append without updating or deleting the prior evidence.
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_site,p_month,p_kind,subject_key),0));
  select coalesce(max(m.revision),0) into current_revision from private.fm_monthly_evidence m
    where m.facility_id=p_site and m.period_month=p_month and m.kind=p_kind and m.subject=subject_key;
  if p_expected<>current_revision then raise exception 'Source revision changed' using errcode='40001'; end if;
  insert into private.fm_monthly_evidence(organization_id,facility_id,period_month,kind,subject,revision,
    covered_days,source_reference,consumption,net_revenue,other_direct_cost,maintenance_cost,downtime_days,recorded_by)
    values(p_org,p_site,p_month,p_kind,subject_key,current_revision+1,p_covered_days,btrim(p_reference),p_consumption,
    p_revenue,p_other_cost,p_maintenance,p_downtime,auth.uid());
  return current_revision+1;
end $$;

create function public.fm_read_monthly_evidence(p_org uuid,p_site uuid,p_month date,p_offset integer default 0)
returns table(period_month date,kind text,subject text,revision integer,covered_days integer,source_reference text,
 consumption numeric,net_revenue numeric,other_direct_cost numeric,maintenance_cost numeric,downtime_days numeric,recorded_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or auth.jwt()->>'aal' is distinct from 'aal2'
    or coalesce(private.current_org_role(p_org)::text,'') not in ('owner','approver')
    or not exists(select 1 from public.facilities where id=p_site and organization_id=p_org)
    then raise exception 'Facility access unavailable' using errcode='42501'; end if;
  if p_month is null or extract(day from p_month)<>1 or p_offset is null or p_offset<0
    then raise exception 'Invalid month or offset' using errcode='22023'; end if;
  return query select distinct on(m.period_month,m.kind,m.subject)
    m.period_month,m.kind,m.subject,m.revision,m.covered_days,m.source_reference,m.consumption,m.net_revenue,
    m.other_direct_cost,m.maintenance_cost,m.downtime_days,m.recorded_at
    from private.fm_monthly_evidence m where m.facility_id=p_site and m.organization_id=p_org
    and m.period_month between (p_month-interval '1 month')::date and p_month
    order by m.period_month,m.kind,m.subject,m.revision desc limit 100 offset p_offset;
end $$;
revoke all on function public.fm_record_monthly_evidence(uuid,uuid,date,text,text,integer,integer,text,numeric,numeric,numeric,numeric,numeric),
 public.fm_read_monthly_evidence(uuid,uuid,date,integer) from public,anon,authenticated;
grant execute on function public.fm_record_monthly_evidence(uuid,uuid,date,text,text,integer,integer,text,numeric,numeric,numeric,numeric,numeric),
 public.fm_read_monthly_evidence(uuid,uuid,date,integer) to authenticated;
commit;
