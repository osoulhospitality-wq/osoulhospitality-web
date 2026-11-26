begin;

create table public.facility_insight_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  facility_id uuid not null,
  kind text not null check (kind in ('guest_summary','owner_record','site_source')),
  topic text not null check (topic in (
    'cleanliness_strength','response_strength','noise_weakness','cooling_weakness',
    'access_opportunity','demand_opportunity','works_threat','seasonality_threat'
  )),
  source_url text not null default '',
  observed_from date not null,
  observed_to date not null,
  sample_size integer check (sample_size > 0),
  supporting_count integer check (supporting_count is null or (sample_size is not null and supporting_count between 1 and sample_size)),
  limitation text not null check (limitation in ('selected_sample','single_source','seasonal','field_observation')),
  verified_by uuid not null default auth.uid() references auth.users(id),
  verified_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_by uuid references auth.users(id),
  foreign key (organization_id,facility_id) references public.facilities(organization_id,id),
  check (observed_from <= observed_to),
  check (sample_size is null or kind='guest_summary'),
  check (kind <> 'site_source' or topic in ('access_opportunity','demand_opportunity','works_threat','seasonality_threat')),
  check (kind <> 'guest_summary' or topic in ('cleanliness_strength','response_strength','noise_weakness','cooling_weakness')),
  check ((withdrawn_at is null) = (withdrawn_by is null))
);
create unique index facility_insight_unique_active on public.facility_insight_evidence
 (organization_id,facility_id,kind,topic,source_url,observed_from,observed_to)
 where withdrawn_at is null;
create index facility_insights_current on public.facility_insight_evidence(organization_id,facility_id,verified_at desc,id) where withdrawn_at is null;

create table public.facility_swot_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  facility_id uuid not null,
  version text not null,
  evidence_ids uuid[] not null,
  approved_at timestamptz not null default now(),
  approved_by uuid not null default auth.uid() references auth.users(id),
  foreign key (organization_id,facility_id) references public.facilities(organization_id,id),
  unique(organization_id,facility_id,version,evidence_ids)
);
alter table public.facility_insight_evidence enable row level security;
alter table public.facility_swot_approvals enable row level security;
revoke all on public.facility_insight_evidence, public.facility_swot_approvals from public,anon,authenticated;
grant select on public.facility_insight_evidence, public.facility_swot_approvals to authenticated;
create policy member_read on public.facility_insight_evidence for select to authenticated
 using ((select auth.jwt()->>'aal')='aal2' and private.has_org_access(organization_id));
create policy member_read on public.facility_swot_approvals for select to authenticated
 using ((select auth.jwt()->>'aal')='aal2' and private.has_org_access(organization_id));

-- Every mutation takes the same facility row lock, binding approval to the displayed snapshot.
create function private.lock_insight_facility(p_org uuid,p_facility uuid,p_owner_only boolean)
returns void language plpgsql set search_path='' as $$
begin
  if (auth.jwt()->>'aal') is distinct from 'aal2' or auth.uid() is null
    or coalesce(private.can_approve_org(p_org),false) is false
    or (p_owner_only and private.current_org_role(p_org) is distinct from 'owner'::public.app_role) then
    raise exception 'Facility authorization required' using errcode='42501';
  end if;
  perform 1 from public.facilities where organization_id=p_org and id=p_facility for update;
  if not found then raise exception 'Facility unavailable' using errcode='42501'; end if;
end;
$$;
revoke all on function private.lock_insight_facility(uuid,uuid,boolean) from public,anon,authenticated;

