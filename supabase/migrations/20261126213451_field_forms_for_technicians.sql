-- Additive release. The existing portal, roles, files and facility rows are untouched.
create table private.field_form_keys(code text primary key, keys text[] not null);
insert into private.field_form_keys(code,keys)
select k,array(select jsonb_array_elements_text(v)) from jsonb_each($catalog${"F01": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17"], "F02": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17", "C18", "C19"], "F03": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17", "C18", "C19"], "F04": ["C8", "C9", "C10", "C11", "C12", "C15", "C16"], "F05": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16"], "F06": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17"], "F07": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17"], "F08": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17", "C18", "C19", "C20", "C21", "C22", "C23", "C24", "C25", "C26", "C27", "C28", "C29", "C30"], "F09": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17"], "F10": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16"], "F11": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16"], "F12": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17"], "F13": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16"], "F14": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17"], "F15": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17", "C18"], "F16": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16"], "F17": ["C8", "C9", "C10", "C11", "C12", "C13", "C15", "C16", "C17"], "F18": ["C8", "C9", "C10", "C11", "C14", "C15", "C16", "C17", "C18", "C19", "C21"], "F19": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16"], "F20": ["C8", "C9", "C10", "C11", "C12", "C13", "C14"], "F21": ["C8", "C9", "C10", "C11", "C12", "C15", "C16", "C17", "C19", "C22"], "F22": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17"], "F23": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17"], "F24": ["C8", "C11", "C12", "C13", "C14", "C15", "C16"], "F25": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17"], "F26": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17"], "F27": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17"], "F28": ["C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17"]}$catalog$::jsonb) as e(k,v);
create table private.field_form_assignments (
 facility_id uuid not null, organization_id uuid not null, technician uuid not null, assigned_by uuid not null default auth.uid(), assigned_at timestamptz not null default now(),
 primary key(facility_id,technician), foreign key(organization_id,facility_id) references public.facilities(organization_id,id),
 foreign key(organization_id,technician) references public.organization_members(organization_id,user_id)
);
create table public.field_form_records (
 id uuid primary key, facility_id uuid not null, organization_id uuid not null, code text not null references private.field_form_keys(code),
 template_version smallint not null default 1, author_id uuid not null references auth.users(id),
 answers jsonb not null default '{}', sources jsonb not null default '{}', status text not null check(status in ('draft','submitted')), version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), submitted_at timestamptz,
 foreign key(organization_id,facility_id) references public.facilities(organization_id,id)
);
create index field_form_recent on public.field_form_records(facility_id,updated_at desc,id);
create table private.field_form_events(record_id uuid not null references public.field_form_records(id),version integer not null,actor uuid not null,action text not null,at_time timestamptz not null default now(),primary key(record_id,version));
alter table public.field_form_records enable row level security;
revoke all on public.field_form_records from public,anon,authenticated;
grant select on public.field_form_records to authenticated;
revoke all on private.field_form_keys, private.field_form_assignments, private.field_form_events from public,anon,authenticated;

create function private.field_form_access(site uuid) returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.jwt()->>'aal')='aal2' and exists(select 1 from public.facilities f where f.id=site and
 (private.can_approve_org(f.organization_id) or (private.has_org_access(f.organization_id) and exists
 (select 1 from private.field_form_assignments a where a.facility_id=f.id and a.technician=auth.uid()))))
$$;
create policy field_form_read on public.field_form_records for select to authenticated using(private.field_form_access(facility_id) and (author_id=auth.uid() or private.can_approve_org(organization_id)));
create function public.field_form_sites() returns table(id uuid,name text,can_manage boolean) language sql stable security definer set search_path='' as $$
 select f.id,f.name,coalesce(private.can_approve_org(f.organization_id),false) from public.facilities f where private.field_form_access(f.id) order by f.name,f.id
$$;
create function public.field_form_technicians(site uuid) returns table(id uuid,name text,assigned boolean) language sql stable security definer set search_path='' as $$
 select m.user_id,m.full_name,exists(select 1 from private.field_form_assignments a where a.facility_id=f.id and a.technician=m.user_id)
 from public.facilities f join public.organization_members m on m.organization_id=f.organization_id where f.id=site and m.active and auth.jwt()->>'aal'='aal2' and private.can_approve_org(f.organization_id) order by m.full_name,m.user_id
$$;
create function public.field_form_assign(site uuid, member_id uuid, enabled boolean) returns void language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
 select f.organization_id into strict org from public.facilities f where f.id=site and auth.jwt()->>'aal'='aal2' and private.can_approve_org(f.organization_id);
 if enabled then
  insert into private.field_form_assignments(facility_id,organization_id,technician)
  select site,org,m.user_id from public.organization_members m where m.user_id=member_id and m.organization_id=org and m.active
  on conflict(facility_id,technician) do nothing;
 else delete from private.field_form_assignments a where a.facility_id=site and a.technician=member_id; end if;
