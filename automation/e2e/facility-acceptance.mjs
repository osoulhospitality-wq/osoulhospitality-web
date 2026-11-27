import { randomUUID } from "node:crypto";

// All clients are the two synthetic password- and MFA-authenticated users from
// real-auth.mjs. The parent driver refuses any Supabase origin except loopback.
export async function verifyFacilityDesk({ operator, approver, org, site, otherSite, asset, verify, checked }) {
  const scope={p_org:org,p_facility:site}, record=randomUUID(), plan=randomUUID();
  const rpc=(user,name,args={})=>user.client.rpc(name,{...scope,...args});
  const denial=async response=>(await response).error?.code || "allowed";
  const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const asof=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const save=(id,key,value)=>rpc(operator,"facility_memory_save",{p_id:id,p_asset:null,p_key:key,p_value:value,p_source:"Synthetic private survey, revision A",p_asof:asof});
  await verify("survey_save","coordinator records floor count in Arabic-Indic numerals from source",true,async()=>checked(await save(record,"floors_above","٣"))===record);
  await verify("survey_approve_denied","analyst cannot verify submitted observation","42501",()=>denial(rpc(operator,"facility_memory_verify",{p_id:record})));
  await verify("survey_verified_actor","approver verifies, operator retrieves canonical value and verifier",true,async()=>{
    checked(await rpc(approver,"facility_memory_verify",{p_id:record}));
    const row=checked(await operator.client.from("facility_memory_records").select("fact_value,verified_by,verified_at,source_ref").eq("id",record).single());
    return row.fact_value==="3" && row.verified_by===approver.id && Boolean(row.verified_at) && row.source_ref==="Synthetic private survey, revision A";
  });
  await verify("survey_confirm_building_sources","owner verifies separate area and lift sources before review",true,async()=>{
    for (const [key,value] of [["built_area_m2","1250"],["lifts","2"]]) {
      const id=randomUUID();
      if(checked(await save(id,key,value))!==id ||
        checked(await rpc(approver,"facility_memory_verify",{p_id:id}))!==id) return false;
    }
    return true;
  });
  let token;
  await verify("scan_private_asset","authorized operator scans token and resolves only the correct asset",true,async()=>{
    token=checked(await operator.client.from("facility_assets").select("scan_token").eq("organization_id",org).eq("id",asset).single()).scan_token;
    const rows=checked(await rpc(operator,"facility_asset_by_token",{p_token:token}));
    return rows.length===1 && rows[0].id===asset && rows[0].facility_id===site;
  });
  await verify("scan_wrong_site","same token, wrong facility",[],async()=>checked(await rpc(operator,"facility_asset_by_token",{p_facility:otherSite,p_token:token})));
  const schedule={p_id:plan,p_asset:asset,p_task:"Synthetic preventive check",p_count:2,p_unit:"weeks",p_first:asof,p_source:"Fixture equipment manual rev A section 3",p_source_date:asof};
  await verify("pm_approve","approver records sourced recurring plan",true,async()=>checked(await rpc(approver,"facility_pm_register",schedule))===plan);
  await verify("pm_receipt_replay","two operator requests return one open work order and one occurrence",true,async()=>{
    const issue=()=>rpc(operator,"facility_pm_issue",{p_plan:plan,p_due:asof});
    const [a,b]=await Promise.all([issue(),issue()]);
    const id=checked(a);
    const rows=checked(await operator.client.from("facility_pm_occurrences").select("work_order_id,issued_by,facility_work_orders(status)").eq("plan_id",plan));
    return checked(b)===id && rows.length===1 && rows[0].work_order_id===id && rows[0].issued_by===operator.id && rows[0].facility_work_orders?.status==="open";
  });
  let round;
  await verify("desk_open","coordinator opens facility review; replay returns same round",true,async()=>{
    const open=()=>rpc(operator,"facility_review_open",{p_target:tomorrow});
    round=checked(await open());return Boolean(round) && checked(await open())===round;
  });
  await verify("desk_brief","retrieves structured brief from authorized facility records",true,async()=>{
    const result=checked(await rpc(operator,"facility_review_brief"));
    return result?.facts?.floors_above?.value==="3" && result?.facts?.built_area_m2?.value==="1250" &&
      result?.facts?.lifts?.value==="2" && result.facts.floors_above.conflict===false &&
      result.facts.floors_above.id===record && result?.round?.id===round && result?.assets?.count===1 && result?.maintenance?.count===1;
  });
  const decide=(topic,state,follow=null)=>rpc(approver,"facility_review_decide",{p_round:round,p_topic:topic,p_state:state,
    p_note:state==="checked"?"Fixture source reviewed by approver":"Collect additional facility evidence",p_follow_up_on:follow});
  await verify("desk_blocks_pending_close","cannot close a round with unchecked topics","23514",()=>denial(rpc(approver,"facility_review_close",{p_round:round})));
  await verify("desk_evidence_checked","asset reviewed against current private asset record",true,async()=>{
    checked(await decide("building","checked"));
    checked(await decide("assets","checked"));
    const row=checked(await approver.client.from("facility_review_items").select("state,evidence_snapshot,recorded_by").eq("round_id",round).eq("topic","assets").single());
    return row.state==="checked" && row.recorded_by===approver.id && Boolean(row.evidence_snapshot);
  });
  await verify("desk_missing_date","follow-up without a due date is rejected","22023",()=>denial(decide("staff","follow_up")));
  await verify("desk_unverified_topic","staff topic cannot be marked checked without a verified headcount","23514",()=>denial(decide("staff","checked")));
  await verify("desk_follow_up_dates","record outstanding topics with a date, accountable reviewer and written note",true,async()=>{
    for (const topic of ["staff","maintenance","swot","prices"]) checked(await decide(topic,"follow_up",tomorrow));
    const rows=checked(await operator.client.from("facility_review_items").select("state,follow_up_on,decision_note,recorded_by").eq("round_id",round).eq("state","follow_up"));
    return rows.length===4 && rows.every(row=>row.follow_up_on===tomorrow && row.decision_note && row.recorded_by===approver.id);
  });
  await verify("desk_analyst_cannot_close","coordinator requests closure","42501",()=>denial(rpc(operator,"facility_review_close",{p_round:round})));
  await verify("desk_close_with_gaps","approver closes the review while preserving follow-up gaps and identity",true,async()=>{
    const outcome=checked(await rpc(approver,"facility_review_close",{p_round:round}));
    const row=checked(await operator.client.from("facility_review_rounds").select("outcome,closed_by,closed_at").eq("id",round).single());
    const brief=checked(await rpc(operator,"facility_review_brief"));
    const outstanding=checked(await rpc(operator,"facility_review_followups"));
    const gaps=brief.lastRound?.items.filter(i=>i.state==="follow_up" && i.followUpOn===tomorrow);
    return outcome==="follow_up_required" && row.outcome===outcome && row.closed_by===approver.id && Boolean(row.closed_at)
      && brief.round===null && brief.lastRound?.id===round && gaps?.length===4 && outstanding.length===4
      && outstanding.every(i=>i.round_id===round && i.due_on===tomorrow && i.note);
  });
}
