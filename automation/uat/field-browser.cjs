// Runs exclusively against an explicitly configured loopback Supabase/test double.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const env = process.env;
const must = key => { if (!env[key]) throw new Error('Missing test input ' + key); return env[key]; };
const backend = new URL(must('UAT_SUPABASE_URL'));
if (!['127.0.0.1','localhost','[::1]'].includes(backend.hostname) || backend.protocol !== 'http:') throw new Error('Disposable loopback service required');
const backendKey = must('UAT_SUPABASE_KEY');
const org = must('UAT_ORG'), asset = must('UAT_ASSET'), operatorId = must('UAT_OPERATOR_ID');
const issueBase = crypto.randomInt(10000000,99999999);
const report = {date:new Date().toISOString(), scope:env.UAT_BACKEND_DESCRIPTION || 'Disposable local Supabase Auth/PostgREST/PostgreSQL', issue:issueBase, checks:[], timingMs:[]};
const sleep = ms => new Promise(r=>setTimeout(r,ms));

function totp(secret) {
  const bits=[...secret.toUpperCase().replace(/[\s=]/g,'')].map(c=>{
    const index='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c);assert(index>=0);
    return index.toString(2).padStart(5,'0');
  }).join('');
  const bytes=Buffer.from((bits.match(/.{8}/g)||[]).map(s=>parseInt(s,2)));
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const mac=crypto.createHmac('sha1',bytes).update(counter).digest();
  return String((mac.readUInt32BE(mac[19]&15)&0x7fffffff)%1000000).padStart(6,'0');
}

function site() {
  const types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
  return http.createServer(async(req,res)=>{
    try {
      const pathname=new URL(req.url,'http://localhost').pathname;
      if(pathname.endsWith('/config.js')) {res.setHeader('Content-Type',types['.js']);return res.end('window.OSOUL_ENTERPRISE_CONFIG='+JSON.stringify({supabaseUrl:backend.origin,supabasePublishableKey:backendKey}));}
      const candidate=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
      if(!candidate.startsWith(root+path.sep)) {res.writeHead(403);return res.end();}
      const body=await fs.readFile(candidate);
      res.setHeader('Content-Type',types[path.extname(candidate)]||'application/octet-stream');res.end(body);
    } catch {res.writeHead(404);res.end();}
  });
}

