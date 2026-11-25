begin;

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(btrim(name)) between 2 and 180),
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.facility_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  facility_id uuid not null,
  asset_code text not null check (length(btrim(asset_code)) between 1 and 80),
  name text not null check (length(btrim(name)) between 2 and 180),
  created_at timestamptz not null default now(),
  foreign key (organization_id, facility_id) references public.facilities(organization_id, id),
  unique (organization_id, id),
  unique (facility_id, asset_code)
);

create table public.facility_work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  asset_id uuid not null,
  summary text not null check (length(btrim(summary)) between 2 and 300),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (organization_id, asset_id) references public.facility_assets(organization_id, id),
  unique (organization_id, id)
);

create table public.facility_visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  work_order_id uuid not null,
  findings text not null check (length(btrim(findings)) between 2 and 3000),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  foreign key (organization_id, work_order_id) references public.facility_work_orders(organization_id, id)
);

create index facility_assets_by_facility on public.facility_assets(organization_id, facility_id);
create index facility_work_orders_by_asset on public.facility_work_orders(organization_id, asset_id);
create index facility_visits_by_order on public.facility_visits(organization_id, work_order_id);

do $$
declare
  target text;
begin
  foreach target in array array['facilities','facility_assets','facility_work_orders','facility_visits'] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('revoke all on public.%I from public, anon, authenticated', target);
    execute format('grant select on public.%I to authenticated', target);
    execute format('create policy member_read on public.%I for select to authenticated using (private.has_org_access(organization_id))', target);
    execute format('create policy team_insert on public.%I for insert to authenticated with check (private.can_write_org(organization_id))', target);
    execute format('create policy require_mfa on public.%I as restrictive for all to authenticated using (((select auth.jwt())->>''aal'') = ''aal2'') with check (((select auth.jwt())->>''aal'') = ''aal2'')', target);
  end loop;
end;
$$;

grant insert (organization_id, name) on public.facilities to authenticated;
grant insert (organization_id, facility_id, asset_code, name) on public.facility_assets to authenticated;
grant insert (organization_id, asset_id, summary) on public.facility_work_orders to authenticated;
grant insert (organization_id, work_order_id, findings) on public.facility_visits to authenticated;
grant update (status) on public.facility_work_orders to authenticated;

create policy team_advance_work_order on public.facility_work_orders for update to authenticated
  using (private.can_write_org(organization_id))
  with check (private.can_write_org(organization_id));

create function private.validate_facility_work_order_transition()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status = old.status then return new; end if;
  if old.status = 'open' and new.status = 'in_progress' then return new; end if;
  if old.status = 'in_progress' and new.status = 'completed'
      and private.can_approve_org(new.organization_id)
      and exists (select 1 from public.facility_visits v
                  where v.organization_id = new.organization_id and v.work_order_id = new.id) then
    new.completed_at := now();
    return new;
  end if;
  raise exception 'Work order transition requires an authorized approver and a recorded visit where applicable'
    using errcode = '23514';
end;
$$;

create trigger validate_facility_work_order_transition
before update of status on public.facility_work_orders
for each row execute function private.validate_facility_work_order_transition();

create function private.validate_facility_visit_order()
returns trigger language plpgsql set search_path = ''
as $$
declare
  order_status text;
begin
  select status into order_status from public.facility_work_orders
  where organization_id = new.organization_id and id = new.work_order_id
  for update;
  if order_status is distinct from 'in_progress' then
    raise exception 'Visits can only be added to work in progress' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_facility_visit_order
before insert on public.facility_visits
for each row execute function private.validate_facility_visit_order();

commit;
