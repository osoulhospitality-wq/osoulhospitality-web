-- A Storage upload becomes review evidence only when its reservation is confirmed.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('provider-evidence','provider-evidence',false,6291456,array['image/jpeg','image/png','application/pdf']);

create table private.fm_provider_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references private.fm_provider_submissions(id),
  uploader uuid not null references auth.users(id),
  media_type text not null check(media_type in ('image/jpeg','image/png','application/pdf')),
  byte_size integer not null check(byte_size between 1 and 6291456),
  reserved_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp()+interval '15 minutes'),
  confirmed_at timestamptz,
  object_name text generated always as (submission_id::text||'/'||id::text||case media_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.pdf' end) stored unique
);
create index fm_provider_files_submission on private.fm_provider_files(submission_id,confirmed_at);
alter table private.fm_provider_files enable row level security;
revoke all on private.fm_provider_files from public,anon,authenticated,service_role;

create function private.fm_provider_file_author(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.fm_provider_submissions v join public.contracts c on c.id=v.contract_id and c.organization_id=v.organization_id and c.supplier_id=v.supplier_id
 join private.fm_provider_accounts a on a.supplier_id=v.supplier_id and a.user_id=auth.uid() and a.active
 where v.id=p_id and v.author_id=a.user_id and auth.jwt()->>'aal'='aal2')
$$;
create function private.fm_provider_file_readable(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.fm_provider_submissions v join public.contracts c on c.id=v.contract_id and c.organization_id=v.organization_id
 where v.id=p_id and auth.jwt()->>'aal'='aal2' and (private.current_org_role(v.organization_id) in ('owner','approver') or
 (c.supplier_id=v.supplier_id and exists(select 1 from private.fm_provider_accounts a where a.active and a.supplier_id=v.supplier_id and a.user_id=auth.uid()))))
$$;
create function public.fm_provider_prepare_file(p_id uuid,p_type text,p_bytes integer) returns text
language plpgsql security definer set search_path='' as $$
declare name_out text;
begin
 if not private.fm_provider_file_author(p_id) then raise insufficient_privilege; end if;
 perform 1 from private.fm_provider_submissions where id=p_id and decision is null for update;
 if not found then raise exception 'Submission closed'; end if;
 if (select count(*) from private.fm_provider_files where submission_id=p_id and (confirmed_at is not null or expires_at>clock_timestamp()))>=8 then raise exception 'Attachment capacity reached'; end if;
 if (select count(*) from private.fm_provider_files where submission_id=p_id and reserved_at>clock_timestamp()-interval '1 hour')>=24 then raise exception 'Hourly reservation limit reached'; end if;
 insert into private.fm_provider_files(submission_id,uploader,media_type,byte_size) values(p_id,auth.uid(),p_type,p_bytes) returning object_name into name_out;
 return name_out;
end $$;
create function private.fm_provider_storage_access(p_name text,p_action text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.fm_provider_files f join private.fm_provider_submissions v on v.id=f.submission_id
 where f.object_name=p_name and case p_action
 when 'read' then f.confirmed_at is not null and private.fm_provider_file_readable(v.id)
 when 'upload' then f.confirmed_at is null and f.expires_at>clock_timestamp() and v.decision is null and private.fm_provider_file_author(v.id)
 when 'discard' then f.confirmed_at is null and f.expires_at<=clock_timestamp() and private.fm_provider_file_author(v.id)
 else false end)
$$;
create policy fm_provider_append_evidence on storage.objects for insert to authenticated with check
 (bucket_id='provider-evidence' and storage.allow_only_operation('object.upload') and owner_id=(select auth.uid())::text and private.fm_provider_storage_access(name,'upload'));
create policy fm_provider_read_evidence on storage.objects for select to authenticated using
 (bucket_id='provider-evidence' and storage.allow_only_operation('object.get_authenticated') and private.fm_provider_storage_access(name,'read'));

-- Restrict removal to unconfirmed, expired bytes. Final evidence can never be removed here.
create policy fm_provider_discard_read on storage.objects for select to authenticated using
 (bucket_id='provider-evidence' and storage.allow_any_operation(array['object.delete','object.delete_many']) and private.fm_provider_storage_access(name,'discard'));
create policy fm_provider_discard on storage.objects for delete to authenticated using
 (bucket_id='provider-evidence' and storage.allow_any_operation(array['object.delete','object.delete_many']) and private.fm_provider_storage_access(name,'discard'));

