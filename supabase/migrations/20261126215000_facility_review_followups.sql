begin;

-- A completed review may still own work. Keep the original item and cite the
-- later, closed round whose checked topic actually resolved its evidence gap.
create table public.facility_review_resolutions (
  organization_id uuid not null,
  facility_id uuid not null,
  round_id uuid not null,
  topic text not null,
  checked_round_id uuid not null,
  resolved_by uuid not null references auth.users(id),
  resolved_at timestamptz not null default clock_timestamp(),
  primary key(round_id,topic),
  check(round_id<>checked_round_id),
  foreign key(organization_id,facility_id,round_id) references public.facility_review_rounds(organization_id,facility_id,id),
  foreign key(organization_id,facility_id,checked_round_id) references public.facility_review_rounds(organization_id,facility_id,id),
  foreign key(round_id,topic) references public.facility_review_items(round_id,topic),
  foreign key(checked_round_id,topic) references public.facility_review_items(round_id,topic)
);
create trigger facility_review_resolution_immutable before update or delete on public.facility_review_resolutions
  for each row execute function private.draqon_event_immutable();
create index facility_review_followup_queue on public.facility_review_items(organization_id,facility_id,follow_up_on,round_id,topic)
  where state='follow_up';
alter table public.facility_review_resolutions enable row level security;
revoke all on public.facility_review_resolutions from public,anon,authenticated;
grant select on public.facility_review_resolutions to authenticated;
create policy member_reads_review_resolution on public.facility_review_resolutions for select to authenticated
  using(private.has_org_access(organization_id) and (select auth.jwt()->>'aal')='aal2');

create function public.facility_review_followups(p_org uuid,p_facility uuid)
returns table(topic text,note text,due_on date,round_id uuid)
language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null or (auth.jwt()->>'aal') is distinct from 'aal2' or not coalesce(private.has_org_access(p_org),false)
     or not exists(select 1 from public.facilities f where f.organization_id=p_org and f.id=p_facility) then
    raise insufficient_privilege;
  end if;
  return query
    select i.topic,i.decision_note,i.follow_up_on,i.round_id
    from public.facility_review_items i join public.facility_review_rounds r on r.id=i.round_id
    where i.organization_id=p_org and i.facility_id=p_facility and i.state='follow_up' and r.closed_at is not null
      and not exists(select 1 from public.facility_review_resolutions receipt where receipt.round_id=i.round_id and receipt.topic=i.topic)
    order by i.follow_up_on,r.closed_at,i.round_id,i.topic;
end;
$$;

create function public.facility_review_resolve_followup(p_org uuid,p_facility uuid,p_round uuid,p_topic text,p_checked_round uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare source_closed timestamptz; previous_evidence uuid;
begin
  perform private.draqon_assert_field_actor(p_org,true);
  select r.closed_at into source_closed from public.facility_review_rounds r
    join public.facility_review_items i on i.round_id=r.id and i.topic=p_topic and i.state='follow_up'
    where r.organization_id=p_org and r.facility_id=p_facility and r.id=p_round and r.closed_at is not null;
  if not found then raise exception 'No closed follow-up at this property' using errcode='42501'; end if;
  if not exists(
    select 1 from public.facility_review_rounds r
    join public.facility_review_items i on i.round_id=r.id and i.topic=p_topic
    where r.organization_id=p_org and r.facility_id=p_facility and r.id=p_checked_round and r.id<>p_round
      and r.closed_at>source_closed and i.recorded_at>source_closed and i.state='checked' and i.evidence_snapshot is not null
  ) then raise exception 'Cite a later closed round with checked evidence for this same topic' using errcode='23514'; end if;

  insert into public.facility_review_resolutions(organization_id,facility_id,round_id,topic,checked_round_id,resolved_by)
    values(p_org,p_facility,p_round,p_topic,p_checked_round,auth.uid()) on conflict(round_id,topic) do nothing;
  select checked_round_id into previous_evidence from public.facility_review_resolutions where round_id=p_round and topic=p_topic;
  if previous_evidence is distinct from p_checked_round then
    raise exception 'Follow-up was resolved using different evidence' using errcode='23505';
  end if;
  return p_checked_round;
end;
$$;
revoke all on function public.facility_review_followups(uuid,uuid),
  public.facility_review_resolve_followup(uuid,uuid,uuid,text,uuid) from public,anon;
grant execute on function public.facility_review_followups(uuid,uuid),
  public.facility_review_resolve_followup(uuid,uuid,uuid,text,uuid) to authenticated;
commit;
