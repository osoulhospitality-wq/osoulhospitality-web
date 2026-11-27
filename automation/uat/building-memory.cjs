// Optional extension of the authenticated two-context run. All records are synthetic.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const jsQR = require('jsqr');

async function exerciseBuildingMemory(a,b,options) {
  const {siteId,issueBase,output,secondSiteId}=options;
  const checks=[];
  const open=async(page)=>{
    const panel=page.locator('#draqon-building-memory');
    if(!await panel.evaluate(x=>x.open))await panel.locator('summary').first().click();
    await page.locator('#memory-site').selectOption(siteId);
    await page.locator('#memory-site-work').waitFor();
  };
  const check=async(name,fn)=>{
    const start=performance.now();
    try{await fn();checks.push({name,status:'pass',elapsedMs:Math.round(performance.now()-start)});}
    catch(error){checks.push({name,status:'fail',errorType:error.name});throw error;}
  };
  let token,assetId,receipt,photo;
  const source='UAT survey '+issueBase;
  const labelName='UAT pump '+issueBase;
  const asOf=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const file=path.resolve(output);
  const meta={scope:'Two authenticated loopback browser contexts, deployed UI bundle from checkout; synthetic asset and sourced fact',checks};
  try{
    await check('Arabic operator registers a scoped asset with a printable UUID label',async()=>{
      await open(a);const f=a.locator('#memory-asset-create');
      await f.locator('..').locator('summary').click();
      await f.locator('[name=code]').fill('UAT-'+issueBase);
      await f.locator('[name=name]').fill(labelName);
      await f.locator('button').click();
      const label=a.locator('#memory-label-preview');
      await label.getByText(labelName,{exact:true}).waitFor();
      token=await label.locator('bdi').innerText();assetId=await a.locator('#memory-asset').inputValue();
      assert.match(token,/^[a-f\d-]{36}$/);assert.notEqual(token,assetId);
    });
    await check('Independent decoder reads QR from actual DOM graphic; print action includes only selected label',async()=>{
      const qr=a.locator('#memory-label-preview svg');
      photo=await a.locator('#memory-label-preview').screenshot();
      const pixels=await qr.evaluate(async svg=>{
        const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
        const img=new Image();const uri=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
        try{img.src=uri;await img.decode();const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,256,256);return Array.from(ctx.getImageData(0,0,256,256).data);}
        finally{URL.revokeObjectURL(uri);}
      });
      assert.equal(jsQR(Uint8ClampedArray.from(pixels),256,256)?.data,token);
      await a.evaluate(()=>{window.print=()=>{};});
      await a.locator('#memory-print').click();
      await a.emulateMedia({media:'print'});
      assert(await a.locator('.asset-print-sheet .asset-tag svg').isVisible());
      assert.equal(await a.locator('#enterprise-app').isVisible(),false);
      if(options.pdfPath)await a.pdf({path:options.pdfPath,format:'A4',printBackground:true});
      await a.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
      await a.emulateMedia({media:'screen'});
      assert.equal(await a.locator('.asset-print-sheet').count(),0);
    });
    await check('Arabic operator enters documented building lift count using Arabic digits and source date',async()=>{
      const f=a.locator('#memory-fact-form');await f.locator('..').locator('summary').click();
      await f.locator('[name=kind]').selectOption('lifts');
      await f.locator('[name=text]').fill('٠٣');
      await f.locator('[name=source]').fill(source);
      await f.locator('[name=date]').fill(asOf);
      await f.locator('button').click();
      await a.locator('#memory-message bdi').waitFor();
      receipt=await a.locator('#memory-message bdi').innerText();
      assert.match(receipt,/^[a-f\d-]{36}$/);
      const li=a.locator('#memory-results li').filter({hasText:source});
      assert.match(await li.innerText(),/بانتظار الاعتماد/);
      assert.equal(await li.locator('p').textContent(),'3');
      assert.equal(await li.getByRole('button').count(),0);
    });
    await check('English approver recalls source and approves persisted observation',async()=>{
      await open(b);
      await b.locator('#memory-search').fill(source);
      await b.locator('#memory-recall button').click();
      const r=b.locator('#memory-results li').filter({hasText:source});
      await r.getByRole('button',{name:'Verify fact'}).click();
      await r.filter({hasText:'Verified on'}).waitFor();
      assert.equal(await r.locator('p').innerText(),'3');
    });
    await check('English operator input (reader/keyboard) resolves exactly the printed asset in this property',async()=>{
      await b.locator('#memory-token').fill(token);await b.locator('#memory-scan button').click();
      await b.locator('#memory-message').filter({hasText:'Matching asset'}).waitFor();
      assert.equal(await b.locator('#memory-asset').inputValue(),assetId);
      assert.equal(await b.locator('#memory-label-preview bdi').innerText(),token);
    });
    await check('Photo capture input decodes rendered label on device and scopes lookup to property',async()=>{
      await b.locator('#memory-asset').selectOption('');
      await b.locator('#memory-token').fill('');
      await b.locator('#memory-photo').setInputFiles({name:'synthetic-label.png',mimeType:'image/png',buffer:photo});
      await b.waitForFunction(id=>document.querySelector('#memory-asset').value===id,assetId);
      assert.equal(await b.locator('#memory-token').inputValue(),token);
      assert.equal(await b.locator('#memory-photo').getAttribute('capture'),'environment');
    });
    if(secondSiteId){
      await check('Same physical code at a different authorized property returns no record or printable label',async()=>{
        await b.locator('#memory-site').selectOption(secondSiteId);
        await b.locator('#memory-site-work').waitFor();
        await b.locator('#memory-token').fill(token);await b.locator('#memory-scan button').click();
        await b.locator('#memory-message').filter({hasText:'No matching label'}).waitFor();
        assert.equal(await b.locator('#memory-label-output').isVisible(),false);
      });
    }
    await check('Fresh Arabic session view recalls the verified record, date and persisted asset',async()=>{
      await a.reload();await open(a);
      await a.locator('#memory-search').fill(source);await a.locator('#memory-recall button').click();
      const r=a.locator('#memory-results li').filter({hasText:source});
      await r.filter({hasText:'متحقق'}).waitFor();
      assert.match(await r.innerText(),new RegExp(asOf));
      await a.locator('#memory-asset').selectOption(assetId);
      assert.equal(await a.locator('#memory-label-preview bdi').innerText(),token);
      assert(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(options.screenshotPath)await a.locator('#draqon-building-memory').screenshot({path:options.screenshotPath});
    });
    for(const [lang,page,question,action,jump] of [
      ['ar',a,'كم عدد المصاعد؟','استرجع من السجل','حقائق المبنى'],
      ['en',b,'How many lifts are there?','Look up in file','Building facts']
    ]){
      await check(lang+' desk returns verified building answer with source and opens correctly scoped register',async()=>{
        const desk=page.locator('#draqon-building-desk');
        if(!await desk.evaluate(el=>el.open))await desk.locator('summary').first().click();
        await desk.locator('#desk-site').selectOption(siteId);
        const ask=desk.locator('form').first();
        await ask.locator('input').fill(question);
        await ask.getByRole('button',{name:action}).click();
        const reply=desk.locator('li').filter({hasText:source});
        await reply.waitFor();assert.match(await reply.innerText(),/3/);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        if(lang==='ar' && options.desktopScreenshot){
          await page.setViewportSize({width:1360,height:910});
          await desk.screenshot({path:options.desktopScreenshot});
          await page.setViewportSize({width:390,height:844});
        }
        if(lang==='ar' && options.checkExport){
          const nextFile=page.waitForEvent('download',{timeout:15000});
          await desk.getByRole('button',{name:'تنزيل ملف الكشف'}).click();
          const download=await nextFile;
          assert.match(download.suggestedFilename(),/Osoul-Facility-.*[.]csv$/);
          const csv=await fs.readFile(await download.path(),'utf8');
          assert(csv.startsWith('\uFEFF') && csv.includes(source) && csv.includes(token) && csv.includes(assetId));
        }
        if(options.checkExport){
          const council=desk.locator('[data-facility-council]');
          await council.locator('summary').first().click();
          await council.getByText(lang==='ar'?'أعطال متكررة وشكاوى متزايدة':'Recurring faults and rising complaints',{exact:true}).waitFor();
          const market=council.locator('details').filter({has:council.page().getByText(lang==='ar'?'بحوث السوق والتجارة':'Market research and commerce',{exact:true})}).first();
          await market.locator('summary').first().click();
          assert.match(await market.innerText(),/52|٥٢/);
          await council.locator('summary').first().click();
        }
        await desk.getByRole('button',{name:jump,exact:true}).click();
        await page.waitForFunction(id=>document.querySelector('#draqon-building-memory').open&&document.querySelector('#memory-site').value===id,siteId);
      });
    }
    meta.result='pass';meta.receipt=receipt;meta.opaqueToken=token;meta.assetId=assetId;
  }finally{await fs.writeFile(file,JSON.stringify(meta,null,2)+'\n');}
}
module.exports={exerciseBuildingMemory};
