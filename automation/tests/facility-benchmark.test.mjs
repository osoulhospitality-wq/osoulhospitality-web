import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

test('facility purchase benchmarks use only approved, comparable, tenant-safe data', async t => {
  const db = new PGlite({extensions:{pgcrypto}});
  t.after(()=>db.close());
  const read = path => readFile(new URL('../../'+path,import.meta.url),'utf8');
  await db.exec('create role anon;create role authenticated;create role service_role;');
  await db.exec(await read('automation/e2e/dr/fixture.sql'));
  for(const file of ['20261125190000_bootstrap_enterprise_foundation.sql','20261125193000_add_facility_operations.sql',
    '20261126190000_draqon_field_handoff.sql','20261126212000_facility_benchmark.sql']){
    await db.exec(await read('supabase/migrations/'+file));
  }
  const [owner,second,viewer,curator,a,b,site,siteB,otherSite,toySupplier,toyProduct,toyQuote,toyLine]=Array.from({length:13},randomUUID);
  const query=(sql,params=[])=>db.query(sql,params);
  const cell=async(sql,params=[])=>Object.values((await query(sql,params)).rows[0])[0];
  async function login(user,aal='aal2'){
    await db.exec('reset role;set role authenticated;');
    await query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,aal})]);
  }
  await query('insert into auth.users(id) values($1),($2),($3),($4)',[owner,second,viewer,curator]);
  await query('insert into public.organizations(id,name,created_by) values($1,\'Synthetic A\',$2),($3,\'Synthetic B\',$4)',[a,owner,b,second]);
  await query("insert into public.organization_members(organization_id,user_id,full_name,role) values($1,$2,'Reader','viewer')",[a,viewer]);
  await query("insert into public.facilities(id,organization_id,name) values($1,$2,'Synthetic hotel A'),($3,$4,'Synthetic hotel B'),($5,$2,'Empty site')",[site,a,siteB,b,otherSite]);
  await query("insert into private.draqon_price_curators(user_id) values($1)",[curator]);
  await query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:owner,aal:'aal2'})]);
  await query("insert into public.suppliers(id,organization_id,name,created_by) values($1,$2,'Synthetic source',$3)",[toySupplier,a,owner]);
  await query("insert into public.products(id,organization_id,supplier_id,sku,name,pack_price,standard_qty,unit,created_by) values($1,$2,$3,'TOY','Test',12,500,'g',$4)",[toyProduct,a,toySupplier,owner]);
  await query("insert into public.quotes(id,organization_id,supplier_id,created_by) values($1,$2,$3,$4)",[toyQuote,a,toySupplier,owner]);
  await query("insert into public.quote_lines(id,organization_id,quote_id,product_id,description,quantity,pack_price,standard_qty,unit) values($1,$2,$3,$4,'Synthetic',10,12,500,'g')",[toyLine,a,toyQuote,toyProduct]);
  const base={item_key:'probe a',spec_key:'test grade',region:'test region',currency:'SAR',base_unit:'kg',min_qty:3,max_qty:10,valid_from:'2025-01-01',valid_until:'2025-12-31',delivered_net_unit_price:20,evidence_ref:'internal-synthetic-source'};
  const approve=(v=base)=>cell('select public.draqon_approve_price_reference($1)',[v]);
  const record=(v,org=a,facility=site)=>cell('select public.draqon_record_facility_purchase($1,$2,$3)',[org,facility,v]);
  const readSite=async(org=a,facility=site)=>(await query('select * from public.draqon_facility_price_benchmark($1,$2)',[org,facility])).rows;
  const synthetic=(extra={})=>({id:randomUUID(),invoice_ref:randomUUID(),invoice_line:'1',purchased_on:'2025-06-01',item_key:' PROBE   A ',spec_key:'TEST GRADE',region:'test region',currency:'sar',unit:'g',packs:10,units_per_pack:500,pack_price:11.5,vat_mode:'included',tax_pct:15,freight_net:10,discount_net:5,...extra});
  await login(owner);
  await t.test('tenant owner cannot curate or grant itself central authorization',async()=>{
    await assert.rejects(approve(),{code:'42501'});
    await assert.rejects(query('insert into private.draqon_price_curators(user_id) values($1)',[owner]),{code:'42501'});
  });
  const invoice=synthetic({quote_line_id:toyLine});
  await t.test('an invoice can reference an existing tenant-owned quote line; empty bank excludes it',async()=>{
    assert.equal(await record(invoice),invoice.id);
    assert.equal((await readSite())[0].reason,'no_approved_item');
  });
  await t.test('duplicate retry is stable; concurrent callers with changed identity or amount cannot overwrite',async()=>{
    assert.equal(await record(invoice),invoice.id);
    await assert.rejects(record({...invoice,pack_price:1}),{code:'23505'});
    await assert.rejects(record({...invoice,id:randomUUID()}),{code:'23505'});
  });
  await login(curator,'aal1');
  await t.test('curation requires MFA as well as allowlisted internal account',async()=>assert.rejects(approve(),{code:'42501'}));
  await login(curator);
  const first=await approve();const secondRef=await approve({...base,delivered_net_unit_price:22,evidence_ref:'private-source-B'});
  await t.test('repeat of a sanctioned reference does not bias the mean; conflicting ref is refused',async()=>{
    assert.equal(await approve(),first);
    await assert.rejects(approve({...base,delivered_net_unit_price:100}),{code:'23505'});
  });
  await login(owner);
  await t.test('catalog exposes shared item/spec alone; ordinary owner has no internal curator role',async()=>{
    const c=(await query('select * from public.draqon_price_catalog($1)',[a])).rows;
    assert.deepEqual(c,[{item_key:'probe a',spec_key:'test grade'}]);assert.equal(await cell('select public.draqon_is_price_curator()'),false);
  });
  await t.test('VAT-inclusive goods, net freight and discount normalize 500 g packs to comparable kilograms',async()=>{
    const row=(await readSite()).find(x=>x.purchase_id===invoice.id);
    assert.equal(row.reason,'comparable');
    assert.equal(Number(row.net_delivered_unit),21);
    assert.equal(Number(row.approved_unit),21);
    assert.equal(Number(row.difference_pct),0);
    assert.equal(row.reference_count,2);
    assert.deepEqual(Object.keys(row),['purchase_id','invoice_ref','invoice_line','purchased_on','item_key','spec_key','currency','base_unit','net_delivered_unit','approved_unit','difference_pct','reference_count','reason']);
  });
  for(const [name,extra,reason] of [
    ['unrecognized pack unit',{unit:'carton'},'unsupported_unit'],
    ['freight unknown',{freight_net:null},'unknown_commercial_basis'],['discount missing',{discount_net:null},'unknown_commercial_basis'],
    ['VAT basis unknown',{vat_mode:'unknown'},'unknown_commercial_basis'],['inclusive rate absent',{tax_pct:null},'unknown_commercial_basis'],
    ['negative effective line',{discount_net:200},'negative_net_amount'],['missing item',{item_key:'other'},'no_approved_item'],
    ['different spec',{spec_key:'another grade'},'specification_mismatch'],['different physical dimension',{unit:'ml'},'unit_mismatch'],
    ['currency not converted',{currency:'USD'},'currency_mismatch'],['different region',{region:'far'},'region_mismatch'],
    ['outside valid window',{purchased_on:'2024-06-01'},'date_mismatch'],['quantity tier too high',{packs:100},'quantity_mismatch'],
    ['quantity tier too low',{packs:2},'quantity_mismatch']
  ]){
    await t.test(name,async()=>{const row=synthetic(extra);await record(row);
      const x=(await readSite()).find(y=>y.purchase_id===row.id);assert.equal(x.reason,reason);assert.equal(x.approved_unit,null);assert.equal(x.difference_pct,null);assert.equal(x.reference_count,0);});
  }
  await t.test('tenant reference tables have no direct select privileges',async()=>assert.rejects(query('select evidence_ref from private.draqon_price_references'),{code:'42501'}));
  await t.test('facilities are separated within organization; cross-organization facility id is rejected',async()=>{
    assert.deepEqual(await readSite(a,otherSite),[]);
    await assert.rejects(readSite(a,siteB),{code:'42501'});
  });
  await login(second);
  await t.test('cross-organization quote reference and organization read rejected',async()=>{
    await assert.rejects(record(synthetic({quote_line_id:toyLine}),b,siteB),{code:'42501'});
    await assert.rejects(readSite(a,site),{code:'42501'});
    assert.deepEqual(await readSite(b,siteB),[]);
  });
  await t.test('released central prices survive a different tenant without revealing any vendor details',async()=>{
    const x=synthetic({vat_mode:'excluded',tax_pct:null,pack_price:12,freight_net:0,discount_net:0,unit:'kg',units_per_pack:1,packs:5});
    await record(x,b,siteB);const [matched]=await readSite(b,siteB);assert.equal(matched.reason,'comparable');assert.equal(Number(matched.net_delivered_unit),12);
    assert.equal(Number(matched.difference_pct),-42.86);assert.equal(JSON.stringify(matched).includes('internal-synthetic-source'),false);
  });
  await login(viewer);
  await t.test('member viewer can read own organization but cannot enter purchases',async()=>{
    assert.ok((await readSite()).length>0);await assert.rejects(record(synthetic()),{code:'42501'});
  });
  await login(owner,'aal1');
  await t.test('low assurance cannot read or submit',async()=>{await assert.rejects(readSite(),{code:'42501'});await assert.rejects(record(synthetic()),{code:'42501'});});
  await login(owner);
  await t.test('tenant cannot import prices through the bulk path',async()=>{
    await assert.rejects(query('select public.draqon_approve_price_batch($1)',[JSON.stringify([base])]),{code:'42501'});
  });
  await login(curator);
  await t.test('batch rolls back valid rows when another row is invalid and rejects oversized or empty files',async()=>{
    const distinct={...base,item_key:'isolated',evidence_ref:'batch-reference'};
    await assert.rejects(query('select public.draqon_approve_price_batch($1)',[JSON.stringify([distinct,{...distinct,evidence_ref:null}])]),{code:'23502'});
    await assert.rejects(query('select public.draqon_approve_price_batch($1)',[JSON.stringify([])]),{code:'22023'});
    await assert.rejects(query('select public.draqon_approve_price_batch($1)',[JSON.stringify(Array(201).fill(distinct))]),{code:'22023'});
    await login(owner);
    assert.equal((await query('select * from public.draqon_price_catalog($1)',[a])).rows.some(x=>x.item_key==='isolated'),false);
    await login(curator);
    assert.equal(await cell('select public.draqon_approve_price_batch($1)',[JSON.stringify([distinct])]),1);
    assert.equal(await cell('select public.draqon_approve_price_batch($1)',[JSON.stringify([distinct])]),1);
  });
  await login(curator);await query('select public.draqon_retire_price_reference($1)',[secondRef]);
  await login(owner);await t.test('retired reference immediately stops contributing to new calculations',async()=>{
    const x=(await readSite()).find(y=>y.purchase_id===invoice.id);assert.equal(Number(x.approved_unit),20);assert.equal(Number(x.difference_pct),5);assert.equal(x.reference_count,1);
  });
  assert.ok(first);
});


