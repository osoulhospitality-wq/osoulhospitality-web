-- Preview-only acceptance test. Two synthetic preview identities must already
-- exist; it creates no users, returns no identifiers and rolls everything back.
begin;
do $$
declare
  principals uuid[];
  owner_id uuid; staff_id uuid;
  org_a uuid:=gen_random_uuid(); org_b uuid:=gen_random_uuid();
  supplier_a uuid:=gen_random_uuid(); supplier_b uuid:=gen_random_uuid();
begin
  select array(select id from auth.users where email like '%.invalid' order by id limit 2) into principals;
  if cardinality(principals)<>2 then raise exception 'Requires two existing preview fixture principals'; end if;
  owner_id:=principals[1]; staff_id:=principals[2];
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'aal','aal2')::text,true);
  assert not has_table_privilege('authenticated','private.fm_identity_grants','INSERT');
  assert not has_table_privilege('service_role','private.fm_identity_grants','UPDATE');
  insert into public.organizations(id,name,created_by) values
    (org_a,'Preview boundary A',owner_id),(org_b,'Preview boundary B',owner_id);
  insert into public.suppliers(id,name,organization_id,created_by) values
    (supplier_a,'Fixture A',org_a,owner_id),(supplier_b,'Fixture B',org_a,owner_id);
  insert into private.fm_provider_accounts(supplier_id,user_id) values (supplier_a,staff_id),(supplier_b,staff_id);
  assert (select grant_count=2 and kind='provider' from private.fm_identity_grants where organization_id=org_a and user_id=staff_id) is true;
  insert into public.organization_members(organization_id,user_id,full_name,role,active) values
    (org_b,staff_id,'Preview staff','viewer',true),(org_a,staff_id,'Inactive fixture','viewer',false);
  begin
    update public.organization_members set active=true where organization_id=org_a and user_id=staff_id;
    raise exception 'Provider could be activated as an internal member';
  exception when check_violation then null; end;
  update private.fm_provider_accounts set active=false where supplier_id=supplier_a and user_id=staff_id;
  assert (select grant_count=1 and kind='provider' from private.fm_identity_grants where organization_id=org_a and user_id=staff_id) is true;
  delete from private.fm_provider_accounts where supplier_id=supplier_b and user_id=staff_id;
  assert not exists(select from private.fm_identity_grants where organization_id=org_a and user_id=staff_id);
  update public.organization_members set active=true where organization_id=org_a and user_id=staff_id;
  begin
    update private.fm_provider_accounts set active=true where supplier_id=supplier_a and user_id=staff_id;
    raise exception 'Member could be activated as a provider';
  exception when check_violation then null; end;
  begin
    insert into private.fm_provider_accounts(supplier_id,user_id) values (supplier_b,staff_id);
    raise exception 'Member could insert a conflicting provider grant';
  exception when check_violation then null; end;
  update public.organization_members set role='analyst' where organization_id=org_a and user_id=staff_id;
  assert (select grant_count=1 and kind='internal' from private.fm_identity_grants where organization_id=org_a and user_id=staff_id) is true;
  delete from public.organization_members where organization_id=org_a and user_id=staff_id;
  update private.fm_provider_accounts set active=true where supplier_id=supplier_a and user_id=staff_id;
  begin
    insert into public.organization_members(organization_id,user_id,full_name,role)
      values(org_a,staff_id,'Conflicting fixture','approver');
    raise exception 'Provider could insert a conflicting internal grant';
  exception when check_violation then null; end;
  begin
    update private.fm_provider_accounts set user_id=owner_id where supplier_id=supplier_a and user_id=staff_id;
    raise exception 'Supplier mapping could be reassigned to an internal owner';
  exception when check_violation then null; end;
  begin
    update public.suppliers set organization_id=org_b where id=supplier_a;
    raise exception 'Mapped supplier organization changed';
  exception when insufficient_privilege then null; end;
  assert (select grant_count=1 and kind='provider' from private.fm_identity_grants where organization_id=org_a and user_id=staff_id) is true;
  assert (select grant_count=1 and kind='internal' from private.fm_identity_grants where organization_id=org_b and user_id=staff_id) is true;
end $$;
select 'passed' as identity_boundary_fixture;
rollback;