create function public.facility_verify_insight(p_org uuid,p_facility uuid,p_kind text,p_topic text,p_url text,
 p_from date,p_to date,p_sample integer,p_limitation text,p_confirm boolean,p_supporting integer default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; link text:=btrim(coalesce(p_url,''));
begin
  perform private.lock_insight_facility(p_org,p_facility,true);
  if p_confirm is not true or p_to>current_date or p_from is null or p_to is null then
    raise exception 'Confirm anonymized source and past observation dates' using errcode='23514';
  end if;
  -- Store a reference only. Never fetch a supplied URL, scrape a listing or accept guest text.
  if link ~ '^https://(www[.])?google[.]com/maps[?]cid=[0-9]{1,25}$' then
    null; -- Canonical place identifier only, with no guest, tracking or review identifier.
  elsif (link='' and p_kind <> 'owner_record') or
    (link<>'' and (length(link)>500 or link !~ '^https://([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(/[A-Za-z0-9._~/-]*)?$'
     or link ~* '/(users?|members?|profiles?|guests?|reviewers?|reviews?)(/|$)'
     or link ~ '/\.\.?(/|$)')) then
    raise exception 'Use a public property or site reference' using errcode='23514';
  end if;
  if p_kind='guest_summary' and link !~ '^https://(www[.])?google[.]com/maps[?]cid=[0-9]{1,25}$' and link !~* '^https://((www\.)?booking\.com/hotel/[a-z]{2}/[a-z0-9_-]+(\.[a-z-]+)?\.html|(www\.)?tripadvisor\.com/Hotel_Review-[a-z0-9_-]+\.html|(www\.)?agoda\.com/([a-z-]+/)?[a-z0-9_-]+/hotel/[a-z0-9_-]+\.html)$' then
    raise exception 'Use a supported property listing, excluding personal links' using errcode='23514';
  end if;
  insert into public.facility_insight_evidence(organization_id,facility_id,kind,topic,source_url,observed_from,observed_to,sample_size,limitation,supporting_count)
    values(p_org,p_facility,p_kind,p_topic,link,p_from,p_to,p_sample,p_limitation,p_supporting) returning id into result;
  return result;
end;
$$;

create function public.facility_withdraw_insight(p_org uuid,p_facility uuid,p_evidence uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_insight_facility(p_org,p_facility,true);
  update public.facility_insight_evidence set withdrawn_at=now(),withdrawn_by=auth.uid()
   where organization_id=p_org and facility_id=p_facility and id=p_evidence and withdrawn_at is null;
  if not found then raise exception 'Active evidence unavailable' using errcode='22023'; end if;
end;
$$;

-- Explicit window keeps both approval keys and the portal payload bounded.
create function public.facility_swot(p_org uuid,p_facility uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if (auth.jwt()->>'aal') is distinct from 'aal2' or not exists
    (select 1 from public.facilities where id=p_facility and organization_id=p_org)
    then raise exception 'Facility unavailable' using errcode='42501'; end if;
  with evidence as materialized (
    select id,kind,topic,source_url,observed_from,observed_to,sample_size,supporting_count,limitation,verified_at
    from public.facility_insight_evidence where facility_id=p_facility and organization_id=p_org and withdrawn_at is null
    order by verified_at desc,id limit 40
  ), summary as (
    select coalesce(jsonb_agg(to_jsonb(e) order by verified_at desc,id),'[]') as rows,
      coalesce(array_agg(id order by id),'{}'::uuid[]) as ids,
      count(distinct split_part(topic,'_',2))=4 and coalesce(bool_or(kind='guest_summary'),false)
      and coalesce(bool_or(kind='site_source'),false) as eligible
    from evidence e
  )
  select jsonb_build_object('version','swot-v1','status',case when a.id is null then 'draft' else 'approved' end,
    'evidence',s.rows,'eligible',s.eligible,'approved_at',a.approved_at,
    'can_verify',private.current_org_role(p_org)='owner','can_approve',private.can_approve_org(p_org))
  into result from summary s left join public.facility_swot_approvals a on a.organization_id=p_org and a.facility_id=p_facility
     and a.version='swot-v1' and a.evidence_ids=s.ids;
  return result;
end;
$$;

create function public.facility_approve_swot(p_org uuid,p_facility uuid,p_version text,p_ids uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare snap jsonb; current_ids uuid[]; offered_ids uuid[]; result uuid;
begin
  perform private.lock_insight_facility(p_org,p_facility,false);
  snap:=public.facility_swot(p_org,p_facility);
  select array_agg((x->>'id')::uuid order by (x->>'id')::uuid) into current_ids from jsonb_array_elements(snap->'evidence') x;
  select array_agg(i order by i) into offered_ids from unnest(p_ids) i;
  if p_version is distinct from 'swot-v1' or (snap->>'eligible')::boolean is not true
    or offered_ids is distinct from current_ids then
    raise exception 'Refresh the draft and complete all four areas before approval' using errcode='23514';
  end if;
  insert into public.facility_swot_approvals(organization_id,facility_id,version,evidence_ids)
    values(p_org,p_facility,p_version,current_ids) on conflict do nothing returning id into result;
  if result is null then
    select id into result from public.facility_swot_approvals where organization_id=p_org and facility_id=p_facility and version=p_version and evidence_ids=current_ids;
  end if;
  return result;
end;
$$;
revoke all on function public.facility_verify_insight(uuid,uuid,text,text,text,date,date,integer,text,boolean,integer),public.facility_withdraw_insight(uuid,uuid,uuid),public.facility_swot(uuid,uuid),public.facility_approve_swot(uuid,uuid,text,uuid[]) from public,anon,authenticated;
grant execute on function public.facility_verify_insight(uuid,uuid,text,text,text,date,date,integer,text,boolean,integer),public.facility_withdraw_insight(uuid,uuid,uuid),public.facility_swot(uuid,uuid),public.facility_approve_swot(uuid,uuid,text,uuid[]) to authenticated;
commit;
