-- Serialize review with the upload reservation, including pending bytes.
create or replace function public.fm_review_submission_with_evidence(p_id uuid,p_decision text,p_note text,p_seen integer)
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
 if exists(select 1 from private.fm_provider_files where submission_id=p_id and confirmed_at is null and expires_at>clock_timestamp()) then
   raise exception 'An attachment is still pending; refresh after confirmation or expiry' using errcode='40001';
 end if;
 if p_seen is distinct from (select count(*) from private.fm_provider_files where submission_id=p_id and confirmed_at is not null) then raise exception 'Evidence changed; refresh' using errcode='40001'; end if;
 update private.fm_provider_submissions set decision=p_decision,review_note=btrim(p_note),reviewed_at=clock_timestamp(),reviewed_by=auth.uid() where id=p_id;
 return p_id;
end $$;
create or replace function public.fm_provider_file_list(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.fm_provider_file_readable(p_id) then raise insufficient_privilege; end if;
 return jsonb_build_object('can_upload',private.fm_provider_file_author(p_id) and exists(select 1 from private.fm_provider_submissions where id=p_id and decision is null),
 'pending_count',(select count(*) from private.fm_provider_files f where f.submission_id=p_id and f.confirmed_at is null and f.expires_at>clock_timestamp()),
 'pending',coalesce((select jsonb_agg(jsonb_build_object('path',f.object_name,'expires',f.expires_at,'uploaded',exists(select 1 from storage.objects o where o.bucket_id='provider-evidence' and o.name=f.object_name)) order by f.expires_at)
 from private.fm_provider_files f where f.submission_id=p_id and f.confirmed_at is null and private.fm_provider_file_author(p_id)
 and (f.expires_at>clock_timestamp() or exists(select 1 from storage.objects o where o.bucket_id='provider-evidence' and o.name=f.object_name))),'[]'::jsonb),
 'files',coalesce((select jsonb_agg(jsonb_build_object('path',object_name,'type',media_type,'bytes',byte_size,'at',confirmed_at) order by confirmed_at,id) from private.fm_provider_files where submission_id=p_id and confirmed_at is not null),'[]'::jsonb));
end $$;
