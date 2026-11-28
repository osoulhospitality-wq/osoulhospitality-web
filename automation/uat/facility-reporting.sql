-- Isolated preview only. Harness binds the verified project ref as a session setting before execution.
begin;
set local statement_timeout='30s';
do $$ begin if current_setting('qa.preview_ref',true) is distinct from 'shshmqvgtoozxulztsqs' then raise exception 'Preview project required'; end if; end $$;
create temporary table qa_results(label text primary key,pass boolean not null check(pass));
grant insert,select on qa_results to authenticated;
do $$
declare ownerid uuid:=gen_random_uuid(); reviewer uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
  org uuid:=gen_random_uuid(); site uuid:=gen_random_uuid(); empty_site uuid:=gen_random_uuid(); asset uuid:=gen_random_uuid();
  wo uuid:=gen_random_uuid(); plan uuid:=gen_random_uuid(); d date:=(now() at time zone 'Asia/Riyadh')::date-1;
begin
  if exists(select 1 from private.fm_report_schedules) then raise exception 'Preview must start without report subscriptions'; end if;
  perform set_config('qa.owner',ownerid::text,true),set_config('qa.review',reviewer::text,true),
    set_config('qa.outside',outsider::text,true),set_config('qa.site',site::text,true),set_config('qa.empty',empty_site::text,true);
  insert into auth.users(id) values(ownerid),(reviewer),(outsider);
  insert into public.organizations(id,name,created_by) values(org,'Synthetic reporting QA',ownerid);
  insert into public.organization_members(organization_id,user_id,full_name,role) values(org,reviewer,'Synthetic approver','approver');
  insert into public.facilities(id,organization_id,name) values(site,org,'Synthetic report site'),(empty_site,org,'Synthetic idle site');
  insert into public.facility_assets(id,organization_id,facility_id,name,asset_code)values(asset,org,site,'Synthetic asset','QA');
  insert into public.facility_work_orders(id,organization_id,asset_id,summary,created_at)
    values(wo,org,asset,'Synthetic order',(d+time '12:00') at time zone 'Asia/Riyadh');
  insert into public.facility_pm_plans(id,organization_id,facility_id,asset_id,task,period_count,period_unit,first_due_on,
    source_reference,source_date,verified_by,next_due_on)values(plan,org,site,asset,'Synthetic check',1,'days',d,'QA only',d,ownerid,d+1);
  insert into public.facility_pm_occurrences(organization_id,facility_id,plan_id,due_on,work_order_id,issued_by,issued_at)
    values(org,site,plan,d,wo,ownerid,(d+time '12:00') at time zone 'Asia/Riyadh');
  insert into qa_results values('default off with no snapshots',not exists(select from private.fm_report_history) and not exists(select from private.fm_report_schedules));
  insert into qa_results values('cron private and unique',
    not has_function_privilege('authenticated','private.fm_generate_facility_reports()','execute') and
    (select count(*)=1 from cron.job where jobname='osoul-opt-in-facility-reports' and active));
end $$;
set local role authenticated;
do $$
declare s uuid:=current_setting('qa.site')::uuid; o uuid:=current_setting('qa.owner')::uuid;
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'aal','aal1','role','authenticated')::text,true);
  begin perform public.fm_report_schedule(s,'daily',true); raise exception 'AAL1 accepted';
  exception when insufficient_privilege then insert into qa_results values('low assurance blocked',true); end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.outside'),'aal','aal2','role','authenticated')::text,true);
  begin perform public.fm_report_history(s); raise exception 'outsider accepted';
  exception when insufficient_privilege then insert into qa_results values('other tenant excluded',true); end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.review'),'aal','aal2','role','authenticated')::text,true);
  begin perform public.fm_report_schedule(s,'daily',true); raise exception 'reviewer could subscribe';
  exception when insufficient_privilege then insert into qa_results values('reviewer cannot change enrollment',true); end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',o,'aal','aal2','role','authenticated')::text,true);
  perform public.fm_report_schedule(s,'daily',true),public.fm_report_schedule(s,'weekly',true),public.fm_report_schedule(s,'monthly',true);
  perform public.fm_report_schedule(s,'daily',true),public.fm_report_schedule(current_setting('qa.empty')::uuid,'daily',true);
  insert into qa_results values('three independent cadences',jsonb_array_length(public.fm_report_history(s)->'schedules')=3);
end $$;
reset role;
do $$
declare s uuid:=current_setting('qa.site')::uuid; d date:=(now() at time zone 'Asia/Riyadh')::date-1;
begin
  insert into qa_results values('repeat enable has no second transition',(select count(*)=4 from private.fm_report_setting_events));
  insert into qa_results values('week begins Sunday and month begins on first',not exists(select 1 from private.fm_report_schedules where
    next_start<=d+1 or (cadence='weekly' and extract(dow from next_start)<>0) or (cadence='monthly' and extract(day from next_start)<>1)));
  update private.fm_report_schedules set next_start=d where cadence='daily';
  perform private.fm_generate_facility_reports();
  insert into qa_results values('isolated active and no-activity records',(select count(*)=2 from private.fm_report_history) and
    exists(select 1 from private.fm_report_history where facility_id=s and status='generated' and opened=1 and completed=0 and ppm_due=1 and ppm_unconfirmed=1 and last_evidence_at is not null)
    and exists(select 1 from private.fm_report_history where facility_id<>s and status='no_activity' and last_evidence_at is null));
  update private.fm_report_schedules set next_start=d where cadence='daily';
  perform private.fm_generate_facility_reports();
  insert into qa_results values('retry preserves unique period',(select count(*)=2 from private.fm_report_history));
end $$;
set local role authenticated;
do $$
declare s uuid:=current_setting('qa.site')::uuid; r jsonb; rid uuid;
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.review'),'aal','aal2','role','authenticated')::text,true);
  r:=public.fm_report_history(s);rid:=(r->'reports'->0->>'id')::uuid;
  insert into qa_results values('scoped historical read',jsonb_array_length(r->'reports')=1 and r->>'can_configure'='false' and not ((r->'reports'->0)?'sort'));
  insert into qa_results values('acknowledgement is idempotent',public.fm_report_acknowledge(s,rid) and public.fm_report_acknowledge(s,rid));
  insert into qa_results values('foreign report cannot be acknowledged',not public.fm_report_acknowledge(current_setting('qa.empty')::uuid,rid));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.owner'),'aal','aal2','role','authenticated')::text,true);
  insert into qa_results values('owner can stop',not public.fm_report_schedule(s,'daily',false));
end $$;
reset role;
select count(*) as passed,array_agg(label order by label) as checks from qa_results;
rollback;
