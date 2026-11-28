begin;

create table private.fm_facility_revenue_reports (
  organization_id uuid not null, client_id uuid not null, facility_id uuid not null, site_code text not null,
  cadence text not null check (cadence in ('daily','weekly')),
  as_of date not null, period_start date not null, period_end date not null,
  revision integer not null check (revision>0), observed_at timestamptz not null default clock_timestamp(),
  report jsonb not null,
  primary key (organization_id,facility_id,cadence,as_of,period_start,revision),
  foreign key (organization_id,client_id,facility_id,site_code)
    references private.fm_client_sites(organization_id,client_id,facility_id,code),
  check(period_end=period_start+case cadence when 'weekly' then 6 else 0 end)
);
alter table private.fm_facility_revenue_reports enable row level security;
revoke all on private.fm_facility_revenue_reports from public,anon,authenticated,service_role;
grant select on private.fm_facility_revenue_reports to authenticated;
create policy owner_read on private.fm_facility_revenue_reports for select to authenticated using
  ((select auth.jwt()->>'aal')='aal2' and private.current_org_role(organization_id)='owner');
create index fm_facility_revenue_history_idx on private.fm_facility_revenue_reports(organization_id,facility_id,as_of desc,period_start desc,revision desc);

-- Restricted to database operators invoking a scheduled report. No API role can write tables or use this function.
create function private.fm_store_facility_revenue_report(p_organization uuid,p_client_code text,p_site_code text,p_cadence text,p_as_of date,p_start date,p_expected_revision integer,p_report jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  client_pk uuid; site_pk uuid; old_revision integer; old_report jsonb; day_count integer;
  x jsonb; day_entry jsonb; src jsonb; ids text[] := '{}'; linked text[]; key text;
  i integer:=0; d date; min_rate numeric; max_rate numeric; target numeric; market_n integer; own_n integer; sales_n integer; demand_n integer;
begin
  if p_organization is null or p_client_code is null or p_site_code is null or p_cadence is null or p_cadence not in ('daily','weekly') or p_as_of is null or p_start is null
    or p_as_of>(clock_timestamp() at time zone 'Asia/Riyadh')::date or p_expected_revision is null or p_expected_revision<0 then raise exception 'Invalid report scope, period or revision';end if;
  day_count:=case p_cadence when 'weekly' then 7 else 1 end;
  if p_report is null or jsonb_typeof(p_report) is distinct from 'object' or octet_length(p_report::text)>150000
    or p_report-array['currency','days','sources'] <> '{}'::jsonb or p_report->>'currency' is distinct from 'SAR'
    or jsonb_typeof(p_report->'days') is distinct from 'array' or jsonb_typeof(p_report->'sources') is distinct from 'array'
    then raise exception 'Invalid report structure';end if;
  if jsonb_array_length(p_report->'days')<>day_count or jsonb_array_length(p_report->'sources')>140 then raise exception 'Report coverage mismatch';end if;
  select s.client_id,s.facility_id into strict client_pk,site_pk
    from private.fm_client_sites s join private.fm_clients c on c.id=s.client_id and c.organization_id=s.organization_id
    where c.organization_id=p_organization and c.code=p_client_code and s.code=p_site_code and coalesce(c.detail->>'simulation','false')<>'true' and coalesce(s.detail->>'simulation','false')<>'true';

  for src in select value from jsonb_array_elements(p_report->'sources') loop
    if jsonb_typeof(src) is distinct from 'object' or src-array['id','kind','label','observed_on','valid_from','valid_to','reference','terms','price_sar']<>'{}'::jsonb
      or not (src ?& array['id','kind','label','observed_on','valid_from','valid_to','reference']) or src->>'kind' is null or src->>'kind' not in ('facility','competitor','sales','demand','calendar') then raise exception 'Invalid source';end if;
    foreach key in array array['id','kind','label','observed_on','valid_from','valid_to','reference'] loop
      if jsonb_typeof(src->key) is distinct from 'string' or length(btrim(src->>key)) not between 1 and 600 then raise exception 'Missing source attribution';end if;
    end loop;
    if not(src->>'id' ~ '^[A-Za-z0-9_-]{1,64}$') or src->>'id'=any(ids) or src->>'observed_on' !~ '^\d{4}-\d{2}-\d{2}$' or src->>'valid_from' !~ '^\d{4}-\d{2}-\d{2}$' or src->>'valid_to' !~ '^\d{4}-\d{2}-\d{2}$'
       or (src->>'observed_on')::date>p_as_of or (src->>'valid_to')::date<(src->>'valid_from')::date then raise exception 'Invalid source identity or period';end if;
    if src->>'reference' !~ '^(https://[^[:space:]@]+|internal:[A-Za-z0-9_./:-]+)$'
       or src->>'reference' ~* '([?&](token|password|secret|access_token|api_key|email)=)' then raise exception 'Use a sanitized source reference';end if;
    if src->'price_sar' is not null and src->'price_sar'<>'null'::jsonb then
      if src->>'kind' not in ('facility','competitor') or jsonb_typeof(src->'price_sar') is distinct from 'number' or (src->>'price_sar')::numeric<=0 or (src->>'price_sar')::numeric>10000000
        or jsonb_typeof(src->'terms') is distinct from 'string' or length(btrim(src->>'terms')) not between 5 and 500
        or (src->>'valid_from')::date<>(src->>'valid_to')::date then raise exception 'Rate must identify exact check-in, terms and comparable all-in SAR per night';end if;
    end if;
    ids:=array_append(ids,src->>'id');
  end loop;

  for day_entry in select value from jsonb_array_elements(p_report->'days') loop
    d:=p_start+i;i:=i+1;
    if jsonb_typeof(day_entry) is distinct from 'object' or day_entry-array['date','basis','terms','demand','reason','action','source_ids','own_rate_sar','market_low_sar','market_high_sar','recommended_low_sar','recommended_high_sar','on_books_nights','on_books_room_revenue_sar','available_nights','pickup_nights','cancellations_nights']<>'{}'::jsonb
      or day_entry->>'date' is distinct from to_char(d,'YYYY-MM-DD')
      or not (day_entry ?& array['basis','demand','action','reason','source_ids'])
      or coalesce(day_entry->>'basis','') not in ('unknown','all_in_comparable')
      or coalesce(day_entry->>'demand','') not in ('unknown','low','steady','high')
      or jsonb_typeof(day_entry->'reason') is distinct from 'string' or length(btrim(day_entry->>'reason')) not between 1 and 1200
      or jsonb_typeof(day_entry->'action') is distinct from 'string' or length(btrim(day_entry->>'action')) not between 1 and 1200
      or jsonb_typeof(day_entry->'source_ids') is distinct from 'array' then raise exception 'Invalid or out-of-order daily recommendation';end if;
    select coalesce(array_agg(value),'{}') into linked from jsonb_array_elements_text(day_entry->'source_ids');
    if not(linked <@ ids) or cardinality(linked)<>(select count(distinct elem) from unnest(linked) t(elem)) then raise exception 'Unknown or repeated source reference';end if;
    foreach key in array array['own_rate_sar','market_low_sar','market_high_sar','recommended_low_sar','recommended_high_sar','on_books_nights','on_books_room_revenue_sar','available_nights','pickup_nights','cancellations_nights'] loop
      x:=day_entry->key;
      if x is not null and x<>'null'::jsonb and (jsonb_typeof(x) is distinct from 'number' or (key<>'pickup_nights' and (x::text)::numeric<0) or abs((x::text)::numeric)>100000000000
         or (key in ('on_books_nights','available_nights','pickup_nights','cancellations_nights') and trunc((x::text)::numeric)<>(x::text)::numeric) or (key in ('own_rate_sar','market_low_sar','market_high_sar','recommended_low_sar','recommended_high_sar') and (x::text)::numeric=0)) then raise exception 'Invalid financial measure';end if;
    end loop;
    sales_n:=0;demand_n:=0;market_n:=0;own_n:=0;min_rate:=null;max_rate:=null;target:=null;
    for src in select value from jsonb_array_elements(p_report->'sources') where value->>'id'=any(linked) loop
      if d not between (src->>'valid_from')::date and (src->>'valid_to')::date then raise exception 'Source does not cover check-in date';end if;
      if src->>'kind'='sales' then sales_n:=sales_n+1;end if;
      if src->>'kind' in ('demand','sales','calendar') then demand_n:=demand_n+1;end if;
      if src->>'price_sar' is not null then
        if day_entry->>'basis'<>'all_in_comparable' or src->>'terms' is distinct from day_entry->>'terms' then raise exception 'Source terms do not match daily comparison';end if;
        if src->>'kind'='competitor' then market_n:=market_n+1;min_rate:=least(min_rate,(src->>'price_sar')::numeric);max_rate:=greatest(max_rate,(src->>'price_sar')::numeric);
        else own_n:=own_n+1;target:=(src->>'price_sar')::numeric;end if;
      end if;
    end loop;
    if own_n>1 or (day_entry->>'own_rate_sar')::numeric is distinct from target
      or (day_entry->>'market_low_sar')::numeric is distinct from min_rate or (day_entry->>'market_high_sar')::numeric is distinct from max_rate
      then raise exception 'Displayed rates differ from linked comparable price evidence';end if;
    if ((day_entry->>'recommended_low_sar') is null)<>((day_entry->>'recommended_high_sar') is null)
      or (day_entry->>'recommended_high_sar')::numeric<(day_entry->>'recommended_low_sar')::numeric
      or (day_entry->>'recommended_low_sar' is not null and market_n=0) then raise exception 'Unverified suggested rate range';end if;
    if ((day_entry->>'on_books_nights' is not null or day_entry->>'on_books_room_revenue_sar' is not null or day_entry->>'available_nights' is not null or day_entry->>'pickup_nights' is not null or day_entry->>'cancellations_nights' is not null) and sales_n=0)
      or (day_entry->>'on_books_nights')::numeric>(day_entry->>'available_nights')::numeric then raise exception 'Sales actuals require facility evidence and compatible capacity';end if;
    if day_entry->>'demand'<>'unknown' and demand_n=0 then raise exception 'Demand outlook requires dated demand evidence';end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('/',site_pk,p_cadence,p_as_of,p_start),0));
  select revision,report into old_revision,old_report from private.fm_facility_revenue_reports
    where organization_id=p_organization and facility_id=site_pk and cadence=p_cadence and as_of=p_as_of and period_start=p_start order by revision desc limit 1;
  if old_report=p_report then return jsonb_build_object('revision',old_revision,'recorded',false);end if;
  if coalesce(old_revision,0)<>p_expected_revision then raise exception 'Report revision changed';end if;
  insert into private.fm_facility_revenue_reports(organization_id,client_id,facility_id,site_code,cadence,as_of,period_start,period_end,revision,report)
    values(p_organization,client_pk,site_pk,p_site_code,p_cadence,p_as_of,p_start,p_start+day_count-1,p_expected_revision+1,p_report);
  insert into public.audit_events(organization_id,actor_id,action,entity_type,entity_id,details)
    values(p_organization,null,'record_revenue_snapshot','facility',site_pk::text,jsonb_build_object(
      'cadence',p_cadence,'report_date',p_as_of,'stay_start',p_start,'revision',p_expected_revision+1,'rate_published',false));
  return jsonb_build_object('revision',p_expected_revision+1,'recorded',true);
end
$$;
revoke all on function private.fm_store_facility_revenue_report(uuid,text,text,text,date,date,integer,jsonb) from public,anon,authenticated,service_role;

create function public.fm_facility_revenue_history(p_organization uuid,p_facility uuid,p_limit integer default 30)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('reports',coalesce(jsonb_agg(to_jsonb(r) order by r.as_of desc,r.observed_at desc),'[]'::jsonb))
  from (select * from (
    select distinct on (as_of,period_start,cadence) cadence,as_of,period_start,period_end,observed_at,revision,report
    from private.fm_facility_revenue_reports where organization_id=p_organization and facility_id=p_facility
    order by as_of desc,period_start desc,cadence,revision desc
  ) latest order by as_of desc,observed_at desc limit least(greatest(coalesce(p_limit,30),1),100)) r;
$$;
revoke all on function public.fm_facility_revenue_history(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.fm_facility_revenue_history(uuid,uuid,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
