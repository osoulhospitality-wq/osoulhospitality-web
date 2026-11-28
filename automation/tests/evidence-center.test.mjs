import test from "node:test";
import assert from "node:assert/strict";
globalThis.document={documentElement:{lang:"en-SA"}};
const {expiryDistance, feedbackSummary, interpretQuestion, loadAcceptedPage} = await import("../../command-center/enterprise/src/evidence-center.js");

test("licence countdown accepts explicit Gregorian ISO dates only",()=>{
  assert.equal(expiryDistance("٢٠٢٦-١١-٢٨","2026-11-28"),0);
  assert.equal(expiryDistance("2026-11-27","2026-11-28"),-1);
  assert.equal(expiryDistance("2028-02-29","2028-02-28"),1);
  for (const d of ["tomorrow",null,"31/12/2026","2026-02-30","2026-13-02"]) assert.equal(expiryDistance(d,"2026-11-28"),null);
});
test("evidence search supports Arabic and English while declining unsupported forecasts and revenue claims",()=>{
  for(const [question,topic] of [
    ["ما حالة التراخيص؟","compliance"],["Root causes?","asset"],["هل توجد حوادث؟","safety"],["guest complaints?","feedback"],
    ["كيف جودة المورد؟","vendor"],["توقع تعطل المعدات",null],["حساب استهلاك الكهرباء",null],["What is profit at risk?",null],
    ["How is my Airbnb rating?",null],["ما أسعار المورد؟",null],["",null]
  ]) assert.equal(interpretQuestion(question),topic,question);
});
test("complaint sample counts topics at most once per record, admits overlapping themes, protects unknown versions",()=>{
  const feedback=feedbackSummary([
    {code:"F22",template_version:1,answers:{C11:"HVAC failure with water leak, HVAC noise",C15:"yes"}},
    {code:"F22",template_version:1,answers:{C11:"مياه",C15:"بانتظار تأكيد"}},
    {code:"F23",template_version:1,answers:{C11:"HVAC failure",C15:"نعم"}},
    {code:"F22",template_version:2,answers:{C11:"HVAC",C15:"yes"}}
  ]);
  assert.equal(feedback.complaints,2);assert.equal(feedback.confirmed,1);
  assert.deepEqual(Object.fromEntries(feedback.leading.map(row=>[row.en,row.count])),{"Water and plumbing":2,"HVAC":1,"Noise":1});
});
test("reads accepted, submitted evidence from the authorized organization and site, with deterministic pages",async()=>{
  const calls=[];
  const q={then(resolve){return Promise.resolve({data:[],count:0}).then(resolve)}};
  for(const key of ["select","eq","in","order","range"])q[key]=(...args)=>{calls.push([key,...args]);return q};
  const client={from(name){assert.equal(name,"field_form_records");return q}};
  assert.deepEqual(await loadAcceptedPage(client,"org","site","compliance",2),{data:[],count:0});
  for (const args of [["eq","status","submitted"],["eq","organization_id","org"],["eq","facility_id","site"],
    ["eq","field_form_reviews.decision","accepted"],["in","code",["F26"]],["range",20,29]])
    assert.ok(calls.some(call=>JSON.stringify(call)===JSON.stringify(args)));
  assert.match(calls[0][1],/field_form_reviews_record_id_fkey!inner/);
  assert.deepEqual(await loadAcceptedPage(null,"","site","owner"),{error:true});
  assert.deepEqual(await loadAcceptedPage(null,"org","site","__proto__"),{error:true});
});