create function public.fm_provider_abandon_file(p_id uuid,p_object text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not private.fm_provider_file_author(p_id) then raise insufficient_privilege; end if;
 perform 1 from private.fm_provider_submissions where id=p_id for update;
 update private.fm_provider_files set expires_at=least(expires_at,clock_timestamp()) where submission_id=p_id and object_name=p_object and uploader=auth.uid() and confirmed_at is null;
 return found;
end $$;

create function public.fm_provider_confirm_file(p_id uuid,p_object text) returns boolean language plpgsql security definer set search_path='' as $$
declare f private.fm_provider_files%rowtype; current_decision text;
begin
 if not private.fm_provider_file_author(p_id) then raise insufficient_privilege; end if;
 select decision into strict current_decision from private.fm_provider_submissions where id=p_id for update;
 select * into strict f from private.fm_provider_files where submission_id=p_id and object_name=p_object and uploader=auth.uid();
 if f.confirmed_at is not null then return true; end if;
 if current_decision is not null or f.expires_at<=clock_timestamp() then raise exception 'Attachment window closed'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='provider-evidence' and o.name=f.object_name
    and o.owner_id=f.uploader::text and o.metadata->>'mimetype'=f.media_type and (o.metadata->>'size')::bigint=f.byte_size)
 then raise exception 'Uploaded content does not match receipt'; end if;
 update private.fm_provider_files set confirmed_at=clock_timestamp() where id=f.id;
 return true;
end $$;

create function public.fm_provider_file_list(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.fm_provider_file_readable(p_id) then raise insufficient_privilege; end if;
 return jsonb_build_object('can_upload',private.fm_provider_file_author(p_id) and exists(select 1 from private.fm_provider_submissions where id=p_id and decision is null),
 'pending',coalesce((select jsonb_agg(jsonb_build_object('path',f.object_name,'expires',f.expires_at,'uploaded',exists(select 1 from storage.objects o where o.bucket_id='provider-evidence' and o.name=f.object_name)) order by f.expires_at)
 from private.fm_provider_files f where f.submission_id=p_id and f.confirmed_at is null and private.fm_provider_file_author(p_id)
 and (f.expires_at>clock_timestamp() or exists(select 1 from storage.objects o where o.bucket_id='provider-evidence' and o.name=f.object_name))),'[]'::jsonb),
 'files',coalesce((select jsonb_agg(jsonb_build_object('path',object_name,'type',media_type,'bytes',byte_size,'at',confirmed_at) order by confirmed_at,id) from private.fm_provider_files where submission_id=p_id and confirmed_at is not null),'[]'::jsonb));
end $$;

-- Serialize decision with attachment confirmation and require the observed number
-- of immutable attachments. Legacy callers can safely review a file-free record.
create function public.fm_review_submission_with_evidence(p_id uuid,p_decision text,p_note text,p_seen integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare v private.fm_provider_submissions%rowtype;
begin
 if auth.uid() is null or auth.jwt()->>'aal' is distinct from 'aal2' then raise insufficient_privilege; end if;
 select * into v from private.fm_provider_submissions s where s.id=p_id and s.author_id<>auth.uid()
    and private.current_org_role(s.organization_id) in ('owner','approver') for update;
 if not found then raise insufficient_privilege; end if;
 if v.decision is not null or auth.uid() is null or v.author_id=auth.uid() or auth.jwt()->>'aal' is distinct from 'aal2'
 or coalesce(private.current_org_role(v.organization_id)::text,'') not in ('owner','approver')
 or exists(select 1 from private.fm_provider_accounts a where a.active and a.user_id=auth.uid() and a.supplier_id=v.supplier_id) then raise insufficient_privilege; end if;
 if p_decision is null or p_decision not in ('accepted','returned') or p_note is null or length(btrim(p_note)) not between 2 and 1000 then raise invalid_parameter_value; end if;
 if p_seen is distinct from (select count(*) from private.fm_provider_files where submission_id=p_id and confirmed_at is not null) then raise exception 'Evidence changed; refresh' using errcode='40001'; end if;
 update private.fm_provider_submissions set decision=p_decision,review_note=btrim(p_note),reviewed_at=clock_timestamp(),reviewed_by=auth.uid() where id=p_id;
 return p_id;
end $$;
create or replace function public.fm_review_submission(p_id uuid,p_decision text,p_note text) returns uuid language sql security invoker set search_path='' as $$
 select public.fm_review_submission_with_evidence(p_id,p_decision,p_note,0)
$$;
revoke all on function private.fm_provider_file_author(uuid),private.fm_provider_file_readable(uuid),private.fm_provider_storage_access(text,text),
 public.fm_provider_abandon_file(uuid,text),public.fm_provider_prepare_file(uuid,text,integer),public.fm_provider_confirm_file(uuid,text),public.fm_provider_file_list(uuid),public.fm_review_submission_with_evidence(uuid,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function private.fm_provider_storage_access(text,text),public.fm_provider_abandon_file(uuid,text),public.fm_provider_prepare_file(uuid,text,integer),public.fm_provider_confirm_file(uuid,text),public.fm_provider_file_list(uuid),public.fm_review_submission_with_evidence(uuid,text,text,integer) to authenticated;
