import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, test } from 'node:test';
import { performance } from 'node:perf_hooks';

const candidate = JSON.parse(fs.readFileSync(new URL('../n8n/dragon-intake-production.workflow.json', import.meta.url)));
const nodes = new Map(candidate.nodes.map(node => [node.name, node]));
const run = (name, input, request = '') => new Function('$json', '$execution', '$', nodes.get(name).parameters.jsCode)(
  input, { id: 'fixture-1' }, () => ({ item: { json: { body: request } } })
)[0].json;
const record = [];
function scenario(id, input, expected, observe) {
  test(id, () => {
    const started = performance.now();
    let actual;
    try {
      actual = observe();
    } catch (error) {
      actual = error.message;
    }
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    record.push({ id, input, expected, actual, duration_ms: performance.now() - started,
      external_model_cost_usd: 0, cost_basis: 'local synthetic fixture; infrastructure unallocated',
      evidence: 'automation/tests/dragon-candidate.cases.mjs#' + id,
      status: pass ? 'pass' : 'fail', corrective_action: pass ? null : 'Inspect the candidate node and fixture before promotion.' });
    assert.deepEqual(actual, expected);
  });
}
const sentence = 'تم استلام طلب التحقق.';
const englishRequest = 'Reply with one short sentence confirming receipt.';
const historic = JSON.parse(fs.readFileSync(new URL('./fixtures/draqon-historical-qa.json', import.meta.url)));
const handoverRequest = historic.qa79;
const bullets = '- تبريد الردهة ضعيف، والزيارة معلقة.\n- اكتمل تنظيف المدخل وفحصه.\n- تنتظر القطعة موافقة مدير المرافق.';
const draft = (output, request) => run('Normalize Delivery', { output }, request).delivery;
scenario('WF-01 short Arabic acknowledgement', [sentence, englishRequest], 'تم استلام الطلب.', () => draft(sentence, englishRequest));
scenario('WF-02 rejects multi-section acknowledgement', 'two sections', 'DRAQON_EXPECTED_ONE_SHORT_SENTENCE',
  () => draft('تم استلام الطلب.\nالتوصية: مراجعة.', englishRequest));
scenario('WF-03 rejects two sentences on one line', 'two statements', 'DRAQON_EXPECTED_ONE_SHORT_SENTENCE',
  () => draft('Received. We will contact the owner.', englishRequest));
const grounded = '- تبريد الردهة ضعيف وزيارة الفني معلقة. تابع تحديد موعد الزيارة.\n- اكتمل تنظيف المدخل وفحصه.\n- قطعة الغيار بانتظار موافقة مدير المرافق. تابع قرار الموافقة.';
scenario('WF-04 three handover bullets', 'HVAC, cleaning, approval', grounded, () => draft(bullets, handoverRequest));
scenario('WF-05 rejects missing bullet', 'two bullet lines', 'DRAQON_EXPECTED_THREE_SHORT_BULLETS',
  () => draft('- الأولى\n- الثانية', handoverRequest));
scenario('WF-06 rejects extra heading', 'heading followed by 3 bullets', 'DRAQON_EXPECTED_THREE_SHORT_BULLETS',
  () => draft('Executive outcome\n'+bullets, handoverRequest));
scenario('WF-07 Arabic format request', 'ثلاث نقاط', bullets, () => draft(bullets, 'اكتب ثلاث نقاط بالعربية'));
scenario('WF-08 open-format draft preserved', 'two paragraphs', 'فقرة أولى.\n\nفقرة ثانية.', () => draft('فقرة أولى.\n\nفقرة ثانية.', 'حلل الخيارات.'));
scenario('WF-09 reject blank model reply', 'blank string', true, () => {
  try { draft('  ','إيجاز'); } catch (e) {return e.message.startsWith('EMPTY_DRAGON_DELIVERY');} return false;
});
scenario('WF-10 prevent oversized delivery', '12001 letters', 'DRAQON_DRAFT_TOO_LARGE', () => draft('a'.repeat(12001), 'draft an explanation'));
scenario('WF-11 recovered acquisition after lost response', [{execution_id:'fixture-1',status:'processing'}], true,
  () => run('Verify lock ownership',{body:[{execution_id:'fixture-1',status:'processing'}]}).owned);
