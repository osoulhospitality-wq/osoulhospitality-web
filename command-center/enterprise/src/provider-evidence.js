import { uiText as t } from "./locale.js";

export const maxEvidenceBytes = 6 * 1024 * 1024;
const types = new Map([["image/jpeg","jpg"],["image/png","png"],["application/pdf","pdf"]]);
export async function validateEvidenceFile(file) {
  if (!file || !types.has(file.type) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > maxEvidenceBytes) return false;
  const head = new Uint8Array(await file.slice(0,8).arrayBuffer());
  const signatures = {"image/jpeg":[255,216,255],"image/png":[137,80,78,71,13,10,26,10],"application/pdf":[37,80,68,70,45]};
  return signatures[file.type].every((value,i)=>head[i]===value);
}
function el(tag, text) {
  const element=document.createElement(tag);
  if(text!==undefined) element.textContent=text;
  return element;
}
function action(text, fn) {
  const button=el("button",text);button.type="button";
  button.addEventListener("click",()=>void fn(button));return button;
}
export function mountProviderEvidence(client, parent, submission, isCurrent) {
  const section=el("section"),status=el("p"),body=el("div");
  let version=0,seen=null;
  const current=()=>isCurrent() && section.isConnected;
  const bucket=client.storage.from("provider-evidence");
  const refresh=action(t("تحديث المرفقات","Refresh attachments"),()=>load());
  status.setAttribute("role","status");
  section.append(el("h4",t("أدلة مقدم الخدمة","Supplier evidence")),refresh,status,body);
  parent.append(section);
  async function rpc(name, data={}) {
    const result=await client.rpc(name,{p_id:submission,...data});
    if(result.error)throw result.error;
    return result.data;
  }
  async function load(message="") {
    const ticket=++version;seen=null;body.replaceChildren();status.textContent="";
    try {
      const data=await rpc("fm_provider_file_list");
      if(ticket!==version || !current())return;
      if(!Array.isArray(data?.files)||!Array.isArray(data.pending))throw new Error("Invalid receipt");
      if (!Number.isSafeInteger(data.pending_count) || data.pending_count < 0) throw new Error("Invalid pending attachment count");
      const blocked = data.pending_count > 0;
      seen=blocked ? null : data.files.length;
      if(blocked) body.append(el("p",t("ينتظر الاعتماد إتمام رفع المرفقات أو انتهاء مهلتها.","Review is on hold until pending attachments are confirmed or expire.")));
      for(const [index,record] of data.files.entries()) {
        const date=new Date(record.at).toLocaleString(document.documentElement.lang,{timeZone:"Asia/Riyadh"});
        body.append(action(t("تنزيل المرفق ","Download attachment ")+(index+1)+" · "+date, async button=>{
          button.disabled=true;
          try {
            const {data:file,error}=await bucket.download(record.path);
            if(error||!file)throw new Error("Download failed");
            if(ticket!==version||!current())return;
            const object=URL.createObjectURL(new Blob([file],{type:"application/octet-stream"}));
            const a=el("a");a.href=object;a.download="evidence-"+(index+1)+"."+(types.get(record.type)||"bin");
            a.click();setTimeout(()=>URL.revokeObjectURL(object),1500);
          }catch{if(ticket===version&&current())status.textContent=t("تعذّر تنزيل المرفق بصلاحية الجلسة الحالية.","Download unavailable for this session.");}
          finally{button.disabled=false;}
        }));
      }
      if(!data.files.length)body.append(el("p",t("لا توجد مرفقات مؤكدة.","No confirmed attachments.")));
      for(const pending of data.pending) {
        const line=el("p",t("رفْع غير مؤكَّد. ","Unconfirmed upload. "));
        if(pending.uploaded && data.can_upload && new Date(pending.expires)>new Date()) {
          line.append(action(t("تأكيد إرفاق الملف","Confirm attachment"),async button=>{
            button.disabled=true;
            try {
              await rpc("fm_provider_confirm_file",{p_object:pending.path});
              if(current())await load();
            }catch{if(current())await load(t("لم يُؤكّد الإرفاق. تحقق من حالة الطلب والمهلة.","Attachment unconfirmed. Check the review status and upload window."));}
          }));
        }
        line.append(action(t("إلغاء الرفع غير المكتمل","Discard incomplete upload"),async button=>{
          button.disabled=true;
          try {
            if(data.can_upload && !await rpc("fm_provider_abandon_file",{p_object:pending.path}))throw new Error();
            if (pending.uploaded) {
              const removed=await bucket.remove([pending.path]);
              if(removed.error||!removed.data?.length)throw new Error();
            }
            if(current())await load();
          }catch{if(current())await load(t("تعذّر تأكيد إزالة الملف المؤقت.","Temporary file removal is unconfirmed."));}
        }));body.append(line);
      }
      if(data.can_upload) {
        const input=el("input"),label=el("label",t("ملف PDF أو صورة JPEG أو PNG حتى ٦ م.ب. ","PDF, JPEG or PNG up to 6 MiB. "));
        input.type="file";input.accept=[...types.keys()].join(",");label.append(input);body.append(label);
        body.append(action(t("إرفاق دليل","Attach evidence"),async button=>{
          const file=input.files?.[0];button.disabled=true;input.disabled=true;
          let uploaded=false,attempted=false;
          try {
            if(!await validateEvidenceFile(file)){if(current())status.textContent=t("اختر ملفًا مدعومًا ضمن الحجم المحدد.","Choose a supported file within the size limit.");return;}
            if(ticket!==version||!current())return;
            const path=await rpc("fm_provider_prepare_file",{p_type:file.type,p_bytes:file.size});
            if(ticket!==version||!current())return;
            attempted=true;
            const result=await bucket.upload(path,file,{contentType:file.type,upsert:false,cacheControl:"0"});
            if(result.error)throw result.error;
            uploaded=true;
            if(ticket!==version||!current())return;
            await rpc("fm_provider_confirm_file",{p_object:path});
            if(current())await load(t("تم تأكيد الإرفاق.","Attachment confirmed."));
          }catch{
            if(ticket!==version||!current())return;
            const msg=uploaded?t("وصل الملف إلى التخزين ولم يُؤكّد إرفاقه. راجع الرفع غير المكتمل.","File uploaded, but attachment is unconfirmed. Check incomplete uploads."):
              attempted?t("تعذّر تأكيد الرفع. تحقق من حالة الملف قبل إعادة المحاولة.","Upload unconfirmed. Check the pending file before retrying."):
                t("تعذّر بدء الرفع. تحقق من الصلاحية وحالة الطلب وحد المرفقات.","Upload could not start. Check your access, review status and attachment limit.");
            await load(msg);
          }finally{button.disabled=false;input.disabled=false;}
        }));
      }
      status.textContent=message;
    }catch{if(ticket===version&&current()){seen=null;body.replaceChildren();status.textContent=t("تعذّرت قراءة المرفقات. حدّثها قبل المراجعة.","Attachment list unavailable. Refresh before review.");}}
  }
  parent.addEventListener("toggle",()=>{if(parent.open&&current())void load();});
  if(parent.open)void load();
  return {reviewCount:()=>current()?seen:null};
}
