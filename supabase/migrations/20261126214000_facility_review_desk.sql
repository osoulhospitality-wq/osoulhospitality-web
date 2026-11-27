begin;

-- Each round belongs to one property. Starting the same round from two devices
-- returns one open case. Older closed rounds keep their own evidence and owners.
create table public.facility_review_rounds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  facility_id uuid not null,
  opened_by uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  target_date date not null check (isfinite(target_date)),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  outcome text check (outcome in ('reviewed','follow_up_required')),
  foreign key(organization_id,facility_id) references public.facilities(organization_id,id),
  unique(organization_id,facility_id,id)
);
create unique index facility_review_one_open on public.facility_review_rounds(organization_id,facility_id) where closed_at is null;
create table public.facility_review_items (
  organization_id uuid not null, facility_id uuid not null, round_id uuid not null,
  topic text not null check (topic in ('building','staff','assets','maintenance','swot','prices')),
  state text not null default 'pending' check (state in ('pending','checked','follow_up')),
  decision_note text, evidence_snapshot jsonb, recorded_by uuid references auth.users(id), recorded_at timestamptz,
  primary key(round_id,topic),
  foreign key(organization_id,facility_id,round_id) references public.facility_review_rounds(organization_id,facility_id,id)
);
alter table public.facility_review_rounds enable row level security;
alter table public.facility_review_items enable row level security;
revoke all on public.facility_review_rounds,public.facility_review_items from public,anon,authenticated;
grant select on public.facility_review_rounds,public.facility_review_items to authenticated;
create policy review_member_read on public.facility_review_rounds for select to authenticated using
  (private.has_org_access(organization_id) and ((select auth.jwt())->>'aal')='aal2');
create policy review_item_member_read on public.facility_review_items for select to authenticated using
  (private.has_org_access(organization_id) and ((select auth.jwt())->>'aal')='aal2');

create function public.facility_review_open(p_org uuid,p_facility uuid,p_target date)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform private.draqon_assert_field_actor(p_org,false);
 if p_target is null or not isfinite(p_target) or not exists(select from public.facilities where organization_id=p_org and id=p_facility) then
   raise exception 'Invalid property or date' using errcode='22023';
 end if;
 -- Serialize round creation without replacing a target date approved on another device.
 perform 1 from public.facilities where organization_id=p_org and id=p_facility for update;
 select id into result from public.facility_review_rounds where organization_id=p_org and facility_id=p_facility and closed_at is null;
 if found then return result; end if;
 insert into public.facility_review_rounds(organization_id,facility_id,opened_by,target_date)
 values(p_org,p_facility,auth.uid(),p_target) returning id into result;
 insert into public.facility_review_items(organization_id,facility_id,round_id,topic)
 select p_org,p_facility,result,topic from unnest(array['building','staff','assets','maintenance','swot','prices']) as t(topic);
 return result;
end;
$$;

create function public.facility_review_close(p_org uuid,p_facility uuid,p_round uuid)
returns text language plpgsql security definer set search_path='' as $$
declare r public.facility_review_rounds; result text;
begin
 perform private.draqon_assert_field_actor(p_org,true);
 select * into r from public.facility_review_rounds where organization_id=p_org and facility_id=p_facility and id=p_round for update;
 if not found then raise exception 'Unknown round' using errcode='42501'; end if;
 if r.closed_at is not null then return r.outcome; end if;
 if (select count(*) from public.facility_review_items where round_id=p_round and state<>'pending') <> 6 then
   raise exception 'Every review topic needs an evidence decision or a documented follow-up' using errcode='23514';
 end if;
 select case when exists(select from public.facility_review_items where round_id=p_round and state='follow_up')
   then 'follow_up_required' else 'reviewed' end into result;
 update public.facility_review_rounds set closed_by=auth.uid(),closed_at=clock_timestamp(),outcome=result where id=p_round;
 return result;
