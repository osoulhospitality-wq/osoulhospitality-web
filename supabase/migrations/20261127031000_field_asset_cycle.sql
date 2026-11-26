-- Additive bridge between the technician forms and the canonical DRAQON registry.
-- Requires approved field forms, facility_survey and facility_pm migrations.
create table private.field_cycle_assets (
 asset_id uuid primary key references public.facility_assets(id),
 source_id uuid not null unique references public.field_form_records(id),
 activated_by uuid not null references auth.users(id),
 activated_at timestamptz not null default now()
);
create table private.field_cycle_closures (
 order_id uuid primary key references public.facility_work_orders(id),
 record_id uuid not null unique references public.field_form_records(id),
 closed_by uuid not null references auth.users(id),
 recorded_at timestamptz not null default now()
);
alter table private.field_cycle_assets enable row level security;
alter table private.field_cycle_closures enable row level security;
revoke all on private.field_cycle_assets,private.field_cycle_closures from public,anon,authenticated;

-- The indexed field site lookup checks active membership and MFA. Lock the
-- approving membership for mutations so revocation serializes against a write.
create function private.field_cycle_manager(site uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
 select organization_id into org from public.facilities where id=site;
 if org is null then raise exception 'CYCLE_ACCESS' using errcode='42501'; end if;
 perform private.draqon_assert_field_actor(org,true);
 if not coalesce(private.field_form_access(site),false) then raise exception 'CYCLE_ACCESS' using errcode='42501';end if;
 return org;
end $$;
revoke all on function private.field_cycle_manager(uuid) from public,anon,authenticated;

create function public.field_cycle_activate(p_site uuid,p_record uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.field_cycle_manager(p_site); r public.field_form_records; a public.facility_assets; source uuid; acode text; aname text;
begin
 select * into r from public.field_form_records where id=p_record and facility_id=p_site and organization_id=org and code='F03' and status='submitted' for update;
 if not found or not exists(select from public.field_form_reviews where record_id=p_record and decision='accepted') then raise exception 'CYCLE_F03_APPROVAL'; end if;
 select asset_id into a.id from private.field_cycle_assets where source_id=p_record;
 if found then return a.id;end if;
 acode:=btrim(r.answers->>'C8'); aname:=btrim(r.answers->>'C11');
 if coalesce(length(acode),0) not between 1 and 80 or coalesce(length(aname),0) not between 2 and 180 then raise exception 'CYCLE_ASSET_FIELDS';end if;
 insert into public.facility_assets(organization_id,facility_id,asset_code,name) values(org,p_site,acode,aname)
 on conflict (facility_id,asset_code) do nothing;
 select * into strict a from public.facility_assets where facility_id=p_site and organization_id=org and asset_code=acode for update;
 select source_id into source from private.field_cycle_assets where asset_id=a.id;
 if a.name<>aname or (source is not null and source<>p_record) then raise exception 'CYCLE_ASSET_CONFLICT';end if;
 insert into private.field_cycle_assets(asset_id,source_id,activated_by) values(a.id,p_record,auth.uid());
 return a.id;
end $$;

create function public.field_cycle_plan(p_site uuid,p_id uuid,p_asset uuid,p_task text,p_count int,p_unit text,p_first date,p_source text,p_source_date date) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.field_cycle_manager(p_site);
begin
 if not exists(select from public.facility_assets a join private.field_cycle_assets l on l.asset_id=a.id
  where a.id=p_asset and a.facility_id=p_site and a.organization_id=org) then raise exception 'CYCLE_ASSET_SCOPE'; end if;
 return public.facility_pm_register(org,p_site,p_id,p_asset,p_task,p_count,p_unit,p_first,p_source,p_source_date);
end $$;

create function public.field_cycle_issue(p_site uuid,p_plan uuid,p_due date) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.field_cycle_manager(p_site);
begin
 if not exists(select from public.facility_pm_plans p join private.field_cycle_assets l on l.asset_id=p.asset_id
  where p.id=p_plan and p.facility_id=p_site and p.organization_id=org) then raise exception 'CYCLE_PLAN_SCOPE';end if;
 return public.facility_pm_issue(org,p_site,p_plan,p_due);
end $$;

create function public.field_cycle_close(p_site uuid,p_order uuid,p_record uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.field_cycle_manager(p_site); w public.facility_work_orders; acode text; r public.field_form_records; previous uuid;
begin
 select w0.* into w from public.facility_work_orders w0 join public.facility_assets a on a.id=w0.asset_id
 join private.field_cycle_assets l on l.asset_id=a.id join public.facility_pm_occurrences o on o.work_order_id=w0.id
 where w0.id=p_order and a.facility_id=p_site and w0.organization_id=org for update of w0;
 if not found then raise exception 'CYCLE_ORDER_SCOPE';end if;
 select record_id into previous from private.field_cycle_closures where order_id=p_order;
 if previous is not null then
  if previous=p_record and w.status='completed' then return p_order;end if;
  raise exception 'CYCLE_CLOSURE_FIXED';
 end if;
 if w.status='completed' then raise exception 'CYCLE_CLOSURE_FIXED';end if;
 select asset_code into strict acode from public.facility_assets where id=w.asset_id;
 select * into r from public.field_form_records where id=p_record and organization_id=org and facility_id=p_site and code='F08'
 and status='submitted' and submitted_at>=w.created_at;
 if not found or btrim(r.answers->>'C8') is distinct from p_order::text or btrim(r.answers->>'C9') is distinct from acode
 or not exists(select from public.field_form_reviews where record_id=p_record and decision='accepted' and reviewer_id<>r.author_id)
 then raise exception 'CYCLE_F08_APPROVAL';end if;
 if not exists(select from storage.objects where bucket_id='field-form-photos' and name like p_record::text||'/%') then raise exception 'CYCLE_PHOTO';end if;
 insert into private.field_cycle_closures(order_id,record_id,closed_by) values(p_order,p_record,auth.uid());
 if w.status='open' then update public.facility_work_orders set status='in_progress' where id=p_order;end if;
 insert into public.facility_visits(organization_id,work_order_id,findings)
 values(org,p_order,'F08 '||p_record::text||' / '||left(btrim(r.answers->>'C17'),2000));
 update public.facility_work_orders set status='completed' where id=p_order;
 return p_order;
end $$;

-- Protect the existing status endpoint as well as the new bridge against a
-- second closure path. Pre-existing unrelated work orders retain their rules.
create function private.field_cycle_guard_closure() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='completed' and old.status<>'completed'
 and exists(select from private.field_cycle_assets l join public.facility_pm_occurrences o on o.work_order_id=new.id where l.asset_id=new.asset_id)
 and not exists(select from private.field_cycle_closures c where c.order_id=new.id)
 then raise exception 'CYCLE_EVIDENCE_REQUIRED';end if;
 return new;
end $$;
revoke all on function private.field_cycle_guard_closure() from public,anon,authenticated;
create trigger field_cycle_guard_closure before update of status on public.facility_work_orders for each row execute function private.field_cycle_guard_closure();

create function public.field_cycle_board(p_site uuid,p_token uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare data jsonb;
begin
 if not coalesce(private.field_form_access(p_site),false) then raise exception 'CYCLE_ACCESS' using errcode='42501';end if;
 with scope as materialized (
 select a.id,a.asset_code,a.name,a.scan_token,l.source_id,r.author_id,a.organization_id
 from public.facility_assets a join private.field_cycle_assets l on l.asset_id=a.id
 join public.field_form_records r on r.id=l.source_id
 where a.facility_id=p_site and (p_token is null or a.scan_token=p_token)
 ), plans as materialized(select p.* from public.facility_pm_plans p join scope s on s.id=p.asset_id)
 select jsonb_build_object('today',(now() at time zone 'Asia/Riyadh')::date,
 'can_manage',private.can_approve_org((select organization_id from public.facilities where id=p_site)),
 'assets',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'asset_code',s.asset_code,'name',s.name,'scan_token',s.scan_token,
    'source_id',case when s.author_id=auth.uid() or private.can_approve_org(s.organization_id) then s.source_id end) order by s.asset_code,s.id) from scope s),'[]'::jsonb),
 'plans',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'asset_id',p.asset_id,'task',p.task,'next_due_on',p.next_due_on,'period_count',p.period_count,'period_unit',p.period_unit,'paused',p.paused_at is not null) order by p.next_due_on,p.id) from plans p),'[]'::jsonb),
 'orders',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'asset_id',w.asset_id,'plan_id',o.plan_id,'summary',w.summary,'due_on',o.due_on,
 'status',w.status,'evidence_id',case when r.author_id=auth.uid() or private.can_approve_org(w.organization_id) then c.record_id end) order by o.due_on desc,w.id)
 from plans p join public.facility_pm_occurrences o on o.plan_id=p.id join public.facility_work_orders w on w.id=o.work_order_id
 left join private.field_cycle_closures c on c.order_id=w.id left join public.field_form_records r on r.id=c.record_id),'[]'::jsonb))
 into data;
 return data;