end $$;
create function public.field_form_save(record_id uuid,site uuid,template text,expected integer,entries jsonb,linked jsonb,send boolean) returns public.field_form_records language plpgsql security definer set search_path='' as $$
declare rec public.field_form_records; org uuid; allowed text[]; k text; v jsonb; source_rec public.field_form_records;
begin
 if auth.uid() is null or not coalesce(private.field_form_access(site),false) then raise exception 'FORM_ACCESS'; end if;
 select f.organization_id into strict org from public.facilities f where f.id=site;
 select t.keys into strict allowed from private.field_form_keys t where t.code=template;
 if expected is null or expected<0 or send is null or record_id is null or jsonb_typeof(entries) is distinct from 'object' or jsonb_typeof(linked) is distinct from 'object' or octet_length(entries::text)>220000 then raise exception 'FORM_INVALID';end if;
 for k,v in select * from jsonb_each(entries) loop
  if not k=any(allowed) or jsonb_typeof(v)<>'string' or length(v#>>'{}')>4000 then raise exception 'FORM_INVALID';end if;
 end loop;
 if send and exists(select from unnest(allowed) as u(key) where nullif(btrim(entries->>u.key),'') is null) then raise exception 'FORM_INCOMPLETE';end if;
 for k,v in select * from jsonb_each(linked) loop
  if template<>'F24' or k not in ('F18','F21') or jsonb_typeof(v)<>'string' then raise exception 'FORM_SOURCE';end if;
  select * into source_rec from public.field_form_records s where s.id=(v#>>'{}')::uuid and s.facility_id=site and s.code=k and s.status='submitted'
   and (s.author_id=auth.uid() or private.can_approve_org(org));
  if not found or (send and (entries->>'C8') is distinct from (case when k='F18' then source_rec.answers->>'C8' else source_rec.answers->>'C22' end)) then raise exception 'FORM_SOURCE';end if;
 end loop;
 if send and template='F24' and not (linked ?& array['F18','F21']) then raise exception 'FORM_SOURCE';end if;
 perform pg_advisory_xact_lock(hashtextextended(record_id::text,0));
 select * into rec from public.field_form_records s where s.id=record_id for update;
 if found then
  if rec.facility_id<>site or rec.author_id<>auth.uid() or rec.code<>template then raise exception 'FORM_ACCESS';end if;
  if rec.answers=entries and rec.sources=linked and rec.status=(case when send then 'submitted' else 'draft' end) then return rec;end if;
  if rec.version<>expected or rec.status<>'draft' then raise exception 'FORM_CHANGED';end if;
  update public.field_form_records s set answers=entries,sources=linked,status=case when send then 'submitted' else 'draft' end,version=s.version+1,updated_at=now(),submitted_at=case when send then now() end where s.id=record_id returning * into rec;
 else
  if expected<>0 then raise exception 'FORM_CHANGED';end if;
  insert into public.field_form_records(id,facility_id,organization_id,code,author_id,answers,sources,status,submitted_at) values(record_id,site,org,template,auth.uid(),entries,linked,case when send then 'submitted' else 'draft' end,case when send then now() end) returning * into rec;
 end if;
 insert into private.field_form_events values(rec.id,rec.version,auth.uid(),rec.status,now());
 return rec;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('field-form-photos','field-form-photos',false,6291456,array['image/jpeg']);
-- Use the full canonical path. Do not expose other buckets through the form policies.
create function private.field_form_photo_access(object_path text,writing boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.field_form_records;
begin
 if object_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$' then return false;end if;
 if writing then select * into r from public.field_form_records where id=split_part(object_path,'/',1)::uuid for share;
 else select * into r from public.field_form_records where id=split_part(object_path,'/',1)::uuid;end if;
 return r.id is not null and private.field_form_access(r.facility_id) and ((r.author_id=auth.uid() and (not writing or r.status='draft')) or (not writing and private.can_approve_org(r.organization_id)));
end $$;
create policy field_form_photo_read on storage.objects for select to authenticated using (bucket_id='field-form-photos' and private.field_form_photo_access(name,false));
create policy field_form_photo_upload on storage.objects for insert to authenticated with check (bucket_id='field-form-photos' and private.field_form_photo_access(name,true));
-- Photographs become immutable evidence when the form is submitted.
create policy field_form_photo_remove on storage.objects for delete to authenticated using (bucket_id='field-form-photos' and private.field_form_photo_access(name,true));
do $$declare signature text;begin
 foreach signature in array array['private.field_form_access(uuid)','private.field_form_photo_access(text,boolean)','public.field_form_sites()','public.field_form_technicians(uuid)','public.field_form_assign(uuid,uuid,boolean)','public.field_form_save(uuid,uuid,text,integer,jsonb,jsonb,boolean)']loop
 execute format('revoke all on function %s from public,anon,authenticated',signature);
 execute format('grant execute on function %s to authenticated',signature);
 end loop;
end $$;
notify pgrst,'reload schema';
