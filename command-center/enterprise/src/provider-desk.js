import { mountProviderEvidence } from "./provider-evidence.js";
import { uiText as t } from "./locale.js";

const kinds = {
  visit_report:t("تقرير زيارة","Visit report"), material_request:t("طلب مواد","Material request"),
  quotation:t("عرض سعر","Quotation"), invoice:t("تقديم فاتورة","Invoice submission"),
  corrective_action:t("إجراء تصحيحي","Corrective action")
};
const states = {accepted:t("مقبول","Accepted"),returned:t("معاد للتصحيح","Returned")};
const node = (tag, text) => {
  const el=document.createElement(tag);
  if(text!=null) el.textContent=text;
  return el;
};
function button(text, fn) {
  const el=node("button",text); el.type="button"; el.addEventListener("click",fn); return el;
}
function label(caption,input) { const el=node("label",caption); el.append(input);return el; }

async function page(client, fn, args, offset) {
  const {data,error}=await client.rpc(fn,{...args,p_offset:offset});
  if(error || !Array.isArray(data)) throw new Error("unavailable");
  return data;
}
const failed=()=>t("تعذرت القراءة. تحقق من اتصالك وصلاحياتك ثم أعد المحاولة.","Read failed. Check your connection and access, then retry.");
const registerStatus=()=>{const status=node("p");status.setAttribute("role","status");return status;};

