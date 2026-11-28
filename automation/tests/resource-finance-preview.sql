-- Preview-only QA. Synthetic identities generated in each transaction; no emails, commits or production connections.
begin;
do $$ declare a uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); f uuid:=gen_random_uuid(); begin
perform set_config('qa.testuser',a::text,true);perform set_config('qa.testorg',o::text,true);perform set_config('qa.testsite',f::text,true);
insert into auth.users(id,raw_user_meta_data) values(a,'{"full_name":"Resource QA fixture"}');
insert into public.organizations(id,name,created_by) values(o,'Resource QA fixture',a);
insert into public.facilities(id,organization_id,name) values(f,o,'Resource QA fixture');
perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'aal','aal2','role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ declare o uuid:=current_setting('qa.testorg')::uuid; f uuid:=current_setting('qa.testsite')::uuid; rowdata record;begin
if public.fm_record_monthly_evidence(o,f,'2026-10-01','unit_finance_sar','QAF-01',0,31,'Fixture journal',null,1200.12,300.11,69.99,1.5)<>1 then raise exception 'revision mismatch';end if;
if public.fm_record_monthly_evidence(o,f,'2026-10-01','unit_finance_sar','QAF-01',1,31,'Corrected journal',null,1100.12,300.11,69.99,1.5)<>2 then raise exception 'revision mismatch';end if;
begin perform public.fm_record_monthly_evidence(o,f,'2026-10-01','unit_finance_sar','QAF-01',1,31,'stale journal',null,10,1,0,1);raise exception 'expected stale rejection';exception when serialization_failure then null;end;
select * into strict rowdata from public.fm_read_monthly_evidence(o,f,'2026-10-01');
if rowdata.net_revenue<>1100.12 or rowdata.other_direct_cost<>300.11 or rowdata.maintenance_cost<>69.99 or rowdata.downtime_days<>1.5 or rowdata.recorded_at is null or rowdata.revision<>2 then raise exception 'field mismatch';end if;
perform public.fm_record_monthly_evidence(o,f,'2026-09-01','water_m3','QAM-01',0,30,'Meter September',300);
perform public.fm_record_monthly_evidence(o,f,'2026-10-01','water_m3','QAM-01',0,31,'Meter October',310);
if (select count(*) from public.fm_read_monthly_evidence(o,f,'2026-10-01'))<>3 then raise exception 'month mismatch';end if;
begin perform 1 from public.fm_read_monthly_evidence(o,gen_random_uuid(),'2026-10-01');raise exception 'expected scope rejection';exception when insufficient_privilege then null;end;
perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.testuser'),'aal','aal1','role','authenticated')::text,true);
begin perform 1 from public.fm_read_monthly_evidence(o,f,'2026-10-01');raise exception 'expected MFA rejection';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.organization_members set role='viewer' where user_id=current_setting('qa.testuser')::uuid and organization_id=current_setting('qa.testorg')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.testuser'),'aal','aal2','role','authenticated')::text,true) is not null as configured;
set local role authenticated;
do $$ begin begin perform 1 from public.fm_read_monthly_evidence(current_setting('qa.testorg')::uuid,current_setting('qa.testsite')::uuid,'2026-10-01');raise exception 'expected role rejection';exception when insufficient_privilege then null;end;end $$;
reset role;
select 'validated' as qa_result;
rollback;
begin;
do $$ declare a uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); f uuid:=gen_random_uuid(); begin
perform set_config('qa.testuser',a::text,true);perform set_config('qa.testorg',o::text,true);perform set_config('qa.testsite',f::text,true);
insert into auth.users(id,raw_user_meta_data) values(a,'{"full_name":"Resource QA fixture"}');
insert into public.organizations(id,name,created_by) values(o,'Resource QA fixture',a);
insert into public.facilities(id,organization_id,name) values(f,o,'Resource QA fixture');
perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'aal','aal2','role','authenticated')::text,true);
end $$;

do $$ declare reviewer uuid:=gen_random_uuid();begin
 perform set_config('qa.reviewer',reviewer::text,true);
 insert into auth.users(id,raw_user_meta_data) values(reviewer,'{"full_name":"Independent fixture"}');
 insert into public.organization_members(organization_id,user_id,full_name,role) values(current_setting('qa.testorg')::uuid,reviewer,'Independent fixture','approver');
end $$;
set local role authenticated;
do $$ declare o uuid:=current_setting('qa.testorg')::uuid;f uuid:=current_setting('qa.testsite')::uuid; v record;begin
 perform public.fm_record_monthly_evidence(o,f,'2026-10-01','water_m3','QAM-F',0,31,'Test meter October',155);
 begin perform public.fm_verify_meter_revision(o,f,'2026-10-01','water_m3','QAM-F',1);raise exception 'Expected second-person check';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.reviewer'),'aal','aal2','role','authenticated')::text,true);
 perform public.fm_verify_meter_revision(o,f,'2026-10-01','water_m3','QAM-F',1);
 select * into strict v from public.fm_meter_forecast_history(o,f,'2026-10-01','water_m3','QAM-F');
 if v.verified_at is null or v.consumption<>155 or v.revision<>1 then raise exception 'Expected verified reading';end if;
 if exists(select 1 from public.fm_meter_forecast_history(o,f,'2026-10-01','water_m3','different')) then raise exception 'Expected exact meter';end if;
 perform public.fm_record_monthly_evidence(o,f,'2026-10-01','water_m3','QAM-F',1,31,'Correction',180);
 if (select count(*) from public.fm_meter_forecast_history(o,f,'2026-10-01','water_m3','QAM-F') where verified_at is null)<>1 then raise exception 'Expected unverified correction';end if;
 begin perform public.fm_verify_meter_revision(o,f,'2026-10-01','water_m3','QAM-F',1);raise exception 'Expected stale rejection';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('qa.reviewer'),'aal','aal1','role','authenticated')::text,true);
 begin perform 1 from public.fm_meter_forecast_history(o,f,'2026-10-01','water_m3','QAM-F');raise exception 'Expected MFA check';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'validated' as forecast_preview;
rollback;
