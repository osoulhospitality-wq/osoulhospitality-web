begin;

-- Client engagements and purchase agreements have different financial meanings.
create table private.fm_client_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) > 0),
  status public.contract_status not null default 'review',
  evidence_note text not null,
  annual_value numeric(14,2) check (annual_value >= 0),
  start_date date,
  end_date date,
  notice_days integer check (notice_days >= 0),
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  check (start_date is null or end_date is null or end_date >= start_date)
);
create table private.fm_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  code text not null check (length(btrim(code)) > 0),
  name text not null check (length(btrim(name)) > 0),
  contract_id uuid not null,
  sources jsonb not null default '[]' check (jsonb_typeof(sources)='array'),
  detail jsonb not null default '{}' check (jsonb_typeof(detail)='object'),
  unique (organization_id,id), unique (organization_id,code), unique(contract_id),
  foreign key (organization_id,contract_id) references private.fm_client_contracts(organization_id,id)
);
create table private.fm_client_sites (
  organization_id uuid not null,
  client_id uuid not null,
  facility_id uuid not null unique,
  code text not null check (length(btrim(code)) > 0),
  detail jsonb not null default '{}' check (jsonb_typeof(detail)='object'),
  primary key (client_id,code), unique (organization_id,client_id,facility_id,code),
  foreign key (organization_id,client_id) references private.fm_clients(organization_id,id),
  foreign key (organization_id,facility_id) references public.facilities(organization_id,id)
);
create table private.fm_client_observations (
  organization_id uuid not null,
  client_id uuid not null,
  facility_id uuid,
  building_code text not null,
  period text not null check (length(btrim(period))>0),
  metric text not null check (length(btrim(metric))>0),
  value numeric not null,
  unit text not null,
  source text not null,
  locator text not null,
  detail jsonb not null default '{}' check (jsonb_typeof(detail)='object'),
  primary key (client_id,building_code,period,metric,source,locator),
  foreign key (organization_id,client_id) references private.fm_clients(organization_id,id),
  foreign key (organization_id,client_id,facility_id,building_code) references private.fm_client_sites(organization_id,client_id,facility_id,code)
);
do $access$
declare relation_name text;
begin
  foreach relation_name in array array['fm_clients','fm_client_contracts','fm_client_sites','fm_client_observations'] loop
    execute format('alter table private.%I enable row level security', relation_name);
    execute format('revoke all on table private.%I from public, anon, authenticated', relation_name);
    execute format('grant select on table private.%I to authenticated', relation_name);
    execute format('create policy owner_read on private.%I for select to authenticated using (
      (select auth.jwt()->>''aal'') = ''aal2'' and private.current_org_role(organization_id) = ''owner''
    )',relation_name);
  end loop;
end
$access$;

create function public.fm_client_portfolio(p_organization uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'contract_id', e.id, 'status', e.status,
    'contract', jsonb_build_object('id',e.id,'name',e.name,'status',e.status,'evidence_note',e.evidence_note,
       'annual_value',e.annual_value,'start_date',e.start_date,'end_date',e.end_date,'notice_days',e.notice_days),
    'detail', c.detail, 'sources', c.sources,
    'facilities', (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,
      'code',s.code,'detail',s.detail) order by f.name),'[]'::jsonb)
      from private.fm_client_sites s join public.facilities f on (f.organization_id,f.id)=(s.organization_id,s.facility_id)
      where (s.organization_id,s.client_id)=(c.organization_id,c.id)),
    'observations',(select coalesce(jsonb_agg(o.detail || jsonb_build_object('building_id',o.building_code,
      'period',o.period,'metric',o.metric,'value',o.value,'unit',o.unit,'source',o.source,'locator',o.locator)
      order by o.building_code,o.metric,o.period,o.source,o.locator),'[]'::jsonb)
      from private.fm_client_observations o where (o.organization_id,o.client_id)=(c.organization_id,c.id))
  ) order by c.name,c.id),'[]'::jsonb)
  from private.fm_clients c join private.fm_client_contracts e on (e.organization_id,e.id)=(c.organization_id,c.contract_id)
  where c.organization_id=p_organization;
$$;
revoke all on function public.fm_client_portfolio(uuid) from public, anon, authenticated;
grant execute on function public.fm_client_portfolio(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
