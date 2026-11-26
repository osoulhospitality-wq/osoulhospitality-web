import {randomUUID} from "node:crypto";
import {buildCouncilStudy,buildCouncilDecisions} from "../../command-center/enterprise/src/facility-council.mjs";

// Called only after real-auth.mjs has checked the loopback address and verified two synthetic users with MFA.
export async function verifyCouncil({operator,approver,org,site,otherSite,verify,checked}){
  const asOf=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const end=new Date(asOf+"T00:00:00Z");
  const months=Array.from({length:12},(_,i)=>new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()-12+i,1)).toISOString().slice(0,10));
  const call=(user,name,args={})=>user.client.rpc(name,{p_org:org,p_facility:site,...args});
  const observation=(metric,month,value)=>({p_id:randomUUID(),p_metric:metric,p_month:month,p_value:value,p_source:"Synthetic council closing statement "+month,p_retrieved:asOf});
  await verify("council_attestation_requires_authority","analyst submits a signed monthly reading","42501",async()=>(await call(operator,"facility_council_record",observation("cash_balance_sar",months.at(-1),0))).error?.code??"allowed");
  await verify("council_closed_month_series","owner verifies a complete synthetic occupancy series and two periods of faults and complaints",true,async()=>{
    for(const [i,m] of months.entries())checked(await call(approver,"facility_council_record",observation("occupancy_pct",m,40+i)));
    for(const [i,m] of months.slice(-2).entries()){
      checked(await call(approver,"facility_council_record",observation("repeat_faults",m,2+i)));
      checked(await call(approver,"facility_council_record",observation("guest_complaints",m,4+i)));
    }return true;
  });
  await verify("council_study_actual_api","analyst reads the signed property ledger and builds a cross-disciplinary study",true,async()=>{
    const history=checked(await call(operator,"facility_council_history"));
    const cards=buildCouncilStudy({history,asOf}),memos=buildCouncilDecisions({history,asOf});
    const c=cards.find(x=>x.id==="occupancy_pct");
    return c.outlook.status==="forecast" && c.outlook.estimate===52 && c.outlook.mae===0 && c.outlook.baselineMae===1 &&
      cards.length===14 && memos.length===1 && memos[0].evidence.length===4;
  });
  await verify("council_foreign_read","other tenant building history stays private","42501",async()=>(await call(operator,"facility_council_history",{p_facility:otherSite})).error?.code??"allowed");
}