end $$;

do $$declare f regprocedure;
begin
 foreach f in array array['public.field_cycle_activate(uuid,uuid)'::regprocedure,
 'public.field_cycle_plan(uuid,uuid,uuid,text,int,text,date,text,date)'::regprocedure,
 'public.field_cycle_issue(uuid,uuid,date)'::regprocedure,'public.field_cycle_close(uuid,uuid,uuid)'::regprocedure,
 'public.field_cycle_board(uuid,uuid)'::regprocedure] loop
 execute format('revoke all on function %s from public,anon,authenticated',f);
 execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
notify pgrst,'reload schema';

-- Registration makes this asset field-managed. Existing unrelated assets keep
-- their existing enterprise permissions; registry and order reads for the new
-- field-managed assets apply the same site assignment rule as the QR desk.
create function private.field_cycle_visible_asset(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select private.field_form_access(a.facility_id) from private.field_cycle_assets l
 join public.facility_assets a on a.id=l.asset_id where l.asset_id=target),true)
$$;
create function private.field_cycle_visible_order(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select private.field_cycle_visible_asset(w.asset_id) from public.facility_work_orders w where w.id=target),false)
$$;
revoke all on function private.field_cycle_visible_asset(uuid),private.field_cycle_visible_order(uuid) from public,anon,authenticated;
grant execute on function private.field_cycle_visible_asset(uuid),private.field_cycle_visible_order(uuid) to authenticated;
create policy field_cycle_asset_scope on public.facility_assets as restrictive for select to authenticated using (private.field_cycle_visible_asset(id));
create policy field_cycle_order_scope on public.facility_work_orders as restrictive for select to authenticated using (private.field_cycle_visible_asset(asset_id));
create policy field_cycle_visit_scope on public.facility_visits as restrictive for select to authenticated using (private.field_cycle_visible_order(work_order_id));
create policy field_cycle_plan_scope on public.facility_pm_plans as restrictive for select to authenticated using (private.field_cycle_visible_asset(asset_id));
create policy field_cycle_occurrence_scope on public.facility_pm_occurrences as restrictive for select to authenticated using (private.field_cycle_visible_order(work_order_id));
create function private.field_cycle_guard_plan() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and exists(select from private.field_cycle_assets l where l.asset_id=new.asset_id) then
  perform private.field_cycle_manager(new.facility_id);
 end if;
 return new;
end $$;
revoke all on function private.field_cycle_guard_plan() from public,anon,authenticated;
create trigger field_cycle_guard_plan before insert or update on public.facility_pm_plans for each row execute function private.field_cycle_guard_plan();