async function run() {
  const server=site();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:env.CHROMIUM_BIN || undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const checks=report.checks;
  async function verify(name, action) {
    const start=performance.now();
    try {await action();checks.push({name,pass:true,ms:Math.round(performance.now()-start)});}
    catch(e){checks.push({name,pass:false,ms:Math.round(performance.now()-start)});throw e;}
  }
  async function actor(lang,role) {
    const ctx=await browser.newContext({viewport:{width:390,height:844},locale:lang==='ar'?'ar-SA':'en-US',serviceWorkers:'block'});
    const page=await ctx.newPage();page.setDefaultTimeout(12000);
    const unhandled=[];page.on('pageerror',err=>unhandled.push(err.name));
    await ctx.route('**/*',route=>[origin,backend.origin].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
    await page.goto(origin+(lang==='en'?'/en':'')+'/command-center/enterprise/');
    const password=page.locator('#sign-in-view');
    await password.locator('[name=email]').fill(must('UAT_'+role+'_EMAIL'));
    await password.locator('[name=password]').fill(must('UAT_'+role+'_PASSWORD'));
    await password.locator('[type=submit]').click();
    const challenge=page.locator('#mfa-verify-view');
    await challenge.waitFor();
    assert.equal(await page.locator('#dashboard-view').isVisible(),false);
    const seed=must('UAT_'+role+'_TOTP');
    for(let attempt=0;attempt<2;attempt++){
      if(30000-Date.now()%30000<2500) await sleep(31000-Date.now()%30000);
      await challenge.locator('[name=code]').fill(totp(seed));
      await challenge.locator('[type=submit]').click();
      try{await page.locator('#organization-select option[value="'+org+'"]').waitFor({state:'attached',timeout:10000});break;}
      catch(err){if(attempt===1)throw err;await sleep(31000-Date.now()%30000);}
    }
    await page.selectOption('#organization-select',org);
    return {page,ctx,unhandled};
  }
  const field=page=>page.locator('#draqon-field-handoff'), operations=page=>page.locator('#facility-operations');
  async function open(panel) {if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();}
  const workSummary='تجربة فحص أصل UAT '+issueBase;
  const finding='زيارة اختبار اصطناعية UAT '+issueBase;
  async function submitDraft(page,issue,summary){
    await open(field(page));
    const form=page.locator('#draqon-field-form');
    await form.locator('[name=issue]').fill(String(issue));
    await form.locator('[name=asset]').selectOption(asset);
    await form.locator('[name=summary]').fill(summary);
    // A fresh queue row is returned by a separate authenticated read after the mutation.
    const row=page.locator('#draqon-field-queue li').filter({hasText:summary});
    const start=performance.now();
    await form.locator('button[type=submit],button:not([type])').click();
    await row.waitFor(); await page.waitForFunction(()=>document.querySelector('#draqon-field-status').textContent.includes('سُجلت'));
    return performance.now()-start;
  }
  try {
    let op,approver;
    await verify('Independent Arabic operator and English approver authenticate through password and MFA screens',async()=>{
      [op,approver]=await Promise.all([actor('ar','OPERATOR'),actor('en','APPROVER')]);
      assert.notEqual(op.ctx,approver.ctx);
      assert.notEqual(await op.page.locator('#session-identity').textContent(),await approver.page.locator('#session-identity').textContent());
    });
    const a=op.page,b=approver.page;
    await verify('Arabic draft acknowledged and independently fetched in queue',async()=>{report.timingMs.push(await submitDraft(a,issueBase,workSummary));});
    await verify('Submitter cannot approve own draft in the Arabic queue',async()=>{
      assert.equal(await a.locator('#draqon-field-queue li').filter({hasText:workSummary}).locator('button').count(),0);
    });
    await verify('Independent English approver assigns coordinator and issues linked order',async()=>{
      await open(field(b));const row=b.locator('#draqon-field-queue li').filter({hasText:workSummary});
      await row.locator('select').selectOption(operatorId);
      await row.getByRole('button',{name:'Approve and issue work order'}).click();
      await row.getByText('Work order reference',{exact:false}).first().waitFor();
      report.orderId=await row.locator('bdi[dir=ltr]').first().textContent();
      assert.match(report.orderId,/^[a-f0-9-]{36}$/i);
    });
    await verify('Arabic operator starts the issued order',async()=>{
      await open(operations(a));const row=a.locator('#facility-work-orders li').filter({hasText:workSummary});
      await row.getByRole('button',{name:'بدء التنفيذ'}).click();
      await row.getByRole('button',{name:'اعتماد الإغلاق'}).waitFor();
    });
    await verify('English closure before a visit is denied by the database, state remains in progress',async()=>{
      await open(operations(b));const row=b.locator('#facility-work-orders li').filter({hasText:workSummary});
      await row.getByRole('button',{name:'Approve closure'}).click();
      await b.locator('#facility-status').filter({hasText:'could not be updated'}).waitFor();
      assert.match(await row.innerText(),/In progress/);
    });
    await verify('Operator records the visit and sees the separately read evidence',async()=>{
      const f=a.locator('#visit-form');await f.locator('[name=work_order_id]').selectOption(report.orderId);
      await f.locator('[name=findings]').fill(finding);await f.locator('button').click();
      await a.locator('#facility-work-orders li').filter({hasText:workSummary}).getByText(finding,{exact:true}).waitFor();
    });
    await verify('Independent approver closes via standard work-order action',async()=>{
      const row=b.locator('#facility-work-orders li').filter({hasText:workSummary});
      await row.getByRole('button',{name:'Approve closure'}).click();
      await b.locator('#facility-status').filter({hasText:'Work order updated'}).waitFor();
      await row.filter({hasText:'Completed'}).waitFor();
      assert.equal(await row.locator('button').count(),0);
    });
    await verify('Fresh Arabic and English page loads show same completed reference and three actor evidence lines',async()=>{
      for(const [page,closed,markers] of [[a,'إغلاق ميداني معتمد',['بدأ التنفيذ','سجل الزيارة','اعتمد الإغلاق']],[b,'Field closure approved',['Started by','Visit recorded by','Closure approved by']]]){
        await page.reload();await open(field(page));
        const row=page.locator('#draqon-field-queue li').filter({hasText:workSummary});
        await row.filter({hasText:closed}).waitFor();
        assert.equal(await row.locator('bdi[dir=ltr]').first().textContent(),report.orderId);
        for (const marker of markers) assert.match(await row.textContent(),new RegExp(marker));
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      }
    });
    await verify('Twenty independent Arabic submissions return visible durable queue receipts',async()=>{
      for(let i=1;i<20;i++) report.timingMs.push(await submitDraft(a,issueBase+i,'قياس الاستلام '+issueBase+' / '+String(i).padStart(2,'0')));
      assert.equal(report.timingMs.length,20);
      const sorted=[...report.timingMs].sort((x,y)=>x-y);
      report.intake={sampleSize:sorted.length,p50Ms:+sorted[Math.ceil(sorted.length*.50)-1].toFixed(2),p95Ms:+sorted[Math.ceil(sorted.length*.95)-1].toFixed(2),method:'Serial Playwright click to durable separate read in visible queue plus success status; includes driver scheduling, local mobile viewport; excludes typing, sign-in, WAN and production traffic.'};
    });
    await verify('No browser application errors',async()=>assert.deepEqual([...op.unhandled,...approver.unhandled],[]));
    report.result='pass';report.browser=browser.version();
  }finally{await browser.close();await new Promise(r=>server.close(r));}
}
run().catch(err=>{report.result='fail';report.errorType=err.name;console.error('UAT failed at',report.checks.at(-1)?.name || 'initialization', report.errorType);process.exitCode=1;}).finally(async()=>{
  report.timingMs=report.timingMs.map(x=>+x.toFixed(2));
  await fs.writeFile(must('UAT_REPORT_PATH'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({result:report.result,steps:report.checks.length,intake:report.intake}));
});
