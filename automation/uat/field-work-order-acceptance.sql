-- Run with psql against the isolated acceptance branch (direct or Supabase pooler).
-- The test sets synthetic identities only for this transaction. All workflow calls
-- run as authenticated and all fixtures roll back. No storage bytes are uploaded.
\set ON_ERROR_STOP on
select (lower(:'HOST') = 'db.shshmqvgtoozxulztsqs.supabase.co'
        or (lower(:'HOST') like '%.pooler.supabase.com' and :'USER' = 'postgres.shshmqvgtoozxulztsqs')) as qa_is_preview \gset
\if :qa_is_preview
begin;
set local statement_timeout = '20s';
create temporary table qa_checks (label text primary key, pass boolean not null check(pass));
grant select,insert on qa_checks to authenticated;
do $fixture$ begin
 perform set_config('qa.org',gen_random_uuid()::text,true);
 perform set_config('qa.owner',gen_random_uuid()::text,true);
 perform set_config('qa.tech',gen_random_uuid()::text,true);
 perform set_config('qa.form',gen_random_uuid()::text,true);
 insert into auth.users(id) values(current_setting('qa.owner')::uuid),(current_setting('qa.tech')::uuid);
 insert into public.organizations(id,name,created_by) values(current_setting('qa.org')::uuid,'DRAQON acceptance fixture 281126',current_setting('qa.owner')::uuid);
 insert into public.organization_members(organization_id,user_id,full_name,role) values(current_setting('qa.org')::uuid,current_setting('qa.tech')::uuid,'Fixture field analyst','analyst');
 perform set_config('qa.fields',(select jsonb_object_agg(k,'Synthetic inspection')::text from private.field_form_keys,unnest(keys) k where code='F01'),true);
end $fixture$;
set local role authenticated;
do $work$
declare org uuid:=current_setting('qa.org')::uuid; ownerid uuid:=current_setting('qa.owner')::uuid; technician uuid:=current_setting('qa.tech')::uuid;
 site uuid; asset uuid; wo uuid; visit uuid; fid uuid:=current_setting('qa.form')::uuid; draft public.field_form_records; sent public.field_form_records; reviewed public.field_form_reviews; completed timestamptz;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ownerid,'aal','aal2','role','authenticated')::text,true);
 insert into public.facilities(organization_id,name) values(org,'Fixture acceptance facility') returning id into site;
 perform public.field_form_assign(site,technician,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',technician,'aal','aal2','role','authenticated')::text,true);
 insert into qa_checks values ('assigned_facility_visible',exists(select from public.field_form_sites() f where f.id=site));
 insert into public.facility_assets(organization_id,facility_id,asset_code,name) values(org,site,'QA-01','Fixture pump') returning id into asset;
 insert into public.facility_work_orders(organization_id,asset_id,summary) values(org,asset,'Fixture inspection') returning id into wo;
 insert into qa_checks values ('work_order_created_open',exists(select from public.facility_work_orders where id=wo and status='open'));
 update public.facility_work_orders set status='in_progress' where id=wo and organization_id=org and status='open';
 insert into qa_checks values ('work_order_in_progress',exists(select from public.facility_work_orders where id=wo and status='in_progress'));
 insert into public.facility_visits(organization_id,work_order_id,findings) values(org,wo,'Fixture maintenance findings') returning id into visit;
 insert into qa_checks values ('visit_linked_to_work_and_technician',exists(select from public.facility_visits where id=visit and work_order_id=wo and created_by=technician));
 select * into draft from public.field_form_save(fid,site,'F01',0,'{}'::jsonb,'{}'::jsonb,false);
 insert into qa_checks values ('draft_by_assigned_technician',draft.id=fid and draft.author_id=technician and draft.status='draft');
 select * into sent from public.field_form_save(fid,site,'F01',draft.version,current_setting('qa.fields')::jsonb,'{}'::jsonb,true);
 insert into qa_checks values ('complete_draft_submitted',sent.id=fid and sent.status='submitted' and sent.submitted_at is not null and sent.version>draft.version);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ownerid,'aal','aal2','role','authenticated')::text,true);
 select * into reviewed from public.field_form_decide(fid,'accepted','Fixture independent check');
 insert into qa_checks values ('independent_owner_review_recorded',reviewed.reviewer_id=ownerid and reviewed.reviewer_id<>sent.author_id and reviewed.record_id=fid and reviewed.decision='accepted');
 update public.facility_work_orders set status='completed' where id=wo and organization_id=org and status='in_progress' returning completed_at into completed;
 insert into qa_checks values ('approver_closed_order_with_visit',completed is not null and exists(select from public.facility_work_orders where id=wo and status='completed'));
end $work$;
select count(*) as passed,array_agg(label order by label) as checks from qa_checks;
rollback;

\else
\echo 'Refusing to run. Connect to the designated Supabase preview branch.'
select 1/0 as wrong_preview_connection;
\endif