scenario('WF-12 duplicate cannot own another execution', [{execution_id:'fixture-2',status:'processing'}], false,
  () => run('Verify lock ownership',{body:[{execution_id:'fixture-2',status:'processing'}]}).owned);
scenario('WF-13 terminal lock cannot restart', [{execution_id:'fixture-1',status:'completed'}], false,
  () => run('Verify lock ownership',{body:[{execution_id:'fixture-1',status:'completed'}]}).owned);
scenario('WF-14 unknown lock never treated as duplicate', [], 'DRAQON_LOCK_LOOKUP_INDETERMINATE',
  () => run('Verify lock ownership',{body:[]}).owned);
for (const state of ['completed','failed']) {
  const row = {execution_id:'fixture-1',status:state,finished_at:'2026-11-26T09:00:00Z'};
  const node = 'Verify terminal row: ' + state;
  scenario('WF-15-'+state+' confirmed transition',row,state,()=>run(node,{body:[row]}).status);
  for (const [key,value] of [['execution_id','other'],['finished_at',null],['status','processing']]) {
    scenario('WF-16-'+state+'-'+key,{changed:key,value},'DRAQON_TERMINAL_WRITE_UNCONFIRMED',
      ()=>run(node,{body:[{...row,[key]:value}]}).status);
  }
  scenario('WF-17-'+state+' no affected row',[],'DRAQON_TERMINAL_WRITE_UNCONFIRMED',()=>run(node,{body:[]}).status);
}
after(() => {
  if (process.env.DRAQON_WORKFLOW_TEST_REPORT) fs.writeFileSync(process.env.DRAQON_WORKFLOW_TEST_REPORT, JSON.stringify(record,null,2)+'\n');
});

// Historical QA materials are synthetic. Recompute outcomes from independent explicit fixtures.
scenario('WF-18 archived single-sentence reply rejected', 'QA 73', 'DRAQON_EXPECTED_ONE_SHORT_SENTENCE',
  () => draft(historic.archive73, historic.qa73));
scenario('WF-19 archived multi-section handover rejected', 'QA 79', 'DRAQON_EXPECTED_THREE_SHORT_BULLETS',
  () => draft(historic.archive79, historic.qa79));
scenario('WF-20 supplied source wins over unsupported inventory or invented work', 'QA 79', grounded,
  () => draft('- التبريد ممتاز.\n- تم تبديل المحرك.\n- القطعة متوفرة في المستودع.', historic.qa79));
scenario('WF-21 unfamiliar translation is held', 'unsupported English observation', 'DRAQON_HANDOVER_SOURCE_REVIEW_REQUIRED',
  () => draft(bullets, historic.qa79.replace('entrance cleaning was finished and inspected','a pump was submerged')));
scenario('WF-22 conflicting appended fact is held', 'conflicting tail', 'DRAQON_HANDOVER_SOURCE_REVIEW_REQUIRED',
  () => draft(bullets, historic.qa79 + ' The part was later approved.'));
scenario('WF-23 one line Arabic acknowledgement', 'طلب عربي', 'تم استلام الطلب.',
  () => draft('نُفّذ العمل كاملًا.', 'أكد استلام الطلب في سطر واحد.'));
scenario('WF-24 original direct-language facts are usable', 'other Arabic assets',
 '- ضغط المضخة منخفض.\n- مستوى الخزان طبيعي.\n- باب المخزن مغلق.', () => draft(bullets,
 'تسليم الوردية في ثلاث نقاط وفق الوقائع التالية فقط: (١) ضغط المضخة منخفض؛ (٢) مستوى الخزان طبيعي؛ (٣) باب المخزن مغلق.'));
