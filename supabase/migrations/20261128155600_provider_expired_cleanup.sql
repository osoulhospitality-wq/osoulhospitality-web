-- Authorized organization reviewers may discard expired, unconfirmed objects through the Storage API.
-- Confirmed files, active reservations, unrelated submissions and other buckets remain out of scope.
create or replace function private.fm_provider_storage_access(p_name text,p_action text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.fm_provider_files f join private.fm_provider_submissions v on v.id=f.submission_id
 where f.object_name=p_name and case p_action
 when 'read' then f.confirmed_at is not null and private.fm_provider_file_readable(v.id)
 when 'upload' then f.confirmed_at is null and f.expires_at>clock_timestamp() and v.decision is null and private.fm_provider_file_author(v.id)
 when 'discard' then f.confirmed_at is null and f.expires_at<=clock_timestamp() and
   (private.fm_provider_file_author(v.id) or (auth.jwt()->>'aal'='aal2' and private.current_org_role(v.organization_id) in ('owner','approver')))
 else false end)
$$;
create or replace function public.fm_provider_file_list(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.fm_provider_file_readable(p_id) then raise insufficient_privilege; end if;
 return jsonb_build_object('can_upload',private.fm_provider_file_author(p_id) and exists(select 1 from private.fm_provider_submissions where id=p_id and decision is null),
 'pending_count',(select count(*) from private.fm_provider_files f where f.submission_id=p_id and f.confirmed_at is null and f.expires_at>clock_timestamp()),
 'pending',coalesce((select jsonb_agg(jsonb_build_object('path',f.object_name,'expires',f.expires_at,'uploaded',exists(select 1 from storage.objects o where o.bucket_id='provider-evidence' and o.name=f.object_name)) order by f.expires_at)
 from private.fm_provider_files f where f.submission_id=p_id and f.confirmed_at is null and (private.fm_provider_file_author(p_id)
 or (f.expires_at<=clock_timestamp() and exists(select 1 from private.fm_provider_submissions s where s.id=p_id and private.current_org_role(s.organization_id) in ('owner','approver'))))
 and (f.expires_at>clock_timestamp() or exists(select 1 from storage.objects o where o.bucket_id='provider-evidence' and o.name=f.object_name))),'[]'::jsonb),
 'files',coalesce((select jsonb_agg(jsonb_build_object('path',object_name,'type',media_type,'bytes',byte_size,'at',confirmed_at) order by confirmed_at,id) from private.fm_provider_files where submission_id=p_id and confirmed_at is not null),'[]'::jsonb));
end $$;
create or replace function public.fm_provider_prepare_file(p_id uuid,p_type text,p_bytes integer) returns text
language plpgsql security definer set search_path='' as $$
declare name_out text;
begin
 if not private.fm_provider_file_author(p_id) then raise insufficient_privilege; end if;
 perform 1 from private.fm_provider_submissions where id=p_id and decision is null for update;
 if not found then raise exception 'Submission closed'; end if;
 if (select count(*) from private.fm_provider_files where submission_id=p_id and (confirmed_at is not null or expires_at>clock_timestamp() or exists(select 1 from storage.objects o where o.bucket_id='provider-evidence' and o.name=object_name)))>=8 then raise exception 'Attachment capacity reached'; end if;
 if (select count(*) from private.fm_provider_files where submission_id=p_id and reserved_at>clock_timestamp()-interval '1 hour')>=24 then raise exception 'Hourly reservation limit reached'; end if;
 insert into private.fm_provider_files(submission_id,uploader,media_type,byte_size) values(p_id,auth.uid(),p_type,p_bytes) returning object_name into name_out;
 return name_out;
end $$;
