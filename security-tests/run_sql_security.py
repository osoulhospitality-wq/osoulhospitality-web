#!/usr/bin/env python3
"""Real PostgreSQL isolated RLS regression. Loopback TCP only; no production credentials.
PG_TEST_BIN must point to directory containing postgres and initdb. Optional
PG_TEST_SHARE supplies PostgreSQL share directory; LD_* inherited for local runtime.
"""
import argparse, hashlib,json,os,pathlib,re,subprocess,tempfile,sys,socket,contextlib
ROOT=pathlib.Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);args=p.parse_args()
binpath=pathlib.Path(os.environ['PG_TEST_BIN']); share=os.environ.get('PG_TEST_SHARE')
U=lambda n:f'00000000-0000-4000-8000-{n:012d}'
A,B=U(101),U(102); OWNER,ANALYST,VIEWER,BOWNER,APPROVER,INACTIVE=[U(n) for n in range(1,7)]
R,AP,S,BS=U(201),U(202),U(301),U(302)
results=[]; raw=[]
with contextlib.ExitStack() as cleanup:
 tmp=cleanup.enter_context(tempfile.TemporaryDirectory(prefix='osoul-security-pg-'))
 data=pathlib.Path(tmp)/'data'
 cmd=[str(binpath/'initdb'),'-D',str(data),'-U','postgres','-A','trust','--no-locale','--encoding=UTF8']
 if share:cmd+=['-L',share]
 init=subprocess.run(cmd,text=True,capture_output=True)
 if init.returncode:raise RuntimeError(init.stderr)
 with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as probe:
  probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
 start=subprocess.run([str(binpath/'pg_ctl'),'-D',str(data),'-l',str(pathlib.Path(tmp)/'server.log'),'-o',f"-c listen_addresses='127.0.0.1' -c unix_socket_directories='' -p {port}",'start'],capture_output=True,text=True)
 if start.returncode:raise RuntimeError((pathlib.Path(tmp)/'server.log').read_text())
 def stop():
  subprocess.run([str(binpath/'pg_ctl'),'-D',str(data),'-m','immediate','stop'],capture_output=True)
 cleanup.callback(stop)
 def sql(db,query):
  r=subprocess.run([str(binpath/'psql'),'-h','127.0.0.1','-p',str(port),'-U','postgres','-d',db,'-X','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],input=query,text=True,capture_output=True)
  raw.append({'db':db,'sql':query,'stdout':r.stdout,'stderr':r.stderr,'exit':r.returncode})
  return r.stdout+'\n'+r.stderr
 def require(db,q):
  out=sql(db,q)
  if re.search(r'\b(ERROR|FATAL):',out):raise RuntimeError(out)
 require('postgres','create role authenticated nologin;create role anon nologin;')
 for db in ['baseline','hardened']:
  require('postgres',f'create database {db};')
  require(db,(ROOT/'auth_storage_stubs.sql').read_text())
  require(db,(ROOT.parent/'command-center/enterprise/schema.sql').read_text())
  if db=='hardened':require(db,(ROOT/'prepared_hardening.sql').read_text())
  seed=f"""
  insert into auth.users(id,email) values {','.join(f"('{U(i)}','synthetic{i}@example.invalid')" for i in range(1,7))};
  insert into public.organizations(id,name,created_by) values ('{A}','Synthetic A','{OWNER}'),('{B}','Synthetic B','{BOWNER}');
  insert into public.organization_members(organization_id,user_id,full_name,role,active) values
  ('{A}','{ANALYST}','Synthetic analyst','analyst',true),('{A}','{VIEWER}','Synthetic viewer','viewer',true),('{A}','{APPROVER}','Synthetic approver','approver',true),('{A}','{INACTIVE}','Synthetic inactive','analyst',false);
  select set_config('request.jwt.claims','{{"sub":"{OWNER}","aal":"aal2"}}',false);
  insert into public.suppliers(id,organization_id,name,created_by) values ('{S}','{A}','Supplier A','{OWNER}');
  select set_config('request.jwt.claims','{{"sub":"{BOWNER}","aal":"aal2"}}',false);
  insert into public.suppliers(id,organization_id,name,created_by) values ('{BS}','{B}','Supplier B','{BOWNER}');
  select set_config('request.jwt.claims','{{"sub":"{OWNER}","aal":"aal2"}}',false);
  insert into public.requests(id,organization_id,title,body,requester_id,assigned_to) values ('{R}','{A}','Synthetic request','Synthetic body','{OWNER}','{ANALYST}');
  insert into public.approvals(id,organization_id,entity_type,entity_id,requested_by) values ('{AP}','{A}','request','{R}','{OWNER}');
  insert into storage.objects(bucket_id,name,owner_id) values ('command-center-documents','{A}/fixture.pdf','{OWNER}'),('command-center-documents','{B}/fixture.pdf','{BOWNER}');
  """
  require(db,seed)
  def case(name,uid,statement,deny=False,aal='aal2',role='authenticated',bug=False):
   query=f"begin;set local role {role};select set_config('request.jwt.claims','{json.dumps({'sub':uid,'aal':aal})}',true);{statement};select 'CASE_OK';rollback;"
   out=sql(db,query);error=bool(re.search(r'\bERROR:',out));ok='CASE_OK' in out and not error
   expected_deny=deny and not (bug and db=='baseline')
   passed=(error and bool(re.search(r'42501|23503',out))) if expected_deny else ok
   results.append({'database':db,'case':name,'expected':'deny' if expected_deny else ('baseline_vulnerability_reproduced' if bug else 'allow_or_assert'),'passed':passed,'security_gap_reproduced':bug and db=='baseline' and ok,'error_code':(re.search(r'ERROR:\s+([0-9A-Z]{5}):',out) or [None,None])[1]})
  def assertion(expr):return f"do $$begin if not ({expr}) then raise exception 'ASSERTION_FAILED'; end if;end$$"
  case('authenticated_is_not_superuser',OWNER,assertion("current_user='authenticated' and not (select rolsuper from pg_roles where rolname=current_user) and row_security_active('public.suppliers'::regclass)"))
  case('owner_reads_only_own_org',OWNER,assertion("(select count(*) from public.suppliers)=1"))
  case('owner_b_reads_only_b',BOWNER,assertion(f"(select count(*) from public.suppliers where id='{S}')=0"))
  case('aal1_reads_zero',OWNER,assertion('(select count(*) from public.suppliers)=0'),aal='aal1')
  case('aal1_write_denied',OWNER,f"insert into public.suppliers(organization_id,name,created_by)values('{A}','Blocked','{OWNER}')",True,aal='aal1')
  case('anon_business_denied',OWNER,'select * from public.suppliers',True,role='anon')
  case('inactive_member_reads_zero',INACTIVE,assertion('(select count(*) from public.suppliers)=0'))
  case('viewer_reads_own_org',VIEWER,assertion('(select count(*) from public.suppliers)=1'))
  case('viewer_write_denied',VIEWER,f"insert into public.suppliers(organization_id,name,created_by)values('{A}','Blocked','{VIEWER}')",True)
  case('analyst_contract_denied',ANALYST,f"insert into public.contracts(organization_id,name,created_by)values('{A}','Blocked','{ANALYST}')",True)
  case('approver_contract_allowed',APPROVER,f"insert into public.contracts(organization_id,name,created_by)values('{A}','Allowed','{APPROVER}')")
  case('cross_org_supplier_fk_denied',OWNER,f"insert into public.contracts(organization_id,name,created_by,supplier_id)values('{A}','Blocked','{OWNER}','{BS}')",True)
  case('same_org_assignment_allowed',ANALYST,f"update public.requests set assigned_to='{APPROVER}' where id='{R}'")
  case('cross_org_assignment',ANALYST,f"update public.requests set assigned_to='{BOWNER}' where id='{R}'",True,bug=True)
  case('inactive_assignment',ANALYST,f"update public.requests set assigned_to='{INACTIVE}' where id='{R}'",True,bug=True)
  case('requester_impersonation',ANALYST,f"update public.requests set requester_id='{BOWNER}' where id='{R}'",True,bug=True)
  case('approval_pending_allowed',ANALYST,f"insert into public.approvals(organization_id,entity_type,entity_id,requested_by)values('{A}','request','{R}','{ANALYST}')")
  case('analyst_preapproved_insert',ANALYST,f"insert into public.approvals(organization_id,entity_type,entity_id,requested_by,status,decided_by,decided_at)values('{A}','request','{R}','{ANALYST}','approved','{BOWNER}',now())",True,bug=True)
  case('approver_identity_forgery',APPROVER,f"update public.approvals set status='approved',decided_by='{BOWNER}',decided_at=now() where id='{AP}'",True,bug=True)
  case('approval_real_transition_allowed',APPROVER,f"update public.approvals set status='approved',decided_by='{APPROVER}',decided_at=now() where id='{AP}'")
  if db=='hardened':
   case('decision_server_attribution',APPROVER,f"update public.approvals set status='approved' where id='{AP}';"+assertion(f"(select decided_by='{APPROVER}' and decided_at is not null from public.approvals where id='{AP}')"))
   case('single_bootstrap_trigger',OWNER,assertion("(select count(*) from pg_trigger where tgrelid='public.organizations'::regclass and not tgisinternal)=1"))
  case('storage_reads_only_own',OWNER,assertion('(select count(*) from storage.objects)=1'))
  case('storage_aal1_hidden',OWNER,assertion('(select count(*) from storage.objects)=0'),aal='aal1')
  case('storage_cross_org_upload_denied',OWNER,f"insert into storage.objects(bucket_id,name,owner_id)values('command-center-documents','{B}/blocked.pdf','{OWNER}')",True)
  case('storage_own_upload_allowed',ANALYST,f"insert into storage.objects(bucket_id,name,owner_id)values('command-center-documents','{A}/allowed.pdf','{ANALYST}')")
  case('audit_append_direct_denied',ANALYST,f"insert into public.audit_events(organization_id,action,entity_type)values('{A}','forged','request')",True)
  case('audit_owner_read',OWNER,assertion('(select count(*) from public.audit_events)>0'))
  case('audit_viewer_hidden',VIEWER,assertion('(select count(*) from public.audit_events)=0'))
  case('analyst_approval_update_noop',ANALYST,f"update public.approvals set status='approved' where id='{AP}';"+assertion(f"(select status='pending' from public.approvals where id='{AP}')"))
  # Reproduce production-observed broad grants ONLY inside this isolated DB.
  require(db,'grant truncate,trigger,references on all tables in schema public to authenticated;')
  if db=='hardened':require(db,(ROOT/'prepared_hardening.sql').read_text())
  case('observed_grant_truncate_bypasses_rls',VIEWER,'truncate public.suppliers cascade',True,bug=True)
 args.output.mkdir(parents=True,exist_ok=True)
 summary={'engine':'PostgreSQL 16.15 server over isolated loopback TCP','production_changed':False,'auth':'stub JWT claims; no JWT signature validation or real MFA','schema_sha256':hashlib.sha256((ROOT.parent/'command-center/enterprise/schema.sql').read_bytes()).hexdigest(),'results':results,'passed':sum(r['passed'] for r in results),'total':len(results),'baseline_vulnerabilities':sum(r['security_gap_reproduced'] for r in results)}
 (args.output/'sql_security_results.json').write_text(json.dumps(summary,indent=2))
 (args.output/'sql_security_raw.json').write_text(json.dumps(raw,indent=2))
 print(json.dumps(summary,indent=2))
 if not all(r['passed'] for r in results):sys.exit(1)