end;
$$;
revoke all on function public.facility_review_open(uuid,uuid,date),public.facility_review_close(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.facility_review_open(uuid,uuid,date),public.facility_review_close(uuid,uuid,uuid) to authenticated;
alter table public.facility_review_items add column follow_up_on date check(isfinite(follow_up_on));

create function public.facility_review_brief(p_org uuid,p_facility uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare facts jsonb; assets jsonb; plans jsonb; insights jsonb; prices jsonb; active_round jsonb; last_round jsonb; site_name text; pending bigint;
begin
 if auth.uid() is null or (auth.jwt()->>'aal') is distinct from 'aal2' or not coalesce(private.has_org_access(p_org),false)
   then raise insufficient_privilege; end if;
 select name into site_name from public.facilities where organization_id=p_org and id=p_facility;
 if not found then raise insufficient_privilege; end if;
 with verified as (
   select m.*,max(observed_on) over(partition by fact_key) as most_recent from public.facility_memory_records m
   where organization_id=p_org and facility_id=p_facility and asset_id is null and verified_at is not null and fact_key<>'inspection_note'
 ), current_facts as (
   select fact_key,count(distinct fact_value) as alternatives,min(fact_value) as val,max(observed_on) as as_of,
     jsonb_agg(jsonb_build_object('id',id,'source',source_ref,'value',fact_value) order by recorded_at desc,id) as refs
   from verified where observed_on=most_recent group by fact_key
 )
 select coalesce(jsonb_object_agg(fact_key,jsonb_build_object('value',case when alternatives=1 then val end,
   'conflict',alternatives>1,'asOf',as_of,'source',refs->0->>'source','id',refs->0->>'id','sources',refs)), '{}') into facts from current_facts;
 select count(*) into pending from public.facility_memory_records where organization_id=p_org and facility_id=p_facility and verified_at is null;
 select jsonb_build_object('count',count(*),'firstId',min(id::text)) into assets from public.facility_assets where organization_id=p_org and facility_id=p_facility;
 select jsonb_build_object('count',count(*),'due',count(*) filter(where next_due_on <= (now() at time zone 'Asia/Riyadh')::date),
   'next',min(next_due_on),'firstId',(array_agg(id order by next_due_on,id))[1])
 into plans from public.facility_pm_plans where organization_id=p_org and facility_id=p_facility and paused_at is null;
 insights:=public.facility_swot(p_org,p_facility);
 select jsonb_build_object('count',count(*),'matched',count(*) filter(where reason='comparable'),'window',200,
   'sample',(jsonb_agg(to_jsonb(p) order by purchased_on desc,purchase_id) filter(where reason='comparable'))->0)
 into prices from public.draqon_facility_price_benchmark(p_org,p_facility) p;
 with recent as (
   (select * from public.facility_review_rounds where organization_id=p_org and facility_id=p_facility and closed_at is null limit 1)
   union all
   (select * from public.facility_review_rounds where organization_id=p_org and facility_id=p_facility and closed_at is not null order by closed_at desc,id limit 1)
 ), reports as (
   select r.closed_at,jsonb_build_object('id',r.id,'target',r.target_date,'closedAt',r.closed_at,'outcome',r.outcome,
     'items',(select jsonb_agg(jsonb_build_object('topic',i.topic,'state',i.state,'note',i.decision_note,'followUpOn',i.follow_up_on,
       'recordedBy',i.recorded_by,'recordedAt',i.recorded_at) order by i.topic) from public.facility_review_items i where i.round_id=r.id)) as doc
   from recent r
 )
 select (select doc from reports where closed_at is null),(select doc from reports where closed_at is not null) into active_round,last_round;
 return jsonb_build_object('facility',site_name,'facts',facts,'unverified',pending,'assets',assets,'maintenance',plans,
   'swot',insights,'prices',prices,'round',active_round,'lastRound',last_round,'canApprove',private.can_approve_org(p_org));
end;
$$;

create function public.facility_review_decide(p_org uuid,p_facility uuid,p_round uuid,p_topic text,p_state text,p_note text,p_follow_up_on date default null)
returns void language plpgsql security definer set search_path='' as $$
declare brief jsonb; evidence jsonb; enough boolean;
begin
 perform private.draqon_assert_field_actor(p_org,p_state='checked');
 perform 1 from public.facility_review_rounds where organization_id=p_org and facility_id=p_facility and id=p_round and closed_at is null for update;
 if not found then raise exception 'Round unavailable or closed' using errcode='42501'; end if;
 if p_topic is null or p_topic not in ('building','staff','assets','maintenance','swot','prices') or p_state is null or p_state not in ('follow_up','checked')
   or coalesce(length(btrim(p_note)),0) not between 3 and 1000 then raise exception 'Provide a scoped review decision' using errcode='22023'; end if;
 if p_state='follow_up' then
   if p_follow_up_on is null or not isfinite(p_follow_up_on) or p_follow_up_on < (now() at time zone 'Asia/Riyadh')::date
     then raise exception 'Follow-up needs a valid date' using errcode='22023'; end if;
   evidence:=null;
 else
   if p_follow_up_on is not null then raise exception 'Unexpected follow-up date' using errcode='22023'; end if;
   brief:=public.facility_review_brief(p_org,p_facility);
   case p_topic
    when 'building' then
      evidence:=jsonb_build_object('floors_above',brief#>'{facts,floors_above}','built_area_m2',brief#>'{facts,built_area_m2}','lifts',brief#>'{facts,lifts}');
      enough:=brief#>>'{facts,floors_above,value}' is not null and brief#>>'{facts,built_area_m2,value}' is not null and brief#>>'{facts,lifts,value}' is not null;
    when 'staff' then evidence:=brief#>'{facts,staff_total}'; enough:=evidence->>'value' is not null;
    when 'assets' then evidence:=brief->'assets'; enough:=(evidence->>'count')::int>0;
    when 'maintenance' then evidence:=brief->'maintenance'; enough:=(evidence->>'count')::int>0;
    when 'swot' then evidence:=brief->'swot'; enough:=evidence->>'status'='approved';
    when 'prices' then evidence:=brief->'prices'; enough:=(evidence->>'matched')::int>0;
   end case;
   if not coalesce(enough,false) then raise exception 'Topic needs supporting facility evidence' using errcode='23514'; end if;
 end if;
 update public.facility_review_items set state=p_state,decision_note=btrim(p_note),follow_up_on=p_follow_up_on,
   evidence_snapshot=evidence,recorded_by=auth.uid(),recorded_at=clock_timestamp() where round_id=p_round and topic=p_topic;
end;
$$;
revoke all on function public.facility_review_brief(uuid,uuid),public.facility_review_decide(uuid,uuid,uuid,text,text,text,date) from public,anon,authenticated;
grant execute on function public.facility_review_brief(uuid,uuid),public.facility_review_decide(uuid,uuid,uuid,text,text,text,date) to authenticated;
commit;
