-- V2 is additive. Original submissions and photos stay immutable.
create table public.field_form_reviews (
 record_id uuid primary key references public.field_form_records(id),
 decision text not null check(decision in ('accepted','returned')),
 reason text not null check(length(reason) between 1 and 2000),
 reviewer_id uuid not null references auth.users(id),
 reviewed_at timestamptz not null default now(),
 correction_id uuid unique references public.field_form_records(id)
);
alter table public.field_form_reviews enable row level security;
revoke all on public.field_form_reviews from public,anon,authenticated;
grant select on public.field_form_reviews to authenticated;
create policy read_linked_form_review on public.field_form_reviews for select to authenticated using
 (exists(select 1 from public.field_form_records r where r.id=record_id));
create function public.field_form_decide(target uuid, verdict text, explanation text) returns public.field_form_reviews
language plpgsql security definer set search_path='' as $$
declare r public.field_form_records; rev public.field_form_reviews; note text:=btrim(explanation);
begin
 select * into r from public.field_form_records where id=target for update;
 if not found or not coalesce(private.field_form_access(r.facility_id) and private.can_approve_org(r.organization_id),false)
  or r.author_id=auth.uid() or r.status<>'submitted' then raise exception 'REVIEW_ACCESS';end if;
 if verdict is null or verdict not in ('accepted','returned') or coalesce(length(note),0) not between 1 and 2000 then raise exception 'REVIEW_REASON';end if;
 select * into rev from public.field_form_reviews where record_id=target;
 if found then
  if rev.reviewer_id=auth.uid() and rev.decision=verdict and rev.reason=note then return rev;end if;
  raise exception 'REVIEW_FIXED';
 end if;
 insert into public.field_form_reviews(record_id,decision,reason,reviewer_id) values(target,verdict,note,auth.uid()) returning * into rev;
 return rev;
end $$;
create function public.field_form_correct(target uuid) returns public.field_form_records language plpgsql security definer set search_path='' as $$
declare r public.field_form_records; rev public.field_form_reviews; child public.field_form_records;
begin
 select * into r from public.field_form_records where id=target;
 if not found or r.author_id<>auth.uid() or not coalesce(private.field_form_access(r.facility_id),false) then raise exception 'REVIEW_ACCESS';end if;
 select * into rev from public.field_form_reviews where record_id=target for update;
 if not found or rev.decision<>'returned' then raise exception 'REVIEW_FIXED';end if;
 if rev.correction_id is not null then select * into strict child from public.field_form_records where id=rev.correction_id;return child;end if;
 insert into public.field_form_records(id,facility_id,organization_id,code,template_version,author_id,answers,sources,status)
 values(gen_random_uuid(),r.facility_id,r.organization_id,r.code,r.template_version,r.author_id,r.answers,r.sources,'draft') returning * into child;
 update public.field_form_reviews set correction_id=child.id where record_id=target;
 insert into private.field_form_events values(child.id,child.version,auth.uid(),'correction_draft',now());
 return child;
end $$;
revoke all on function public.field_form_decide(uuid,text,text),public.field_form_correct(uuid) from public,anon,authenticated;
grant execute on function public.field_form_decide(uuid,text,text),public.field_form_correct(uuid) to authenticated;

create function private.check_field_form_quality() returns trigger language plpgsql set search_path='' as $$
declare fields text[]; k text; v text; x numeric;
begin
 if new.status<>'submitted' then return new;end if;
 fields:=case new.code when 'F04' then array['C9','C10','C11'] when 'F17' then array['C10','C11','C12','C13']
 when 'F18' then array['C10','C11','C17','C18','C19'] when 'F20' then array['C9','C10','C11','C12','C13','C14']
 when 'F21' then array['C9','C10','C11','C12','C19'] else array[]::text[] end;
 foreach k in array fields loop
  v:=translate(btrim(coalesce(new.answers->>k,'')),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٫','01234567890123456789.');
  if length(v)>100 or v !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$' then raise exception 'FORM_VALUE:%',k;end if;
  x:=v::numeric;
  if (new.code='F04' and (x<1 or x>5 or x<>trunc(x))) or (new.code='F17' and (x<0 or x>100))
   or (new.code='F20' and ((k='C14' and x<=-1) or (k<>'C14' and x<0)))
   or (new.code='F21' and ((k='C19' and x<=0) or x<0)) then raise exception 'FORM_VALUE:%',k;end if;
 end loop;
 if new.code in ('F04','F17') then
  k:=case when new.code='F04' then 'C12' else 'C15' end;
  if coalesce(new.answers->>k,'') not in ('نعم','لا') then raise exception 'FORM_VALUE:%',k;end if;
 end if;
 -- A previously returned source is superseded. Preserve already submitted historical reports.
 if new.code='F24' and exists(select from jsonb_each_text(new.sources) src join public.field_form_reviews rv on rv.record_id=src.value::uuid where rv.decision='returned') then raise exception 'FORM_SOURCE';end if;
 return new;
end $$;
revoke all on function private.check_field_form_quality() from public,anon,authenticated;
create trigger field_form_quality before insert or update on public.field_form_records for each row execute function private.check_field_form_quality();
notify pgrst,'reload schema';
