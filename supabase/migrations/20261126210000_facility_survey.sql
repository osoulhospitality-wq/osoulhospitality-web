begin;
-- Stable random lookup key. Backfill existing assets and leave the asset code and
-- all work-order foreign keys unchanged. A printed token does not grant access.
alter table public.facility_assets add column scan_token uuid not null default gen_random_uuid();
create unique index facility_assets_scan_token_uq on public.facility_assets(scan_token);
create unique index facility_assets_survey_site_uq on public.facility_assets(organization_id,facility_id,id);
create function private.keep_facility_scan_token() returns trigger language plpgsql set search_path='' as $$
begin
 if new.scan_token is distinct from old.scan_token then raise exception 'Printed asset token is immutable' using errcode='23514'; end if;
 return new;
end;
$$;
revoke all on function private.keep_facility_scan_token() from public,anon,authenticated;
create trigger facility_scan_token_immutable before update of scan_token on public.facility_assets
 for each row execute function private.keep_facility_scan_token();

create table public.facility_memory_records (
 id uuid primary key, organization_id uuid not null,facility_id uuid not null,asset_id uuid,
 fact_key text not null, fact_value text not null check (length(btrim(fact_value)) between 1 and 1000),
 source_ref text not null check (length(btrim(source_ref)) between 2 and 400),observed_on date not null check (isfinite(observed_on)),
 recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default clock_timestamp(),
 verified_by uuid references auth.users(id),verified_at timestamptz,
 foreign key(organization_id,facility_id) references public.facilities(organization_id,id),
 foreign key(organization_id,facility_id,asset_id) references public.facility_assets(organization_id,facility_id,id),
 check ((verified_by is null)=(verified_at is null)),
 check ((asset_id is null and fact_key in ('floors_above','basements','built_area_m2','land_area_m2','lifts','units','staff_total','staff_breakdown','address','property_type','inspection_note'))
   or (asset_id is not null and fact_key in ('category','location','manufacturer','model','serial','condition','inspection_note'))),
 check (case when fact_key in ('floors_above','basements','lifts','units','staff_total') then fact_value ~ '^[0-9]{1,8}$'
   when fact_key in ('built_area_m2','land_area_m2') then fact_value ~ '^[0-9]{1,12}([.][0-9]{1,3})?$' and fact_value::numeric>0
   else true end)
);
create index facility_memory_site_key_date on public.facility_memory_records(organization_id,facility_id,fact_key,observed_on desc);
alter table public.facility_memory_records enable row level security;
revoke all on public.facility_memory_records from public,anon,authenticated;
grant select on public.facility_memory_records to authenticated;
create policy memory_member_read on public.facility_memory_records for select to authenticated
using(private.has_org_access(organization_id) and ((select auth.jwt())->>'aal')='aal2');

create function public.facility_memory_save(p_org uuid,p_facility uuid,p_id uuid,p_asset uuid,p_key text,p_value text,p_source text,p_asof date)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.facility_memory_records; normalized text:=btrim(p_value);
begin
 perform private.draqon_assert_field_actor(p_org,false);
 if p_asof>(now() at time zone 'Asia/Riyadh')::date then raise exception 'Future observation date' using errcode='22023'; end if;
 -- Canonical numbers keep equivalent sources such as 03 and 3 distinct from disagreements.
 if p_key in ('floors_above','basements','lifts','units','staff_total','built_area_m2','land_area_m2') then
   normalized:=translate(normalized,'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٫','01234567890123456789.');
   if normalized !~ '^[0-9]{1,12}([.][0-9]{1,3})?$' then raise exception 'Invalid numeric value' using errcode='22023'; end if;
   normalized:=trim_scale(normalized::numeric)::text;
 end if;
 insert into public.facility_memory_records(id,organization_id,facility_id,asset_id,fact_key,fact_value,source_ref,observed_on,recorded_by)
 values(p_id,p_org,p_facility,p_asset,p_key,normalized,btrim(p_source),p_asof,auth.uid()) on conflict(id) do nothing;
 if not found then
   select * into r from public.facility_memory_records where organization_id=p_org and facility_id=p_facility and id=p_id;
   if not found or (r.asset_id,r.fact_key,r.fact_value,r.source_ref,r.observed_on,r.recorded_by) is distinct from
       (p_asset,p_key,normalized,btrim(p_source),p_asof,auth.uid()) then raise exception 'Observation ID conflicts with prior input' using errcode='23505'; end if;
 end if;
 return p_id;
end;
$$;
create function public.facility_memory_verify(p_org uuid,p_facility uuid,p_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform private.draqon_assert_field_actor(p_org,true);
 perform 1 from public.facility_memory_records where organization_id=p_org and facility_id=p_facility and id=p_id for update;
 if not found then raise exception 'Unknown observation' using errcode='42501'; end if;
 update public.facility_memory_records set verified_by=auth.uid(),verified_at=clock_timestamp()
 where organization_id=p_org and facility_id=p_facility and id=p_id and verified_at is null;
 return p_id;
end;
$$;
create function public.facility_memory_find(p_org uuid,p_facility uuid,p_term text default '',p_asset uuid default null)
returns setof public.facility_memory_records language sql stable security invoker set search_path='' as $$
 select m.* from public.facility_memory_records m where m.organization_id=p_org and m.facility_id=p_facility and (p_asset is null or m.asset_id=p_asset)
 and (coalesce(btrim(p_term),'')='' or strpos(lower(concat_ws(' ',m.fact_key,m.fact_value,m.source_ref)),lower(btrim(p_term)))>0)
 order by m.observed_on desc,m.recorded_at desc,m.id;
$$;
create function public.facility_asset_by_token(p_org uuid,p_facility uuid,p_token uuid)
returns setof public.facility_assets language sql stable security invoker set search_path='' as $$
 select a.* from public.facility_assets a where a.organization_id=p_org and a.facility_id=p_facility and a.scan_token=p_token;
$$;
revoke all on function public.facility_memory_save(uuid,uuid,uuid,uuid,text,text,text,date),public.facility_memory_verify(uuid,uuid,uuid),
 public.facility_memory_find(uuid,uuid,text,uuid),public.facility_asset_by_token(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.facility_memory_save(uuid,uuid,uuid,uuid,text,text,text,date),public.facility_memory_verify(uuid,uuid,uuid),
 public.facility_memory_find(uuid,uuid,text,uuid),public.facility_asset_by_token(uuid,uuid,uuid) to authenticated;
commit;
