import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.document={documentElement:{lang:'en'}};
const {validateEvidenceFile,maxEvidenceBytes}=await import('../../command-center/enterprise/src/provider-evidence.js');
const file=(mime,bytes)=>new Blob([Uint8Array.from(bytes)],{type:mime});
test('allows signed JPEG PNG and PDF formats within the upload limit',async()=>{
  for(const [mime,bytes] of [['image/jpeg',[255,216,255,1]],['image/png',[137,80,78,71,13,10,26,10]],['application/pdf',[37,80,68,70,45,49]]])assert.equal(await validateEvidenceFile(file(mime,bytes)),true);
});
test('blocks empty, oversized, mismatched, unsupported and truncated local evidence',async()=>{
  for(const value of [undefined,file('image/jpeg',[]),file('image/png',[137,80]),file('application/pdf',[1,2,3,4,5]),file('text/html',[37,80,68,70,45]),{size:maxEvidenceBytes+1,type:'image/jpeg'}])assert.equal(await validateEvidenceFile(value),false);
});
