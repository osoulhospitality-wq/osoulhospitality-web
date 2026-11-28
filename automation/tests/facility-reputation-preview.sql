-- Isolated preview fixture only. Roll back all records and return no identity, listing or review.
begin;
do $$
declare
 principal uuid; outsider uuid; org uuid:=gen_random_uuid(); site uuid:=gen_random_uuid();
 other_site uuid:=gen_random_uuid(); listing uuid; summary record;
begin
 select id into principal from auth.users where email like '%.invalid' order by id limit 1;
 select id into outsider from auth.users where email like '%.invalid' and id<>principal order by id limit 1;
 if principal is null or outsider is null then raise exception 'Two existing preview fixtures required';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',principal,'aal','aal2')::text,true);
 insert into public.organizations(id,name,created_by) values (org,'Preview reputation QA',principal);
 insert into public.facilities(id,organization_id,name) values (site,org,'Fixture A'),(other_site,org,'Fixture B');
 assert not has_table_privilege('authenticated','private.fm_reputation_months','SELECT');
 assert not has_function_privilege('anon','public.fm_read_reputation(uuid,uuid,date,integer)','EXECUTE');
 listing:=public.fm_confirm_reputation_listing(org,site,'airbnb','qa-property','https://www.airbnb.com/rooms/123',1,5,'2026-01-03','Preview evidence');
 begin
  perform public.fm_confirm_reputation_listing(org,site,'airbnb','qa-property','https://www.airbnb.com/rooms/123',1,5,'2026-01-03','Preview evidence');
  raise exception 'Duplicate listing accepted';
 exception when unique_violation then null;end;
 assert (select count(*)=0 from public.fm_read_reputation(org,other_site,'2026-02-01',0));
 assert (select revision is null from public.fm_read_reputation(org,site,'2026-02-01',0));
 perform public.fm_record_reputation_month(org,site,listing,'2026-01-01',0,3,4.0,'2026-02-01','January fixture');
 perform public.fm_record_reputation_month(org,site,listing,'2026-02-01',0,4,4.5,'2026-03-01','February fixture');
 perform public.fm_record_reputation_month(org,site,listing,'2026-02-01',1,5,4.6,'2026-03-02','February correction');
 select * into summary from public.fm_read_reputation(org,site,'2026-02-01',0);
 assert summary.revision=2 and summary.average_rating=4.6 and summary.previous_average=4.0 and summary.review_count=5 and summary.previous_count=3;
 begin
  perform public.fm_record_reputation_month(org,site,listing,'2026-02-01',1,5,4.6,'2026-03-02','Duplicate receipt');
  raise exception 'Stale revision accepted';
 exception when serialization_failure then null;end;
 begin
  perform public.fm_record_reputation_month(org,site,listing,'2026-03-01',0,2,6.0,'2026-04-01','Invalid scale');
  raise exception 'Scale violation';
 exception when invalid_parameter_value then null;end;
 begin
  perform public.fm_record_reputation_month(org,site,listing,'2026-03-01',0,2,4,'2026-03-02','Incomplete period');
  raise exception 'Incomplete period accepted';
 exception when check_violation then null;end;
 begin
  perform public.fm_record_reputation_month(org,other_site,listing,'2026-03-01',0,0,null,'2026-04-01','Wrong site');
  raise exception 'Cross-facility operation accepted';
 exception when insufficient_privilege then null;end;
 perform public.fm_record_reputation_month(org,site,listing,'2026-03-01',0,0,null,'2026-04-01','No new ratings');
 assert (select review_count=0 and average_rating is null from public.fm_read_reputation(org,site,'2026-03-01',0));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',principal,'aal','aal1')::text,true);
 begin
  perform public.fm_read_reputation(org,site,'2026-02-01',0);raise exception 'MFA not enforced';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'aal','aal2')::text,true);
 begin
  perform public.fm_read_reputation(org,site,'2026-02-01',0);raise exception 'Unauthorized principal has access';
 exception when insufficient_privilege then null;end;
end $$;
select 'preview reputation assertions passed' as result;
rollback;
