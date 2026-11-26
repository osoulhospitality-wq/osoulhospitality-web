begin;

-- These are measurement types, not regulatory thresholds. Signed cash includes overdrafts;
-- signed capex variance always means actual less budget.
create function private.facility_council_metric_catalog()
returns table(metric text,unit text) language sql immutable set search_path='' as $$
 values ('occupancy_pct','pct'),('lead_conversion_pct','pct'),('qualified_leads','count'),
 ('guest_complaints','count'),('cash_balance_sar','sar_signed'),('operating_cost_sar','sar_nonnegative'),
 ('capex_variance_sar','sar_signed'),('late_milestones','count'),('overdue_pm','count'),
 ('repeat_faults','count'),('energy_kwh','kwh'),('staff_shortfall','count'),
 ('vendor_sla_pct','pct'),('compliance_open','count')
$$;
create function private.facility_council_valid_value(metric_key text,observed numeric)
returns boolean language sql immutable strict set search_path='' as $$
 select observed::text not in ('NaN','Infinity','-Infinity') and exists(
   select 1 from private.facility_council_metric_catalog() m where m.metric=metric_key and
     case m.unit
       when 'pct' then observed between 0 and 100
       when 'count' then observed>=0 and trunc(observed)=observed
       when 'sar_nonnegative' then observed>=0 and round(observed,2)=observed
       when 'sar_signed' then round(observed,2)=observed
       when 'kwh' then observed>=0
       else false end)
$$;
revoke all on function private.facility_council_metric_catalog(),private.facility_council_valid_value(text,numeric) from public,anon,authenticated;

create table public.facility_council_observations (
 id uuid primary key,
 organization_id uuid not null, facility_id uuid not null,
 metric text not null, month date not null, value numeric not null,
 source_ref text not null check(length(btrim(source_ref)) between 3 and 500),
 retrieved_on date not null, verified_by uuid not null references auth.users(id),
 verified_at timestamptz not null default clock_timestamp(),
 check(private.facility_council_valid_value(metric,value)),
 check(isfinite(month) and extract(day from month)=1),
 -- Last-day final extracts are eligible only after their full Riyadh month has closed.
 check(month < date_trunc('month',verified_at at time zone 'Asia/Riyadh')::date
   and isfinite(retrieved_on) and retrieved_on >= ((month+interval '1 month')::date - 1)
   and retrieved_on <= (verified_at at time zone 'Asia/Riyadh')::date),
 foreign key(organization_id,facility_id) references public.facilities(organization_id,id),
 unique(organization_id,facility_id,metric,month,id),
 unique(organization_id,facility_id,metric,month,source_ref,retrieved_on,value)
);
-- Bind even a fresh client UUID that replays an already imported source row.
create table private.facility_council_intake_receipts (
 request_id uuid primary key,
 observation_id uuid not null references public.facility_council_observations(id)
);
revoke all on private.facility_council_intake_receipts from public,anon,authenticated;
create index facility_council_observations_scope on public.facility_council_observations(organization_id,facility_id,month desc,metric);
create table public.facility_council_resolutions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null, facility_id uuid not null, metric text not null, month date not null,
 chosen_id uuid not null, evidence_ids uuid[] not null, evidence_count integer not null check(evidence_count>=2 and evidence_count=cardinality(evidence_ids)),
 reason text not null check(length(trim(reason)) between 3 and 1000),
 decided_by uuid not null references auth.users(id), decided_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,facility_id,metric,month,chosen_id) references public.facility_council_observations(organization_id,facility_id,metric,month,id),
 unique(organization_id,facility_id,metric,month,evidence_count)
);
create trigger council_observation_append_only before update or delete on public.facility_council_observations
 for each row execute function private.draqon_event_immutable();
create trigger council_resolution_append_only before update or delete on public.facility_council_resolutions
 for each row execute function private.draqon_event_immutable();
alter table public.facility_council_observations enable row level security;
alter table public.facility_council_resolutions enable row level security;
revoke all on public.facility_council_observations,public.facility_council_resolutions from public,anon,authenticated;
grant select on public.facility_council_observations,public.facility_council_resolutions to authenticated;
create policy council_staff_history on public.facility_council_observations for select to authenticated
 using(private.can_write_org(organization_id) and (select auth.jwt()->>'aal')='aal2');
create policy council_staff_resolution on public.facility_council_resolutions for select to authenticated
 using(private.can_write_org(organization_id) and (select auth.jwt()->>'aal')='aal2');

create function public.facility_council_record(p_org uuid,p_facility uuid,p_id uuid,p_metric text,p_month date,p_value numeric,p_source text,p_retrieved date)
returns uuid language plpgsql security definer set search_path='' as $$
declare obs public.facility_council_observations; source text:=btrim(p_source);
begin
 perform private.draqon_assert_field_actor(p_org,true);
 -- Serialize evidence changes and a concurrent decision at the same property.
 perform 1 from public.facilities where organization_id=p_org and id=p_facility for update;
 if not found then raise insufficient_privilege; end if;
 insert into public.facility_council_observations(id,organization_id,facility_id,metric,month,value,source_ref,retrieved_on,verified_by)
 values(p_id,p_org,p_facility,p_metric,p_month,p_value,source,p_retrieved,auth.uid()) on conflict do nothing;
 select * into obs from public.facility_council_observations where id=p_id;
 if found then
   if (obs.organization_id,obs.facility_id,obs.metric,obs.month,obs.value,obs.source_ref,obs.retrieved_on)
        is distinct from (p_org,p_facility,p_metric,p_month,p_value,source,p_retrieved) then
     raise exception 'Conflicting observation submission ID' using errcode='23505';
   end if;
 else
   -- Same source, extraction date and value may be replayed with a new client ID.
   select * into strict obs from public.facility_council_observations
   where organization_id=p_org and facility_id=p_facility and metric=p_metric and month=p_month and
     value=p_value and source_ref=source and retrieved_on=p_retrieved;
 end if;
 insert into private.facility_council_intake_receipts(request_id,observation_id) values(p_id,obs.id)
 on conflict(request_id) do nothing;
 if not exists(select 1 from private.facility_council_intake_receipts where request_id=p_id and observation_id=obs.id)
   then raise exception 'Previously submitted ID has different source evidence' using errcode='23505'; end if;
 return obs.id;
