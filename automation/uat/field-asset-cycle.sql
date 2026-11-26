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
select public.field_form_save(pg_temp.id('f03'),pg_temp.id('site'),'F03',0,current_setting('cy.f03data')::jsonb||'{"C8":"AHU-TEST","C11":"وحدة مناولة هواء تجريبية"}','{}',true);
select pg_temp.blocked('technician cannot activate',$q$select public.field_cycle_activate(pg_temp.id('site'),pg_temp.id('f03'))$q$,'42501');
select pg_temp.actor('owner');
select pg_temp.blocked('unreviewed source prevented',$q$select public.field_cycle_activate(pg_temp.id('site'),pg_temp.id('f03'))$q$,'CYCLE_F03_APPROVAL');
select public.field_form_decide(pg_temp.id('f03'),'accepted','تحقق فني مستقل');
select set_config('cy.asset',public.field_cycle_activate(pg_temp.id('site'),pg_temp.id('f03'))::text,true);
select pg_temp.check_ok('activation idempotent',public.field_cycle_activate(pg_temp.id('site'),pg_temp.id('f03'))=pg_temp.id('asset'));
select pg_temp.blocked('accepted source cannot cross sites',$q$select public.field_cycle_activate(pg_temp.id('other'),pg_temp.id('f03'))$q$,'CYCLE_F03_APPROVAL');
select pg_temp.actor('tech');
select public.field_form_save(pg_temp.id('duplicate'),pg_temp.id('site'),'F03',0,current_setting('cy.f03data')::jsonb||'{"C8":"AHU-TEST","C11":"وحدة مناولة هواء تجريبية"}','{}',true);
select pg_temp.actor('owner'); select public.field_form_decide(pg_temp.id('duplicate'),'accepted','فحص البطاقة الثانية');
select pg_temp.blocked('ambiguous second asset source prevented',$q$select public.field_cycle_activate(pg_temp.id('site'),pg_temp.id('duplicate'))$q$,'CYCLE_ASSET_CONFLICT');
select set_config('cy.token',(public.field_cycle_board(pg_temp.id('site'))#>>'{assets,0,scan_token}'),true);
select pg_temp.check_ok('scan token resolves asset',(public.field_cycle_board(pg_temp.id('site'),pg_temp.id('token'))#>>'{assets,0,id}')=pg_temp.id('asset')::text);
select pg_temp.check_ok('foreign token returns no assets',jsonb_array_length(public.field_cycle_board(pg_temp.id('other'),pg_temp.id('token'))->'assets')=0);
select pg_temp.check_ok('stable QR opaque identifier',pg_temp.id('asset')<>pg_temp.id('token'));
select set_config('cy.date',((now() at time zone 'Asia/Riyadh')::date-2)::text,true);
select pg_temp.check_ok('register plan',public.field_cycle_plan(pg_temp.id('site'),pg_temp.id('plan'),pg_temp.id('asset'),'متابعة حالة الفلتر',1,'days',current_setting('cy.date')::date,'تعليمات المصنع التجريبية',current_date-2)=pg_temp.id('plan'));
select pg_temp.check_ok('repeat identical plan',public.field_cycle_plan(pg_temp.id('site'),pg_temp.id('plan'),pg_temp.id('asset'),'متابعة حالة الفلتر',1,'days',current_setting('cy.date')::date,'تعليمات المصنع التجريبية',current_date-2)=pg_temp.id('plan'));
select pg_temp.blocked('future period dispatch prevented',$q$select public.field_cycle_issue(pg_temp.id('site'),pg_temp.id('plan'),current_date+20)$q$,'23514');
select set_config('cy.wo',public.field_cycle_issue(pg_temp.id('site'),pg_temp.id('plan'),current_setting('cy.date')::date)::text,true);
select pg_temp.check_ok('repeat issuance returns same order',public.field_cycle_issue(pg_temp.id('site'),pg_temp.id('plan'),current_setting('cy.date')::date)=pg_temp.id('wo'));
select pg_temp.blocked('pending prior occurrence blocks second order',$q$select public.field_cycle_issue(pg_temp.id('site'),pg_temp.id('plan'),current_setting('cy.date')::date+1)$q$,'23514');
select pg_temp.check_ok('real work order persisted',exists(select from public.facility_work_orders where id=pg_temp.id('wo') and asset_id=pg_temp.id('asset') and status='open'));
select pg_temp.blocked('direct completion requires evidence link',$q$update public.facility_work_orders set status='completed' where id=pg_temp.id('wo')$q$,'CYCLE_EVIDENCE_REQUIRED');
select pg_temp.actor('tech');
select pg_temp.check_ok('assigned technician sees work',public.field_cycle_board(pg_temp.id('site'))#>>'{orders,0,id}'=pg_temp.id('wo')::text);
select pg_temp.blocked('other site restricted',$q$select public.field_cycle_board(pg_temp.id('other'))$q$,'42501');
select pg_temp.actor('tech','aal1');
select pg_temp.blocked('MFA enforced',$q$select public.field_cycle_board(pg_temp.id('site'))$q$,'42501');
select pg_temp.actor('tech');
select set_config('cy.report',(current_setting('cy.f08data')::jsonb||jsonb_build_object('C8',pg_temp.id('wo')::text,'C9','AHU-TEST','C17','تم التحقق من نظافة الفلتر'))::text,true);
select public.field_form_save(pg_temp.id('f08'),pg_temp.id('site'),'F08',0,current_setting('cy.report')::jsonb,'{}',false);
select pg_temp.blocked('incorrect linked asset prevented',$q$select public.field_form_save(pg_temp.id('f08'),pg_temp.id('site'),'F08',1,current_setting('cy.report')::jsonb||'{"C9":"OTHER-ASSET"}','{}',true)$q$,'CYCLE_F08_SCOPE');
select pg_temp.blocked('unattached work evidence prevented',$q$select public.field_form_save(pg_temp.id('f08'),pg_temp.id('site'),'F08',1,current_setting('cy.report')::jsonb,'{}',true)$q$,'CYCLE_PHOTO');
reset role;
insert into storage.objects(bucket_id,name,metadata) values('field-form-photos',pg_temp.id('f08')::text||'/'||gen_random_uuid()||'.jpg','{"mimetype":"image/jpeg","size":100}');
set local role authenticated;
select public.field_form_save(pg_temp.id('f08'),pg_temp.id('site'),'F08',1,current_setting('cy.report')::jsonb,'{}',true);
select pg_temp.actor('owner');
select pg_temp.blocked('unapproved F08 prevented',$q$select public.field_cycle_close(pg_temp.id('site'),pg_temp.id('wo'),pg_temp.id('f08'))$q$,'CYCLE_F08_APPROVAL');
select public.field_form_decide(pg_temp.id('f08'),'accepted','راجعت نتيجة الصيانة والصورة');
select pg_temp.blocked('wrong-site closure prevented',$q$select public.field_cycle_close(pg_temp.id('other'),pg_temp.id('wo'),pg_temp.id('f08'))$q$,'CYCLE_ORDER_SCOPE');
select pg_temp.check_ok('close work using accepted evidence',public.field_cycle_close(pg_temp.id('site'),pg_temp.id('wo'),pg_temp.id('f08'))=pg_temp.id('wo'));
select pg_temp.check_ok('closure replay no double visit',public.field_cycle_close(pg_temp.id('site'),pg_temp.id('wo'),pg_temp.id('f08'))=pg_temp.id('wo') and (select count(*) from public.facility_visits where work_order_id=pg_temp.id('wo'))=1);
select pg_temp.check_ok('board reflects accepted evidence and completion',public.field_cycle_board(pg_temp.id('site'))#>>'{orders,0,evidence_id}'=pg_temp.id('f08')::text and public.field_cycle_board(pg_temp.id('site'))#>>'{orders,0,status}'='completed');
select pg_temp.check_ok('next occurrence after closure gets new order',public.field_cycle_issue(pg_temp.id('site'),pg_temp.id('plan'),current_setting('cy.date')::date+1)<>pg_temp.id('wo'));
select public.field_form_assign(pg_temp.id('site'),pg_temp.id('tech'),false);
select pg_temp.actor('tech');
select pg_temp.blocked('revoked assignment blocks QR',$q$select public.field_cycle_board(pg_temp.id('site'),pg_temp.id('token'))$q$,'42501');
select pg_temp.check_ok('revocation also restricts raw asset and order',(select count(*) from public.facility_assets where id=pg_temp.id('asset'))=0 and (select count(*) from public.facility_work_orders where id=pg_temp.id('wo'))=0);
select count(*) as passed, array_agg(label order by label) as checks from cycle_result;
rollback;