test('private CSV adapter requires verified, dated, shareable mapped sources; it suppresses supplier metadata',async()=>{
  const {execFileSync}=await import('node:child_process');
  const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const dir=await mkdtemp(join(tmpdir(),'draqon-benchmark-'));
  try {
    const csv=join(dir,'items.csv'),ops=join(dir,'approvals.json'),out=join(dir,'staged.json');
    const headers=['Price ID','SKU','الوصف/المواصفة','الوحدة','السعر قبل الضريبة','تاريخ السعر','صالح حتى','مصدر العرض','حالة التحقق','Vendor ID'];
    const rows=[['A','A-1','Type T','g','10','2025-01-01','2025-05-01','internal invoice','verified','private vendor'],
      ['D','DEMO','Type T','g','1','2025-01-01','2025-05-01','internal','verified','private vendor'],
      ['U','B-1','Type T','g','5','2025-01-01','2025-05-01','internal','pending','private vendor'],
      ['M','C-1','Type T','g','5','2025-01-01','2025-05-01','internal','verified','private vendor']];
    await writeFile(csv,['PRODUCT & PRICE MASTER',headers.join(','),...rows.map(r=>r.join(','))].join('\n'));
    await writeFile(ops,JSON.stringify({A:{approved_for_sharing:true,source_sku:'A-1',source_spec:'Type T',source_unit:'g',
      net_freight_per_pack:2,net_discount_per_pack:0,contents_per_pack:500,currency:'SAR',min_base_qty:0,max_base_qty:null,
      item_key:'standard test',spec_key:'test specification',region:'R',approval_ref:'private internal approval'}}));
    const script=new URL('../enterprise/benchmark-import.py',import.meta.url).pathname;
    const counts=JSON.parse(execFileSync('python3',[script,csv,ops],{encoding:'utf8'}));
    assert.deepEqual(counts,{count:4,accepted:1,excluded:{example_row:1,source_verification_missing:1,shareable_approval_missing:1}});
    execFileSync('python3',[script,csv,ops,'--stage',out]);
    const exported=await readFile(out,'utf8');const [row]=JSON.parse(exported);
    assert.equal(row.delivered_net_unit_price,'24.000000');assert.equal(row.base_unit,'kg');assert.equal(exported.includes('private vendor'),false);
    assert.equal(exported.includes('internal invoice'),false);
  } finally {await rm(dir,{recursive:true,force:true});}
});
