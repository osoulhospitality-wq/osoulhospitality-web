import { verifyFacilityDesk } from "./facility-acceptance.mjs";
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { isDeepStrictEqual, parseEnv } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const [settings, destination] = process.argv.slice(2);
if (!settings || !destination) throw new Error('Expected local CLI settings and a report directory.');
const report = { environment: 'isolated Docker Supabase Auth, PostgREST and PostgreSQL', cases: [] };
const reportPath = join(destination, 'auth-postgrest.json');
const localOrigin = 'http://127.0.0.1:54321';
const password = () => randomBytes(30).toString('base64url') + 'aA1!';
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
function checked(r) {
  if (r.error) {
    const code = String(r.error.code || r.error.status || 'local_api_failure');
    throw new Error(/^[a-zA-Z0-9_]{1,55}$/.test(code) ? code : 'local_api_failure');
  }
  return r.data;
}
async function verify(id, input, expected, run) {
  const start = performance.now();
  let actual;
  try { actual = await run(); }
  catch (error) {
    // Never serialize request/error objects, tokens, passwords or response payloads.
    actual = { failure: /^[a-zA-Z0-9_]{1,55}$/.test(error.message) ? error.message : 'unexpected_error' };
  }
  const passed = isDeepStrictEqual(actual, expected);
  report.cases.push({ id, input, expected, actual, duration_ms: performance.now() - start,
    provider_model_cost_usd: 0, passed, corrective_action: passed ? null : 'Inspect the local fixture or application contract before release.' });
  await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  if (!passed) throw new Error('assertion_' + id);
}
// RFC 6238, SHA-1, six digits, 30-second period. The local Auth server supplies the seed.
function otp(base32) {
  const symbols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; const bytes = [];
  let buffer = 0, bits = 0;
  for (const char of base32.toUpperCase().replace(/=+$/, '')) {
    const value = symbols.indexOf(char);
    if (value < 0) throw new Error('invalid_test_seed');
    buffer = (buffer << 5) | value; bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >>> bits) & 255); buffer &= (1 << bits) - 1; }
  }
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hash = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  return ((hash.readUInt32BE(hash.at(-1) & 15) & 0x7fffffff) % 1_000_000).toString().padStart(6,'0');
}
async function run() {
  const env = parseEnv(await readFile(settings, 'utf8'));
  await unlink(settings);
  if (env.API_URL !== localOrigin || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) throw new Error('unexpected_local_stack');
  const org = randomUUID(), other = randomUUID(), site = randomUUID(), otherSite = randomUUID(),
    asset = randomUUID(), proposal = randomUUID(), browserSite = randomUUID();
  const admin = createClient(localOrigin, env.SERVICE_ROLE_KEY, options);
  const users = {};
  for (const role of ['operator','approver']) {
    const user = { email: role + '.' + randomUUID() + '@example.invalid', password: password(), client: createClient(localOrigin, env.ANON_KEY, options) };
    users[role] = user;
    await verify(role + '_created','localhost Auth Admin createUser; confirmed synthetic address',true,async () => {
      const created = checked(await admin.auth.admin.createUser({ email:user.email, password:user.password, email_confirm:true, user_metadata:{full_name:'Synthetic ' + role} }));
      user.id = created.user.id; return Boolean(user.id);
    });
    await verify(role+'_password_login','signInWithPassword against local GoTrue','aal1',async () => {
      const session = checked(await user.client.auth.signInWithPassword({ email:user.email, password:user.password }));
      if (session.user.id !== user.id) throw new Error('subject_mismatch');
      return checked(await user.client.auth.mfa.getAuthenticatorAssuranceLevel()).currentLevel;
    });
  }
  const {operator,approver} = users;
  const ids={org,other,site,otherSite,browserSite,asset,op:operator.id,owner:approver.id};
  const psqlArgs = Object.entries(ids).flatMap(([key,value]) => ['--set', key+'='+value]);
  // Bootstrapping is confined to the fixed CLI project's local PostgreSQL container.
  const seed = spawnSync('docker',['exec','-i','supabase_db_draqon-ci-auth','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres',...psqlArgs],{
    input:`BEGIN;
INSERT INTO public.organizations(id,name,created_by) VALUES (:'org','Synthetic Hotel',:'owner'),(:'other','Other Test Property',:'owner');
INSERT INTO public.organization_members(organization_id,user_id,full_name,role) VALUES (:'org',:'op','Synthetic Coordinator','analyst');
INSERT INTO public.facilities(id,organization_id,name) VALUES (:'site',:'org','Test Hotel'),(:'otherSite',:'other','Other Property'),(:'browserSite',:'org','Synthetic walkthrough property');
INSERT INTO public.facility_assets(id,organization_id,facility_id,asset_code,name) VALUES (:'asset',:'org',:'site','AHU-01','Synthetic test unit');
INSERT INTO private.draqon_field_pilot(organization_id,enabled) VALUES (:'org',true);
COMMIT;\n`, encoding:'utf8',timeout:15000
  });
  if(seed.status!==0) throw new Error('fixture_seed_failed');
  const draft = {p_org:org,p_id:proposal,p_asset:asset,p_summary:'Synthetic field inspection',p_issue:null};
  const prepare = () => operator.client.rpc('draqon_prepare_field',draft);
  const accept = (u) => u.client.rpc('draqon_approve_field',{p_org:org,p_id:proposal,p_assignee:operator.id});
  await verify('password_only_cannot_issue','real signed AAL1 session requests field preparation','42501',async()=> (await prepare()).error?.code || 'allowed');
  for (const [role,user] of Object.entries(users)) {
    await verify(role+'_verified_totp','server enroll, challenge and verify via TOTP; signed session and verified factor','aal2',async () => {
      const enrolled = checked(await user.client.auth.mfa.enroll({factorType:'totp',friendlyName:'Synthetic CI factor'}));
      user.secret = enrolled.totp.secret;
      const {id:challengeId} = checked(await user.client.auth.mfa.challenge({factorId:enrolled.id}));
      if (Date.now()%30_000>28_000) await delay(2100);
      checked(await user.client.auth.mfa.verify({factorId:enrolled.id,challengeId,code:otp(user.secret)}));
      const factors = checked(await user.client.auth.mfa.listFactors());
      if(!factors.totp.some(f=>f.id===enrolled.id && f.status==='verified')) throw new Error('factor_not_verified');
      return checked(await user.client.auth.mfa.getAuthenticatorAssuranceLevel()).currentLevel;
    });
  }
  await verify('read_other_site','coordinator requesting known other-organization site ID',[],async()=>
    checked(await operator.client.from('facilities').select('id').eq('id',otherSite)));
  await verify('prepare','operator prepares scoped private proposal',true,async()=>checked(await prepare())===proposal);
  await verify('prepare_replay','same reference and payload',true,async()=>checked(await prepare())===proposal);
  await verify('operator_cannot_approve','operator tries approving own proposal','42501',async()=> (await accept(operator)).error?.code || 'allowed');
  let order;
  await verify('issue','second person approves, assigned to original operator',true,async()=>{order=checked(await accept(approver));return typeof order==='string' && order.length===36;});
  await verify('issue_replay','same approver and assignee replay',true,async()=>checked(await accept(approver))===order);
  const transition = (u,status) => u.client.from('facility_work_orders').update({status}).eq('id',order).eq('organization_id',org).select('status').single();
  await verify('start','assigned operator starts order','in_progress',async()=>checked(await transition(operator,'in_progress')).status);
  await verify('no_visit','approver attempts closure before site visit','23514',async()=> (await transition(approver,'completed')).error?.code || 'allowed');
  let visit;
  await verify('visit','assigned operator records linked findings',true,async()=>{
    const row=checked(await operator.client.from('facility_visits').insert({organization_id:org,work_order_id:order,findings:'Synthetic visit evidence'}).select('id,created_by').single());
    visit=row.id; return Boolean(visit) && row.created_by===operator.id;
  });
  await verify('coordinator_cannot_close','operator requests closure with site evidence','23514',async()=> (await transition(operator,'completed')).error?.code || 'allowed');
  await verify('close','second person closes order with authenticated visit','completed',async()=>checked(await transition(approver,'completed')).status);
  await verify('audit_receipt','five ordered receipts with actor IDs, business entity and timestamps',true,async()=>{
    const rows=checked(await operator.client.from('draqon_field_events').select('event_type,actor_id,entity_id,recorded_at').eq('organization_id',org).eq('proposal_id',proposal).order('recorded_at'));
    const expect=[['prepared',operator.id,proposal],['issued',approver.id,order],['started',operator.id,order],['visit_recorded',operator.id,visit],['closed',approver.id,order]];
    return rows.every(r=>Number.isFinite(Date.parse(r.recorded_at))) && isDeepStrictEqual(rows.map(r=>[r.event_type,r.actor_id,r.entity_id]),expect);
  });
  await verify('business_receipt','read proposal ownership, issue receipt and accepted order through client RLS',true,async()=>{
    const row=checked(await operator.client.from('draqon_field_proposals').select('approved_by,submitted_by,assigned_to,work_order_id').eq('organization_id',org).eq('id',proposal).single());
    const closed=checked(await approver.client.from('facility_work_orders').select('status,completed_at').eq('id',order).single());
    return row.approved_by===approver.id && row.submitted_by===operator.id && row.assigned_to===operator.id && row.work_order_id===order && closed.status==='completed' && Boolean(closed.completed_at);
  });
  await verifyFacilityDesk({operator,approver,org,site,otherSite,asset,verify,checked});
  console.log('Local Auth and PostgREST checks passed:',report.cases.length);
  // A verified TOTP cannot be replayed in the same time slot. A fresh browser signs in independently.
  await delay(30_000 - Date.now()%30_000 + 800);
  const browserEnv = {PATH:process.env.PATH,HOME:process.env.HOME,NODE_PATH:process.env.NODE_PATH,
    UAT_SUPABASE_URL:localOrigin,UAT_SUPABASE_KEY:env.ANON_KEY,UAT_ORG:org,UAT_ASSET:asset,
    UAT_OPERATOR_ID:operator.id,UAT_REPORT_PATH:resolve(destination,'field-browser.json'),
    UAT_CHECK_DOSSIER:'true',UAT_FACILITY:browserSite,UAT_SECOND_SITE:site,UAT_MEMORY_REPORT_PATH:resolve(destination,'building-memory-browser.json')};
  for(const [name,user] of Object.entries(users)){
    const p='UAT_'+name.toUpperCase()+'_'; browserEnv[p+'EMAIL']=user.email;
    browserEnv[p+'PASSWORD']=user.password; browserEnv[p+'TOTP']=user.secret;
  }
  const child=spawnSync(process.execPath,['automation/uat/field-browser.cjs'],{env:browserEnv,stdio:'inherit',timeout:240_000});
  if(child.status!==0) throw new Error('browser_journey_failed');
}
run().catch(error=>{
  const stage=/^[a-zA-Z0-9_]{1,55}$/.test(error.message)?error.message:'unexpected_setup_failure';
  console.error('Isolated field handoff failed at',stage);process.exitCode=1;
});