export function setupProviderDesk(client) {
  const body=document.querySelector("#provider-body");
  const manager=document.querySelector("#provider-reviews");
  let generation=0,reviewGeneration=0,organization="";
  let contractVersion=0;
  function inbox(container,args,isCurrent,review=false) {
    const list=node("ul"),status=registerStatus(),nav=node("div");
    let offset=0,loading=false;
    async function refresh(next=0) {
      if(loading||!isCurrent()) return;
      loading=true;nav.replaceChildren();
      try {
        const rows=await page(client,"fm_submission_inbox",args,next);
        if(!isCurrent())return;
        list.replaceChildren();offset=next;
        for(const row of rows) {
          const item=node("li"),summary=node("details");
          summary.append(node("summary",[row.contract_name,kinds[row.kind]||row.kind,row.reference,states[row.decision]||t("قيد المراجعة","In review")].join(" · ")),node("p",row.details));
          const time=node("time",row.created_at);time.dateTime=row.created_at;summary.append(time);
          if(row.review_note)summary.append(node("p",row.review_note));
          const evidence=mountProviderEvidence(client,summary,row.submission_id,isCurrent);
          if(review&&!row.decision) {
            const form=node("form"),note=node("textarea"),decision=node("select");
            note.required=true;note.minLength=2;note.maxLength=1000;
            for(const [key,value] of Object.entries(states))decision.add(new Option(value,key));
            const save=node("button",t("تسجيل قرار المراجعة","Record review"));save.type="submit";
            const msg=registerStatus();
            form.append(label(t("القرار","Decision"),decision),label(t("سبب القرار","Reason"),note),save,msg);
            form.onsubmit=async event=>{
              event.preventDefault();if(!isCurrent()||save.disabled)return;save.disabled=true;
              try {
                const count=evidence.reviewCount();
                if(count===null){msg.textContent=t("افتح قائمة المرفقات وحدّثها قبل تسجيل القرار.","Open and refresh the attachments before recording your decision.");return;}
                const {error}=await client.rpc("fm_review_submission_with_evidence",{p_id:row.submission_id,p_decision:decision.value,p_note:note.value.trim(),p_seen:count});
                if(error)throw error;
                if(isCurrent())await refresh(offset);
              }catch{msg.textContent=t("تعذر تسجيل القرار. حدّث السجل للتحقق من حالته.","Review could not be confirmed. Refresh to check the record.");}finally{save.disabled=false;}
            };summary.append(form);
          }
          item.append(summary);list.append(item);
        }
        status.textContent=rows.length?"":t("لا تظهر مراسلات في هذه الصفحة.","No submissions visible on this page.");
        if(offset)nav.append(button(t("السابق","Previous"),()=>refresh(Math.max(0,offset-50))));
        if(rows.length===50)nav.append(button(t("التالي","Next"),()=>refresh(offset+50)));
      }catch{if(isCurrent()){list.replaceChildren();status.textContent=failed();}}
      finally{loading=false;if(isCurrent())nav.append(button(t("تحديث السجل","Refresh records"),()=>refresh(offset)));}
    }
    container.replaceChildren(status,list,nav);void refresh();
  }

  function openContract(container,contract,current) {
    const title=node("h3",contract.name), select=node("select"), reference=node("input"), details=node("textarea");
    for(const [k,v] of Object.entries(kinds))select.add(new Option(v,k));
    reference.required=true;reference.minLength=2;reference.maxLength=160;details.required=true;details.minLength=2;details.maxLength=4000;
    const form=node("form"),send=node("button",t("إرسال للمراجعة","Submit for review")),status=registerStatus(),records=node("div");
    send.type="submit";let requestKey=null,lastPayload="";
    form.append(label(t("نوع المعاملة","Submission type"),select),label(t("رقم التقرير أو مرجع المستند","Report or document reference"),reference),label(t("تفاصيل التنفيذ أو الطلب","Work or request details"),details),send,status);
    form.onsubmit=async event=>{
      event.preventDefault();if(!current()||send.disabled)return;
      const payload={p_contract:contract.contract_id,p_kind:select.value,p_reference:reference.value.trim(),p_details:details.value.trim()};
      const serialized=JSON.stringify(payload);
      if(lastPayload!==serialized||!requestKey){lastPayload=serialized;requestKey=crypto.randomUUID();}
      send.disabled=true;
      try{
        const {error}=await client.rpc("fm_provider_submit",{...payload,p_key:requestKey});
        if(error)throw error;
        if(!current())return;
        requestKey=null;lastPayload="";form.reset();status.textContent=t("سُجلت المعاملة للمراجعة.","Submission recorded for review.");
        inbox(records,{p_contract:contract.contract_id},current);
      }catch{if(current())status.textContent=t("تعذر تأكيد الاستلام. يمكنك إعادة المحاولة بنفس التفاصيل.","Receipt could not be confirmed. Retry using the same details.");}finally{send.disabled=false;}
    };
    container.replaceChildren(title,node("p",[contract.building,contract.status,contract.ends_on].filter(Boolean).join(" · ")),form,node("h3",t("سجل المراسلات","Submission history")),records);
    inbox(records,{p_contract:contract.contract_id},current);
  }

  async function showProvider(active) {
    const version=++generation;contractVersion++;body.replaceChildren();if(!active)return;
    const status=registerStatus(),picker=node("select"),detail=node("section"),controls=node("div");
    let offset=0,rows=[];
    const selectContract=()=>{const revision=++contractVersion;detail.replaceChildren();const contract=rows.find(r=>r.contract_id===picker.value);
      if(contract)openContract(detail,contract,()=>version===generation&&revision===contractVersion);};
    picker.onchange=selectContract;
    async function load(next) {
      controls.replaceChildren();picker.disabled=true;contractVersion++;detail.replaceChildren();picker.replaceChildren();
      try{
        const result=await page(client,"fm_provider_contracts",{},next);if(version!==generation)return;
        rows=result;offset=next;for(const row of rows)picker.add(new Option(row.name,row.contract_id));
        picker.disabled=!rows.length;status.textContent=rows.length?"":t("لا تظهر عقود مسندة إلى حسابك في هذه الصفحة.","No assigned contracts are visible to this account on this page.");
        if(next)controls.append(button(t("العقود السابقة","Previous contracts"),()=>load(Math.max(0,offset-50))));
        if(rows.length===50)controls.append(button(t("عقود أخرى","More contracts"),()=>load(offset+50)));
        selectContract();
      }catch{if(version===generation){status.textContent=failed();controls.append(button(t("إعادة المحاولة","Retry"),()=>load(next)));}}
    }
    body.append(status,label(t("العقد المسند إليك","Your assigned contract"),picker),controls,detail);await load(0);
  }
  manager.addEventListener("toggle",()=>{
    const version=++reviewGeneration;
    const records=manager.querySelector("[data-inbox]");records.replaceChildren();
    if(manager.open&&organization)inbox(records,{p_org:organization},()=>version===reviewGeneration&&manager.open,true);
  });
  return {showProvider,setOrganization(id){reviewGeneration++;organization=id;manager.open=false;manager.querySelector("[data-inbox]").replaceChildren();}};
}
