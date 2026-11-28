import test from "node:test";
import assert from "node:assert/strict";
import {reviewNight} from "../revenue/rate-review.mjs";
const target={asOf:"2026-11-28T20:00:00+03:00",property:"site",district:"district",serviceClass:"serviced-economy",unit:"one-bed",guests:2,cancellation:"flex-24h",meals:"room-only",checkIn:"2026-12-04",checkOut:"2026-12-05"};
const quote=(property,price)=>({...target,property,price,source:"https://example.test/"+property,currency:"SAR",publicRate:true,allIn:true,available:true,observedAt:target.asOf});
const sales={...target,source:"internal:aggregate",observedAt:target.asOf,sellable:10,booked:4};
const peers=[quote("a",275),quote("b",300),quote("c",350)];
const inputs={target,ownQuote:quote("site",310),peers,sales};
const history=Array.from({length:6},(_,i)=>({...sales,leadDays:6,bookedAtLead:2,finalSold:4,checkIn:new Date(Date.UTC(2026,10,27-i*7)).toISOString().slice(0,10)}));
test("unique like-for-like properties, quartiles, no forecast from weak history",()=>{
 const r=reviewNight({...inputs,peers:[...peers,peers[0],{...peers[0],property:" Ａ- "},{...peers[0],publicRate:false,property:"member"},{...peers[2],serviceClass:"luxury",property:"other-class"},{...peers[1],district:"other"},{...peers[2],allIn:false},quote("site",10)]});
 assert.deepEqual([r.peerProperties,r.suggestedLow,r.suggestedHigh,r.projectedSold],[3,287.5,325,null]);
});
test("missing, stale or differently dated quotes never produce a price recommendation",()=>{
 for(const q of [null,{...inputs.ownQuote,observedAt:"2026-11-27T00:00:00Z"},{...inputs.ownQuote,cancellation:"strict"},{...inputs.ownQuote,checkIn:"2026-12-03"}]) assert.equal(reviewNight({...inputs,ownQuote:q}).suggestedLow,null);
 assert.equal(reviewNight({...inputs,sales:null}).suggestedLow,null);
 assert.equal(reviewNight({...inputs,peers:peers.slice(0,2)}).suggestedLow,null);
});
test("in-scope booking pace and remaining pickup from mature histories",()=>{
 const r=reviewNight({...inputs,history});
 assert.equal(r.projectedSold,6);assert.equal(r.suggestedLow,300);
 assert.equal(reviewNight({...inputs,history:history.map(h=>({...h,leadDays:0}))}).projectedSold,null);
 assert.equal(reviewNight({...inputs,history:[...history,{...history[0],finalSold:6}]}).projectedSold,null);
 assert.equal(reviewNight({...inputs,sales:{...sales,booked:10},history}).suggestedLow,null);
 assert.equal(reviewNight({...inputs,history:history.map(h=>({...h,finalSold:0}))}).projectedSold,2);
});
test("stay validation and verified zero on-books survives",()=>{
 assert.throws(()=>reviewNight({...inputs,target:{...target,checkIn:"2026-11-01",checkOut:"2026-11-02"}}));
 assert.equal(reviewNight({...inputs,sales:{...sales,booked:0}}).onBooks,0);
});
