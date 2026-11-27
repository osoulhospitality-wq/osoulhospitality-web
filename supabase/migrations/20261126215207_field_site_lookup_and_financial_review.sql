create index field_form_assignments_by_technician on private.field_form_assignments(technician,facility_id);
-- Start from this technician's assignments. Do not evaluate a scope function for each unrelated facility.
create or replace function public.field_form_sites() returns table(id uuid,name text,can_manage boolean)
language sql stable security definer set search_path='' as $$
 with member as materialized (
  select m.organization_id,m.role from public.organization_members m
  where m.user_id=(select auth.uid()) and m.active and (select auth.jwt()->>'aal')='aal2'
 ), visible as (
  select f.id,f.name,true as can_manage from member m join public.facilities f on f.organization_id=m.organization_id
  where m.role in ('owner','approver')
  union all
  select f.id,f.name,false from private.field_form_assignments a join member m on m.organization_id=a.organization_id
  join public.facilities f on (f.organization_id,f.id)=(a.organization_id,a.facility_id)
  where a.technician=(select auth.uid()) and m.role not in ('owner','approver')
 ) select v.id,v.name,v.can_manage from visible v order by v.name,v.id
$$;
create function private.field_review_source_acceptance() returns trigger language plpgsql set search_path='' as $$
declare r public.field_form_records;
begin
 if new.decision='accepted' then
  select * into strict r from public.field_form_records where id=new.record_id;
  if r.code='F24' and (select count(*) from jsonb_each_text(r.sources) s join public.field_form_reviews rv on rv.record_id=s.value::uuid where s.key in ('F18','F21') and rv.decision='accepted')<>2 then
   raise exception 'REVIEW_FINANCE';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.field_review_source_acceptance() from public,anon,authenticated;
create trigger field_review_sources before insert on public.field_form_reviews for each row execute function private.field_review_source_acceptance();
notify pgrst,'reload schema';
