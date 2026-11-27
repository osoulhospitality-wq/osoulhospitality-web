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
select pg_temp.actor('owner');
insert into public.approvals(organization_id,entity_type,entity_id,requested_by) values(pg_temp.id('org'),'supplier',gen_random_uuid(),pg_temp.id('tech'));
insert into public.contracts(organization_id,name,end_date,notice_days,created_by,status) values
(pg_temp.id('org'),'Within notice',current_date+30,25,pg_temp.id('owner'),'active'),(pg_temp.id('org'),'Far',current_date+400,10,pg_temp.id('owner'),'active');
insert into public.requests(organization_id,title,body,requester_id,status,due_at) values
(pg_temp.id('org'),'Overdue request','Synthetic',pg_temp.id('tech'),'processing',now()-interval '1 day'),
(pg_temp.id('org'),'Closed request','Synthetic',pg_temp.id('tech'),'completed',now());
insert into public.facility_assets(id,organization_id,facility_id,asset_code,name) values(pg_temp.id('f03'),pg_temp.id('org'),pg_temp.id('other'),'TEST','Test asset');
insert into public.facility_pm_plans(id,organization_id,facility_id,asset_id,task,period_count,period_unit,first_due_on,next_due_on,source_reference,source_date,verified_by)
values(pg_temp.id('plan'),pg_temp.id('org'),pg_temp.id('other'),pg_temp.id('f03'),'Test cycle',1,'months',current_date-6,current_date+24,'Fixture',current_date-10,pg_temp.id('owner'));
insert into public.facility_work_orders(id,organization_id,asset_id,summary) values(pg_temp.id('f08'),pg_temp.id('org'),pg_temp.id('f03'),'Test maintenance');
insert into public.facility_pm_occurrences(organization_id,facility_id,plan_id,due_on,work_order_id,issued_by)
values(pg_temp.id('org'),pg_temp.id('other'),pg_temp.id('plan'),current_date-6,pg_temp.id('f08'),pg_temp.id('owner'));
select set_config('cy.f01data',(select jsonb_object_agg(k,'مثال') from private.field_form_keys,unnest(keys) k where code='F01')::text,true);
set local role authenticated;
select pg_temp.actor('owner');select public.field_form_assign(pg_temp.id('site'),pg_temp.id('tech'),true);
select pg_temp.actor('tech');
select public.field_form_save(pg_temp.id('duplicate'),pg_temp.id('site'),'F01',0,current_setting('cy.f01data')::jsonb,'{}',true);
select pg_temp.blocked('technician cannot see corporate details',$q$select public.draqon_daily_desk(pg_temp.id('site'),0)$q$,'42501');
select pg_temp.actor('owner','aal1');
select pg_temp.blocked('MFA required',$q$select public.draqon_daily_desk(pg_temp.id('site'),0)$q$,'42501');
select pg_temp.actor('owner');select set_config('cy.board',public.draqon_daily_desk(pg_temp.id('site'),0)::text,true);
select pg_temp.check_ok('each real source and only actionable rows',(current_setting('cy.board')::jsonb->'counts')='{"approvals":1,"contracts":1,"requests":1,"late_orders":1,"field_reviews":1}'::jsonb);
select pg_temp.check_ok('manager can see other site in same company',exists(select from jsonb_array_elements(current_setting('cy.board')::jsonb->'rows') x where x->>'kind'='late_order' and x->>'site_name'='Other facility'));
select pg_temp.check_ok('priority and date presented',exists(select from jsonb_array_elements(current_setting('cy.board')::jsonb->'rows') x where x->>'kind'='request' and x->>'priority'='urgent' and x->>'due' is not null));
select set_config('cy.ask',(select x->>'key' from jsonb_array_elements(current_setting('cy.board')::jsonb->'rows') x where x->>'kind'='approval'),true);
select pg_temp.blocked('cannot acknowledge arbitrary source',$q$select public.draqon_daily_ack(pg_temp.id('site'),'approval','bogus','Noted')$q$,'DRAQON_ITEM_CHANGED');
select pg_temp.blocked('note required',$q$select public.draqon_daily_ack(pg_temp.id('site'),'approval',current_setting('cy.ask'),' ')$q$,'DRAQON_NOTE_REQUIRED');
select pg_temp.check_ok('same receipt on retry',public.draqon_daily_ack(pg_temp.id('site'),'approval',current_setting('cy.ask'),'Follow up')=public.draqon_daily_ack(pg_temp.id('site'),'approval',current_setting('cy.ask'),'Follow up'));
select pg_temp.blocked('prior receipt not overwritten',$q$select public.draqon_daily_ack(pg_temp.id('site'),'approval',current_setting('cy.ask'),'Changed')$q$,'DRAQON_ALREADY_NOTED');
select pg_temp.check_ok('acknowledgment not approval',exists(select from public.approvals where organization_id=pg_temp.id('org') and status='pending'));
select pg_temp.check_ok('note can be reopened',exists(select from jsonb_array_elements(public.draqon_daily_desk(pg_temp.id('site'),0)->'rows') x where x->>'kind'='approval' and x->>'ack_note'='Follow up' and x->>'acked_at' is not null));
select pg_temp.blocked('invalid page',$q$select public.draqon_daily_desk(pg_temp.id('site'),-1)$q$,'Invalid inbox offset');
reset role;
insert into public.organizations(id,name,created_by) values(pg_temp.id('f08'),'Separate org',pg_temp.id('tech'));
insert into public.facilities(id,organization_id,name) values(pg_temp.id('plan'),pg_temp.id('f08'),'Different organization');
insert into public.requests(organization_id,title,body,requester_id) select pg_temp.id('org'),'Task '||n,'Multiple pages',pg_temp.id('owner') from generate_series(1,32) n;
set local role authenticated;
select pg_temp.actor('owner');
select pg_temp.blocked('other company denied',$q$select public.draqon_daily_desk(pg_temp.id('plan'),0)$q$,'42501');
select pg_temp.check_ok('pagination exact totals',(public.draqon_daily_desk(pg_temp.id('site'),0)->>'has_more')::bool and jsonb_array_length(public.draqon_daily_desk(pg_temp.id('site'),0)->'rows')=25 and jsonb_array_length(public.draqon_daily_desk(pg_temp.id('site'),25)->'rows')=12);
select pg_temp.check_ok('pages have no duplication',not exists(select 1 from jsonb_array_elements(public.draqon_daily_desk(pg_temp.id('site'),0)->'rows') a join jsonb_array_elements(public.draqon_daily_desk(pg_temp.id('site'),25)->'rows') b on a->>'key'=b->>'key'));
select count(*) as passed,array_agg(label order by label) as cases from cycle_result;
rollback;
