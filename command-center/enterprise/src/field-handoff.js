import { uiText } from "./locale.js";

export function setupFieldHandoff(client) {
  const panel = document.getElementById("draqon-field-handoff");
  const organization = document.getElementById("organization-select");
  const form = document.getElementById("draqon-field-form");
  const queue = document.getElementById("draqon-field-queue");
  const status = document.getElementById("draqon-field-status");
  const asset = form.elements.asset;
  const submitButton = form.querySelector("button");
  let generation = 0;
  let scope = 0;
  let identity = null;
  let pending = null;
  let submissionId = null;
  const say = (ar, en) => { status.textContent = uiText(ar, en); };

  function reset() {
    scope++;
    generation++;
    panel.open = false;
    queue.replaceChildren();
    form.reset();
    asset.replaceChildren();
    pending = null;
    submitButton.disabled = false;
    submissionId = null;
    status.textContent = "";
  }

  function inScope(version, org) {
    return scope === version && organization.value === org && panel.open;
  }

  async function refresh() {
    if (!panel.open || !organization.value) return;
    const org = organization.value;
    const version = scope;
    const active = ++generation;
    const current = () => active === generation && inScope(version, org);
    try {
      const [assets, proposals, members, user] = await Promise.all([
        client.from("facility_assets").select("id,asset_code,name").eq("organization_id", org).order("asset_code").order("id").limit(100),
        client.from("draqon_field_proposals").select("id,github_issue,summary,submitted_by,assigned_to,work_order_id,facility_work_orders(status),draqon_field_events(event_type,actor_id,recorded_at)").eq("organization_id", org).order("created_at", {ascending:false}).order("id").limit(100),
        client.from("organization_members").select("user_id,full_name,role").eq("organization_id", org).eq("active", true),
        client.auth.getUser()
      ]);
      if (!current()) return;
      if (assets.error || proposals.error || members.error || user.error || !user.data.user) throw new Error("Load failed");
      const before = asset.value;
      asset.replaceChildren(new Option(uiText("اختر الأصل","Select an asset"),""), ...assets.data.map(a=>new Option(a.asset_code+" · "+a.name,a.id)));
      if (assets.data.some(a=>a.id===before)) asset.value=before;
      const team = members.data.filter(m => ["owner","approver","analyst"].includes(m.role));
      const uid = user.data.user.id;
      const approver = team.some(m=>m.user_id===uid && ["owner","approver"].includes(m.role));
      function isolatedText(value, direction) {
        const span = document.createElement("bdi");
        span.dir = direction;
        span.textContent = value;
        return span;
      }
      function memberLabel(id) {
        const name = members.data.find(m=>m.user_id===id)?.full_name;
        return isolatedText(name || id, name ? "auto" : "ltr");
      }
      queue.replaceChildren(...proposals.data.map(row => {
        const item = document.createElement("li");
        const states={open:uiText("أمر مفتوح","Order open"),in_progress:uiText("قيد التنفيذ","Work in progress"),completed:uiText("إغلاق ميداني معتمد","Field closure approved")};
        item.textContent=(row.github_issue ? "#"+row.github_issue+" · " : "")+row.summary+" — "+(row.work_order_id ? states[row.facility_work_orders?.status] || uiText("صدر أمر عمل","Order issued") : uiText("ينتظر الاعتماد","Awaiting approval"));
        if (row.work_order_id) {
          const evidence=document.createElement("p");
          evidence.append(uiText("مرجع أمر العمل","Work order reference")+" ", isolatedText(row.work_order_id,"ltr"), " · "+uiText("منسق الأمر","Order coordinator")+" ", memberLabel(row.assigned_to));
          item.append(evidence);
          const labels={started:uiText("بدأ التنفيذ","Started by"), visit_recorded:uiText("سجل الزيارة","Visit recorded by"), closed:uiText("اعتمد الإغلاق","Closure approved by")};
          const events=(row.draqon_field_events || []).filter(e=>Object.hasOwn(labels,e.event_type));
          for (const event of events.sort((a,b)=>a.recorded_at.localeCompare(b.recorded_at))) {
            const line=document.createElement("p");
            line.append(labels[event.event_type]+" · ", memberLabel(event.actor_id), " · "+new Date(event.recorded_at).toLocaleString(document.documentElement.lang || undefined,{timeZone:"Asia/Riyadh",timeZoneName:"short"}));
            item.append(line);
          }
        } else if (approver && row.submitted_by!==uid) {
          const label=document.createElement("label");
          label.textContent=uiText("منسق أمر العمل","Work order coordinator");
          const select=document.createElement("select");
          select.add(new Option(uiText("اختر المنسق","Choose coordinator"),""));
          for(const m of team) select.add(new Option(m.full_name,m.user_id));
          label.append(select);
          const button=document.createElement("button");
          button.type="button";
          button.textContent=uiText("اعتماد وإصدار أمر عمل","Approve and issue work order");
          button.addEventListener("click",async()=>{
            if(!current() || !select.value) return;
            button.disabled=true;
            try {
              const res=await client.rpc("draqon_approve_field",{p_org:org,p_id:row.id,p_assignee:select.value});
              if(!current()) return;
              if(res.error) say("تعذر الإصدار. تحقق من تفعيل التجربة والصلاحية والمنسق المختار.","Order not issued. Check pilot status, permission and coordinator.");
              else {say("صدر أمر العمل.","Work order issued.");await refresh();}
            } catch {
              if(current()) say("تعذر تأكيد الإصدار. أعد تحميل السجل قبل إعادة المحاولة بنفس المنسق.","Issuance is unconfirmed. Reload the queue before retrying with the same coordinator.");
            } finally {button.disabled=false;}
          });
          item.append(label,button);
        }
        return item;
      }));
    } catch {
      if(!current()) return;
      queue.replaceChildren();
      asset.replaceChildren();
      say("تعذر تحميل سجل التحويل. أعد فتح القسم بعد التحقق من الاتصال وتفعيل الخدمة.","Field handoff could not load. Check connectivity and provisioning, then reopen.");
    }
  }
  panel.addEventListener("toggle",()=>{if(panel.open) void refresh(); else generation++;});
  organization.addEventListener("change",reset);
  client.auth.onAuthStateChange((event,session)=>{
    const next = session?.user?.id ?? null;
    if (event==="SIGNED_OUT" || next!==identity) reset();
    identity=next;
  });
  form.addEventListener("input",()=>{submissionId=null;});
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const org=organization.value, version=scope;
    if(!org || !panel.open || pending) return;
    submissionId ??= crypto.randomUUID();
    const attempt={id:submissionId};
    pending=attempt;
    submitButton.disabled=true;
    try {
      const result=await client.rpc("draqon_prepare_field",{p_org:org,p_id:attempt.id,p_asset:asset.value,p_summary:form.elements.summary.value.trim(),p_issue:Number(form.elements.issue.value)});
      if(!inScope(version,org)) return;
      if(result.error) say("تعذر تسجيل المسودة. تحقق من مرجع الطلب والأصل والصلاحيات.","Draft was not registered. Check the request reference, asset and permission.");
      else {
        if(submissionId===attempt.id){form.reset();submissionId=null;}
        say("سُجلت المسودة بانتظار اعتماد شخص آخر.","Draft recorded for a second person to approve.");
        await refresh();
      }
    } catch {
      if(inScope(version,org)) say("تعذر تأكيد الاستلام، أعد المحاولة بنفس البيانات.","Receipt is unconfirmed. Retry with the same details.");
    } finally {
      if(pending===attempt){pending=null;submitButton.disabled=false;}
    }
  });
}
