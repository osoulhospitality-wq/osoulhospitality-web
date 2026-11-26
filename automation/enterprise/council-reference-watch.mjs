// Public publisher documents only. Never pass a facility, private document, cookie or API key.
import {appendFile,readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {references,referenceReviewDate} from "../../command-center/enterprise/src/facility-council.mjs";

const registry=JSON.parse(await readFile(new URL("../../docs/draqon/council-sources.json",import.meta.url),"utf8"));
const entries=new Map(registry.map(r=>[r.url,{publisher:r.publisher,reviewed:r.verified_on}]));
for(const ref of Object.values(references))if(!entries.has(ref.url))entries.set(ref.url,{publisher:ref.title,reviewed:referenceReviewDate});
const destination=process.argv[2];if(!destination)throw Error("Supply the output JSON path");
async function inspect(url,ref){
  const start=new URL(url),stamp=new Date().toISOString();
  const record={url,publisher:ref.publisher,contentReviewedOn:ref.reviewed,checkedAt:stamp};
  try{
    let current=start;
    for(let hop=0;hop<4;hop++){
      const response=await fetch(current,{redirect:"manual",signal:AbortSignal.timeout(12000),credentials:"omit",headers:{"User-Agent":"Osoul-public-reference-check/1.0"}});
      if(response.status>=300 && response.status<400){
        const location=response.headers.get("location");await response.body?.cancel();
        if(!location)return {...record,status:"review_redirect"};
        const next=new URL(location,current);
        if(next.protocol!=="https:"||next.hostname!==start.hostname||next.username||next.password||next.port)return {...record,status:"review_redirect"};
        current=next;continue;
      }
      const result={...record,http:response.status,lastModified:response.headers.get("last-modified")};
      if(!response.ok||!response.body){await response.body?.cancel();return {...result,status:"unavailable"};}
      // Digest a bounded sample; changed content prompts a person to revisit the published claim.
      const reader=response.body.getReader(),hash=createHash("sha256");let total=0;
      try{
        while(total<65536){const {done,value}=await reader.read();if(done)break;const part=value.subarray(0,65536-total);hash.update(part);total+=part.length;}
      }finally{await reader.cancel();}
      return {...result,status:total?"retrieved":"empty",sampleBytes:total,sampleSHA256:hash.digest("hex")};
    }
    return {...record,status:"review_redirect"};
  }catch{return {...record,status:"unavailable"};}
}
const results=[];
const list=[...entries];
for(let i=0;i<list.length;i+=4){
  results.push(...await Promise.all(list.slice(i,i+4).map(([url,ref])=>inspect(url,ref))));
}
const retrieved = results.filter(row => row.status === "retrieved").length;
const overview = {
  status: retrieved === results.length && retrieved > 0 ? "retrieved_all" : "requires_review",
  checked: results.length, retrieved, requiresReview: results.length - retrieved
};
await writeFile(destination, JSON.stringify({
  scope: "public reference accessibility; claim applicability requires human review", overview, results
}, null, 2));
console.log("Publisher endpoints checked:", overview.checked, "retrieved:", retrieved);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `Public reference retrieval: ${retrieved}/${overview.checked}. Endpoints requiring review: ${overview.requiresReview}.\n`);
}
if (process.env.GITHUB_ACTIONS === "true" && overview.status === "requires_review") {
  console.log("::warning title=Public reference availability::See the source-status artifact for endpoints awaiting review.");
}
