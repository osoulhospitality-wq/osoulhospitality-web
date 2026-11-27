-- Branch-only rollback suite. Synthetic photo metadata exercises DB predicates.
-- Storage object bytes are tested separately through the browser/storage API.
begin;
create temporary table cycle_result(label text primary key);
grant insert,select on cycle_result to authenticated;
do $$declare v text;begin foreach v in array array['org','site','other','owner','tech','f03','f08','plan','duplicate'] loop perform set_config('cy.'||v,gen_random_uuid()::text,true);end loop;end$$;
create function pg_temp.id(text) returns uuid language sql stable as $$select current_setting('cy.'||$1)::uuid$$;
create function pg_temp.actor(actor text, assurance text default 'aal2') returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(actor),'aal',assurance,'role','authenticated')::text,true)::text is not null
$$;
create function pg_temp.check_ok(label text, test boolean) returns void language plpgsql as $$
begin if test is distinct from true then raise exception 'FAILED %',label;end if;insert into cycle_result values(label);end $$;
create function pg_temp.blocked(label text, stmt text, reason text) returns void language plpgsql as $$
begin
 begin execute stmt;exception when others then
 if sqlerrm<>reason and sqlstate<>reason then raise exception 'FAILED %: % %',label,sqlstate,sqlerrm;end if;
 insert into cycle_result values(label);return;end;
 raise exception 'FAILED %, expected rejection',label;
end $$;
insert into auth.users(id) values(pg_temp.id('owner')),(pg_temp.id('tech'));
insert into public.organizations(id,name,created_by) values(pg_temp.id('org'),'Synthetic cycle verification',pg_temp.id('owner'));
insert into public.organization_members(organization_id,user_id,role,full_name) values(pg_temp.id('org'),pg_temp.id('tech'),'viewer','Fixture technician');
insert into public.facilities(id,organization_id,name) values(pg_temp.id('site'),pg_temp.id('org'),'Cycle test facility'),(pg_temp.id('other'),pg_temp.id('org'),'Other facility');
select set_config('cy.f03data',(select jsonb_object_agg(k,'اختبار') from private.field_form_keys,unnest(keys) k where code='F03')::text,true),
 set_config('cy.f08data',(select jsonb_object_agg(k,'اختبار') from private.field_form_keys,unnest(keys) k where code='F08')::text,true);
set local role authenticated;
select pg_temp.actor('owner');
select public.field_form_assign(pg_temp.id('site'),pg_temp.id('tech'),true);
select pg_temp.actor('tech');
select public.field_building_capture(pg_temp.id('site'),pg_temp.id('f03'),'lifts','٠٣','دليل الاختبار',current_date);
select pg_temp.check_ok('Arabic count normalized', public.field_building_read(pg_temp.id('site'))->0->>'value'='3');
select pg_temp.check_ok('pending until verification', public.field_building_read(pg_temp.id('site'))->0->>'approved'='false');
select pg_temp.check_ok('idempotent capture',public.field_building_capture(pg_temp.id('site'),pg_temp.id('f03'),'lifts','3','دليل الاختبار',current_date)=pg_temp.id('f03'));
select pg_temp.blocked('same id cannot rewrite',format('select public.field_building_capture(%L,%L,%L,%L,%L,current_date)',pg_temp.id('site'),pg_temp.id('f03'),'lifts','4','دليل الاختبار'),'23505');
select pg_temp.blocked('deny other site',format('select public.field_building_read(%L)',pg_temp.id('other')),'42501');
select pg_temp.blocked('reject fractional staff',format('select public.field_building_capture(%L,gen_random_uuid(),%L,%L,%L,current_date)',pg_temp.id('site'),'staff_total','2.5','دليل الاختبار'),'23514');
select pg_temp.actor('owner');
select public.field_building_verify(pg_temp.id('site'),pg_temp.id('f03'));
select pg_temp.check_ok('reviewer verifies source',public.field_building_read(pg_temp.id('site'))->0->>'approved'='true');
select public.field_building_capture(pg_temp.id('site'),pg_temp.id('f08'),'units','40','سجل الوحدات',current_date);
select pg_temp.blocked('deny self even via enterprise API',format('select public.facility_memory_verify(%L,%L,%L)',pg_temp.id('org'),pg_temp.id('site'),pg_temp.id('f08')),'23514');
select pg_temp.actor('tech');
select public.field_building_capture(pg_temp.id('site'),pg_temp.id('plan'),'lifts','4','مرجع بديل',current_date);
select pg_temp.actor('owner'); select public.field_building_verify(pg_temp.id('site'),pg_temp.id('plan'));
select pg_temp.check_ok('conflicting verified inputs preserved', (select count(*)=2 from jsonb_array_elements(public.field_building_read(pg_temp.id('site'))) a where a->>'key'='lifts'));
select pg_temp.actor('tech');
reset role;
select set_config('cy.f01data',(select jsonb_object_agg(k,'اختبار') from private.field_form_keys,unnest(keys) k where code='F01')::text,true);
set local role authenticated;
select public.field_form_save(pg_temp.id('duplicate'),pg_temp.id('site'),'F01',0,current_setting('cy.f01data')::jsonb||'{"C11":"٢٥"}','{}',true);
select pg_temp.actor('owner');select public.field_form_decide(pg_temp.id('duplicate'),'accepted','بطاقة متحققة');
select pg_temp.check_ok('reuse approved F01 without reentry',exists(select from jsonb_array_elements(public.field_building_read(pg_temp.id('site'))) a where a->>'key'='units' and a->>'value'='25' and a->>'approved'='true'));
select pg_temp.actor('tech','aal1');
select pg_temp.blocked('MFA required',format('select public.field_building_read(%L)',pg_temp.id('site')),'42501');
reset role;
select count(*) as passed,array_agg(label order by label) as cases from cycle_result;
rollback;
