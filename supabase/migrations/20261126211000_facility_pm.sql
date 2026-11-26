begin;

-- Repeat dates are anchored to the first scheduled date, including month ends.
create function private.facility_pm_due(first_due date, unit text, step integer, occurrence integer)
returns date language sql immutable strict set search_path='' as $$
  select case unit
    when 'days' then first_due + step * occurrence
    when 'weeks' then first_due + 7 * step * occurrence
    when 'months' then (first_due + make_interval(months => step * occurrence))::date
    when 'years' then (first_due + make_interval(years => step * occurrence))::date
  end
$$;
revoke all on function private.facility_pm_due(date,text,integer,integer) from public,anon,authenticated;

create unique index if not exists facility_assets_survey_site_uq on public.facility_assets(organization_id,facility_id,id);
create table public.facility_pm_plans (
  id uuid primary key,
  organization_id uuid not null,
  facility_id uuid not null,
  asset_id uuid not null,
  task text not null check (length(trim(task)) between 2 and 300),
  period_count integer not null check (period_count between 1 and 1000),
  period_unit text not null check (period_unit in ('days','weeks','months','years')),
  first_due_on date not null check (isfinite(first_due_on)),
  source_reference text not null check (length(trim(source_reference)) between 3 and 500),
  source_date date not null check (isfinite(source_date)),
  verified_by uuid not null references auth.users,
  verified_at timestamptz not null default now(),
  next_due_on date not null check(isfinite(next_due_on)),
  issued_count integer not null default 0,
  paused_at timestamptz,
  paused_by uuid references auth.users,
  foreign key(organization_id,facility_id,asset_id) references public.facility_assets(organization_id,facility_id,id),
  unique(organization_id,facility_id,id)
);
create unique index facility_pm_current_task on public.facility_pm_plans(asset_id,lower(trim(task))) where paused_at is null;
create index facility_pm_queue on public.facility_pm_plans(organization_id,facility_id,next_due_on,id) where paused_at is null;

create table public.facility_pm_occurrences (
  organization_id uuid not null,
  facility_id uuid not null,
  plan_id uuid not null,
  due_on date not null,
  work_order_id uuid not null unique,
  issued_by uuid not null references auth.users,
  issued_at timestamptz not null default now(),
  primary key (plan_id,due_on),
  foreign key (organization_id,facility_id,plan_id) references public.facility_pm_plans(organization_id,facility_id,id),
  foreign key (organization_id,work_order_id) references public.facility_work_orders(organization_id,id)
);
create index facility_pm_occurrences_site on public.facility_pm_occurrences(organization_id,facility_id,issued_at desc);

alter table public.facility_pm_plans enable row level security;
alter table public.facility_pm_occurrences enable row level security;
revoke all on public.facility_pm_plans,public.facility_pm_occurrences from public,anon,authenticated;
grant select on public.facility_pm_plans,public.facility_pm_occurrences to authenticated;
create policy read_authorized_pm on public.facility_pm_plans for select to authenticated
using (private.has_org_access(organization_id) and (select auth.jwt()->>'aal')='aal2');
create policy read_authorized_pm on public.facility_pm_occurrences for select to authenticated
using (private.has_org_access(organization_id) and (select auth.jwt()->>'aal')='aal2');

create function public.facility_pm_register(p_org uuid,p_facility uuid,p_id uuid,p_asset uuid,p_task text,
  p_count int,p_unit text,p_first date,p_source text,p_source_date date) returns uuid
language plpgsql security definer set search_path='' as $$
declare plan public.facility_pm_plans;
begin
  perform private.draqon_assert_field_actor(p_org,true);
  if p_source_date > (now() at time zone 'Asia/Riyadh')::date then
    raise exception 'Source date must not be in the future' using errcode='22023';
  end if;
  insert into public.facility_pm_plans(id,organization_id,facility_id,asset_id,task,period_count,period_unit,
    first_due_on,next_due_on,source_reference,source_date,verified_by)
  values(p_id,p_org,p_facility,p_asset,trim(p_task),p_count,p_unit,p_first,p_first,trim(p_source),p_source_date,auth.uid())
  on conflict(id) do nothing;
  if found and exists (
    select 1 from public.facility_pm_occurrences o join public.facility_pm_plans previous on previous.id=o.plan_id
    where previous.organization_id=p_org and previous.facility_id=p_facility and previous.asset_id=p_asset
      and lower(trim(previous.task))=lower(trim(p_task)) and o.due_on>=p_first
  ) then
    raise exception 'Replacement baseline overlaps an issued occurrence' using errcode='23514';
  end if;
  select * into plan from public.facility_pm_plans where id=p_id and organization_id=p_org and facility_id=p_facility;
  if not found or (plan.asset_id,plan.task,plan.period_count,plan.period_unit,plan.first_due_on,
      plan.source_reference,plan.source_date,plan.verified_by) is distinct from
      (p_asset,trim(p_task),p_count,p_unit,p_first,trim(p_source),p_source_date,auth.uid()) then
    raise exception 'Conflicting schedule reference' using errcode='23505';
  end if;
  return p_id;
end;
$$;

create function public.facility_pm_issue(p_org uuid,p_facility uuid,p_plan uuid,p_due date) returns uuid
language plpgsql security definer set search_path='' as $$
declare plan public.facility_pm_plans; order_id uuid;
begin
  perform private.draqon_assert_field_actor(p_org,false);
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
  insert into public.facility_pm_occurrences(organization_id,facility_id,plan_id,due_on,work_order_id,issued_by)
  values(p_org,p_facility,p_plan,p_due,order_id,auth.uid());
  update public.facility_pm_plans set issued_count=issued_count+1,
    next_due_on=private.facility_pm_due(first_due_on,period_unit,period_count,issued_count+1) where id=p_plan;
  return order_id;
end;
$$;

create function public.facility_pm_pause(p_org uuid,p_facility uuid,p_plan uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.draqon_assert_field_actor(p_org,true);
  update public.facility_pm_plans set paused_at=coalesce(paused_at,now()),paused_by=coalesce(paused_by,auth.uid())
    where organization_id=p_org and facility_id=p_facility and id=p_plan;
  if not found then raise exception 'Unknown schedule' using errcode='42501'; end if;
end;
$$;
revoke all on function public.facility_pm_register(uuid,uuid,uuid,uuid,text,int,text,date,text,date),
  public.facility_pm_issue(uuid,uuid,uuid,date),public.facility_pm_pause(uuid,uuid,uuid) from public,anon;
grant execute on function public.facility_pm_register(uuid,uuid,uuid,uuid,text,int,text,date,text,date),
  public.facility_pm_issue(uuid,uuid,uuid,date),public.facility_pm_pause(uuid,uuid,uuid) to authenticated;
commit;
