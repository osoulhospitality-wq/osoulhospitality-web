-- Run with psql against the isolated acceptance branch (direct or Supabase pooler).
-- The test sets synthetic identities only for this transaction. All workflow calls
-- run as authenticated and all fixtures roll back. No storage bytes are uploaded.
\set ON_ERROR_STOP on
select (lower(:'HOST') = 'db.shshmqvgtoozxulztsqs.supabase.co'
        or (lower(:'HOST') like '%.pooler.supabase.com' and :'USER' = 'postgres.shshmqvgtoozxulztsqs')) as qa_is_preview \gset
\if :qa_is_preview
begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-000002932e01');
insert into auth.users(id) values ('00000000-0000-0000-0000-000002932e02');
insert into auth.users(id) values ('00000000-0000-0000-0000-000002932e03');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000002932e01","aal":"aal2"}',true);
insert into public.organizations(id,name,created_by) values ('00000000-0000-0000-0000-000002932e04','QA facility organization','00000000-0000-0000-0000-000002932e01');
insert into public.suppliers(id,organization_id,name,created_by) values ('00000000-0000-0000-0000-000002932e05','00000000-0000-0000-0000-000002932e04','QA Supplier A','00000000-0000-0000-0000-000002932e01'),('00000000-0000-0000-0000-000002932e06','00000000-0000-0000-0000-000002932e04','QA Supplier B','00000000-0000-0000-0000-000002932e01');
insert into public.contracts(id,organization_id,supplier_id,name,created_by) values ('00000000-0000-0000-0000-000002932e07','00000000-0000-0000-0000-000002932e04','00000000-0000-0000-0000-000002932e05','QA Contract A','00000000-0000-0000-0000-000002932e01'),('00000000-0000-0000-0000-000002932e08','00000000-0000-0000-0000-000002932e04','00000000-0000-0000-0000-000002932e06','QA Contract B','00000000-0000-0000-0000-000002932e01');
insert into private.fm_provider_accounts(supplier_id,user_id) values ('00000000-0000-0000-0000-000002932e05','00000000-0000-0000-0000-000002932e02'),('00000000-0000-0000-0000-000002932e06','00000000-0000-0000-0000-000002932e03');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000002932e02","aal":"aal1"}',true);
do $$begin if exists(select 1 from public.fm_provider_contracts()) then raise exception 'MFA gate failed';end if;end$$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000002932e02","aal":"aal2"}',true);
do $$declare a uuid;b uuid;begin
if (select count(*) from public.fm_provider_contracts())<>1 or not exists(select 1 from public.fm_provider_contracts() where contract_id='00000000-0000-0000-0000-000002932e07') then raise exception 'contract scope failed';end if;
a:=public.fm_provider_submit('00000000-0000-0000-0000-000002932e07','00000000-0000-0000-0000-000002932e09','visit_report','QA ref','synthetic test');
b:=public.fm_provider_submit('00000000-0000-0000-0000-000002932e07','00000000-0000-0000-0000-000002932e09','visit_report','QA ref','synthetic test');
if a is distinct from b or (select count(*) from public.fm_submission_inbox(null,'00000000-0000-0000-0000-000002932e07'))<>1 then raise exception 'receipt failed';end if;
end$$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000002932e03","aal":"aal2"}',true);
do $$begin if exists(select 1 from public.fm_submission_inbox(null,'00000000-0000-0000-0000-000002932e07')) then raise exception 'unexpected submission';end if;end$$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000002932e01","aal":"aal2"}',true);
do $$declare target uuid;begin
select submission_id into strict target from public.fm_submission_inbox('00000000-0000-0000-0000-000002932e04');
perform public.fm_review_submission(target,'accepted','QA reviewed');
if not exists(select 1 from public.fm_submission_inbox('00000000-0000-0000-0000-000002932e04') where submission_id=target and decision='accepted' and reviewed_at is not null) then raise exception 'review failed';end if;
end$$;
select 'Passed MFA, provider contract scope, submission, idempotent replay, second provider scope, independent review and receipt' as staging_result;
rollback;
\else
\echo Refusing to run outside the designated preview database
\quit 3
\endif
