-- Building metrics available to an assigned field team. Existing form versions stay immutable.
create table private.field_building_observations(
 record_id uuid primary key references public.facility_memory_records(id)
);
alter table private.field_building_observations enable row level security;
revoke all on private.field_building_observations from public,anon,authenticated;

create function private.field_building_visible(target uuid,site uuid,author_id uuid,org uuid,approved boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select from private.field_building_observations where record_id=target)
 or (private.field_form_access(site) and (approved or author_id=auth.uid() or private.can_approve_org(org)))
$$;
revoke all on function private.field_building_visible(uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function private.field_building_visible(uuid,uuid,uuid,uuid,boolean) to authenticated;
create policy field_building_member_scope on public.facility_memory_records as restrictive for select to authenticated
 using (private.field_building_visible(id,facility_id,recorded_by,organization_id,verified_at is not null));

create function private.field_building_independent() returns trigger language plpgsql set search_path='' as $$
begin
 if new.verified_by=new.recorded_by and exists(select from private.field_building_observations where record_id=new.id)
 then raise exception 'BUILDING_SECOND_REVIEWER' using errcode='23514';end if;
 return new;
end $$;
revoke all on function private.field_building_independent() from public,anon,authenticated;
create trigger field_building_second_reviewer before update of verified_by on public.facility_memory_records for each row execute function private.field_building_independent();

create function public.field_building_capture(p_site uuid,p_id uuid,p_key text,p_value text,p_source text,p_date date)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; v text:=translate(btrim(p_value),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٫','01234567890123456789.'); old public.facility_memory_records;
begin
 select organization_id into org from public.facilities where id=p_site;
 perform 1 from public.organization_members where user_id=auth.uid() and organization_id=org and active for share;
 if not found or not coalesce(private.field_form_access(p_site),false) then raise exception 'BUILDING_ACCESS' using errcode='42501';end if;
 if p_key is null or p_key not in ('floors_above','basements','built_area_m2','land_area_m2','lifts','units','staff_total')
 or coalesce(v,'') !~ '^[0-9]{1,12}([.][0-9]{1,3})?$' or coalesce(length(btrim(p_source)),0) not between 2 and 400 or p_date is null or p_date>(now() at time zone 'Asia/Riyadh')::date then raise exception 'BUILDING_INPUT' using errcode='22023';end if;
 v:=trim_scale(v::numeric)::text;
 insert into public.facility_memory_records(id,organization_id,facility_id,fact_key,fact_value,source_ref,observed_on,recorded_by)
 values(p_id,org,p_site,p_key,v,btrim(p_source),p_date,auth.uid()) on conflict(id) do nothing;
 if found then insert into private.field_building_observations values(p_id);
 else
  select m.* into old from public.facility_memory_records m join private.field_building_observations k on k.record_id=m.id where m.id=p_id;
  if not found or (old.facility_id,old.fact_key,old.fact_value,old.source_ref,old.observed_on,old.recorded_by) is distinct from (p_site,p_key,v,btrim(p_source),p_date,auth.uid())
  then raise exception 'BUILDING_CONFLICT' using errcode='23505';end if;
 end if;
 return p_id;
end $$;

create function public.field_building_verify(p_site uuid,p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=private.field_cycle_manager(p_site);
begin
 if not exists(select from private.field_building_observations k join public.facility_memory_records m on m.id=k.record_id
 where m.id=p_id and m.facility_id=p_site and m.recorded_by<>auth.uid()) then raise exception 'BUILDING_SECOND_REVIEWER' using errcode='42501';end if;
 return public.facility_memory_verify(org,p_site,p_id);
end $$;

-- Newest observation date wins. Contradictory approved values on the same date both remain visible.
create function public.field_building_read(p_site uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid; manager boolean; data jsonb;
begin
 if not coalesce(private.field_form_access(p_site),false) then raise exception 'BUILDING_ACCESS' using errcode='42501';end if;
 select organization_id into org from public.facilities where id=p_site;
 manager:=private.can_approve_org(org);
 with observations as (
  select m.fact_key as key,m.fact_value as value,m.observed_on as day,m.source_ref as source,m.id,
   m.verified_at is not null as approved,manager and m.recorded_by<>auth.uid() and m.verified_at is null and k.record_id is not null as can_verify
  from public.facility_memory_records m left join private.field_building_observations k on m.id=k.record_id where m.facility_id=p_site and m.asset_id is null
  and m.fact_key in ('floors_above','basements','built_area_m2','land_area_m2','lifts','units','staff_total') and (m.verified_at is not null or m.recorded_by=auth.uid() or manager)
  union all
  select 'units',trim_scale(v.val::numeric)::text,(r.submitted_at at time zone 'Asia/Riyadh')::date,'بطاقة المبنى F01 • '||r.id::text,r.id,true,false
  from public.field_form_records r join public.field_form_reviews rv on r.id=rv.record_id and rv.decision='accepted'
  cross join lateral(select translate(btrim(r.answers->>'C11'),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789') val)v
  where r.facility_id=p_site and r.code='F01' and v.val ~ '^[0-9]{1,8}$'
 ), latest as (select key,max(day) as day from observations where approved group by key),
 rows as (select o.* from observations o left join latest l on o.key=l.key where not o.approved or o.day=l.day)
 select coalesce(jsonb_agg(to_jsonb(b) order by b.key,b.approved desc,b.day desc,b.id),'[]'::jsonb) into data from rows b;
 return data;
end $$;
revoke all on function public.field_building_read(uuid),public.field_building_capture(uuid,uuid,text,text,text,date),public.field_building_verify(uuid,uuid) from public,anon,authenticated;
grant execute on function public.field_building_read(uuid),public.field_building_capture(uuid,uuid,text,text,text,date),public.field_building_verify(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