end;
$$;

create function public.facility_council_resolve(p_org uuid,p_facility uuid,p_observation uuid,p_reason text,p_evidence_ids uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare picked public.facility_council_observations; receipt public.facility_council_resolutions;
 current_ids uuid[]; submitted_ids uuid[]; alternatives int;
begin
 perform private.draqon_assert_field_actor(p_org,true);
 perform 1 from public.facilities where organization_id=p_org and id=p_facility for update;
 if not found then raise insufficient_privilege; end if;
 select * into picked from public.facility_council_observations where organization_id=p_org and facility_id=p_facility and id=p_observation;
 if not found then raise insufficient_privilege; end if;
 select array_agg(id order by id),count(distinct value) into current_ids,alternatives from public.facility_council_observations
 where organization_id=p_org and facility_id=p_facility and metric=picked.metric and month=picked.month;
 select array_agg(i order by i) into submitted_ids from unnest(p_evidence_ids) i;
 if alternatives<2 or current_ids is distinct from submitted_ids then
   raise exception 'Reload all competing source references before deciding' using errcode='23514';
 end if;
 insert into public.facility_council_resolutions(organization_id,facility_id,metric,month,chosen_id,evidence_ids,evidence_count,reason,decided_by)
 values(p_org,p_facility,picked.metric,picked.month,picked.id,current_ids,cardinality(current_ids),trim(p_reason),auth.uid())
 on conflict(organization_id,facility_id,metric,month,evidence_count) do nothing;
 select * into strict receipt from public.facility_council_resolutions where organization_id=p_org and facility_id=p_facility
   and metric=picked.metric and month=picked.month and evidence_count=cardinality(current_ids);
 if (receipt.chosen_id,receipt.reason) is distinct from (p_observation,trim(p_reason)) then
   raise exception 'A different adjudication for this evidence set already exists' using errcode='23505';
 end if;
 return receipt.id;
end;
$$;

-- One group per completed month. Additional sources invalidate a decision made against an older set.
-- The tie-breaking source is only used for a unanimously supported value or an explicit adjudication.
create view public.facility_council_monthly with (security_invoker=true) as
with groups as (
 select o.organization_id,o.facility_id,o.metric,o.month,count(*)::integer evidence_count,
   count(distinct o.value) alternatives,array_agg(o.id order by o.id) ids,
   (array_agg(o.id order by o.retrieved_on desc,o.verified_at desc,o.id))[1] latest,
   jsonb_agg(jsonb_build_object('id',o.id,'value',o.value,'source_ref',o.source_ref,'retrieved_on',o.retrieved_on,
     'verified_by',o.verified_by,'verified_at',o.verified_at) order by o.retrieved_on desc,o.verified_at desc,o.id) evidence
 from public.facility_council_observations o group by o.organization_id,o.facility_id,o.metric,o.month
)
select g.organization_id,g.facility_id,g.metric,g.month,w.value,
 case when g.alternatives=1 then 'verified' when r.id is not null then 'resolved' else 'conflict' end as status,
 w.source_ref,w.retrieved_on,w.verified_by,w.verified_at,g.evidence_count,w.id observation_id,g.evidence,
 r.id resolution_id,r.reason resolution_reason,r.decided_by,r.decided_at
from groups g
left join public.facility_council_resolutions r on r.organization_id=g.organization_id and r.facility_id=g.facility_id
 and r.metric=g.metric and r.month=g.month and r.evidence_count=g.evidence_count and r.evidence_ids=g.ids
left join public.facility_council_observations w on w.id=case when g.alternatives=1 then g.latest else r.chosen_id end;
revoke all on public.facility_council_monthly from public,anon,authenticated;
grant select on public.facility_council_monthly to authenticated;

create function public.facility_council_history(p_org uuid,p_facility uuid) returns setof public.facility_council_monthly
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or (auth.jwt()->>'aal') is distinct from 'aal2' or not coalesce(private.can_write_org(p_org),false)
   or not exists(select 1 from public.facilities where organization_id=p_org and id=p_facility) then raise insufficient_privilege; end if;
 return query select m.* from public.facility_council_monthly m where m.organization_id=p_org and m.facility_id=p_facility order by m.month desc,m.metric;
end;
$$;
revoke all on function public.facility_council_record(uuid,uuid,uuid,text,date,numeric,text,date),
 public.facility_council_resolve(uuid,uuid,uuid,text,uuid[]),public.facility_council_history(uuid,uuid) from public,anon;
grant execute on function public.facility_council_record(uuid,uuid,uuid,text,date,numeric,text,date),
 public.facility_council_resolve(uuid,uuid,uuid,text,uuid[]),public.facility_council_history(uuid,uuid) to authenticated;
commit;
