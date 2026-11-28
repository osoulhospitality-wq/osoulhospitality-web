import { uiText as t } from "./locale.js";

const contractFields = "id,name,status,annual_value,currency,end_date,notice_days,updated_at,supplier:suppliers!contracts_supplier_same_org_fk(name)";
const quoteFields = "id,product_id,description,quantity,pack_price,standard_qty,unit,quote:quotes!quote_lines_quote_same_org_fk(quote_number,quote_date,currency,supplier_id,tax_rate,discount,delivery_cost,supplier:suppliers!quotes_supplier_same_org_fk(name))";

function number(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function day(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const stamp = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value ? stamp : null;
}

export function contractPortfolio(rows, today) {
  const totals = new Map(), notices = [];
  for (const row of rows) {
    if (row.status !== "active") continue;
    const currency = row.currency?.trim() || "";
    const group = totals.get(currency) || {currency, cents:0, priced:0, count:0};
    group.count++;
    const amount = number(row.annual_value);
    if (amount !== null && currency) {
      const nextCents = group.cents + Math.round(amount * 100);
      group.cents = group.cents !== null && Number.isSafeInteger(nextCents) ? nextCents : null;
      group.priced++;
    }
    totals.set(currency, group);
    const expiry = day(row.end_date), noticeDays = number(row.notice_days);
    if (expiry === null || !Number.isInteger(noticeDays)) continue;
    const notice = new Date(expiry - noticeDays * 86400000).toISOString().slice(0,10);
    notices.push({...row, notice, past:notice < today});
  }
  notices.sort((a,b)=>a.notice.localeCompare(b.notice) || a.name.localeCompare(b.name));
  return {totals:[...totals.values()].sort((a,b)=>a.currency.localeCompare(b.currency)), notices};
}

export function comparableQuotes(rows, today) {
  const groups = new Map();
  for (const line of rows) {
    const quote = line.quote;
    const pack = number(line.pack_price), size = number(line.standard_qty), qty = number(line.quantity);
    if (!quote?.supplier_id || !line.product_id || !line.description?.trim() || !line.unit?.trim()
      || !quote.currency?.trim() || day(quote.quote_date) === null || quote.quote_date > today
      || pack === null || !size || !qty) continue;
    const terms = [quote.tax_rate, quote.discount, quote.delivery_cost].map(number);
    if (terms.includes(null)) continue;
    // A product id is supplier-specific; cross-supplier equivalence needs a governed item mapping.
    const key = JSON.stringify([quote.supplier_id,line.product_id,line.description.trim(),line.unit.trim(),qty,size,quote.currency.trim(),...terms]);
    const dates = groups.get(key) || new Map();
    const sample = dates.get(quote.quote_date) || {prices:new Set(),references:new Set(),line};
    sample.prices.add(pack);
    if (quote.quote_number) sample.references.add(quote.quote_number);
    dates.set(quote.quote_date,sample);
    groups.set(key,dates);
  }
  const pairs = [];
  for (const dates of groups.values()) {
    const [end,start] = [...dates.keys()].sort().reverse();
    if (!start) continue;
    const last = dates.get(end), first = dates.get(start);
    // Different prices on either selected date have no reliable intraday ordering.
    if (last.prices.size !== 1 || first.prices.size !== 1) continue;
    const line = last.line, size = number(line.standard_qty);
    const before = [...first.prices][0] / size, after = [...last.prices][0] / size;
    pairs.push({name:line.description,unit:line.unit,quantity:number(line.quantity),packSize:size,supplier:line.quote.supplier?.name,
      currency:line.quote.currency.trim(),before,after,start,end,percent:before > 0 ? 100*(after-before)/before : null,
      references:[...new Set([...first.references,...last.references])].join(" · ")});
  }
  return pairs.sort((a,b)=>(b.percent ?? -Infinity)-(a.percent ?? -Infinity) || a.name.localeCompare(b.name));
}

export async function readCommercialRows(client, table, columns, organization, signal) {
  const rows=[];
  let cursor="";
  while (!signal.aborted) {
    let query=client.from(table).select(columns).eq("organization_id",organization).order("id").limit(200);
    if (cursor) query=query.gt("id",cursor);
    const {data,error}=await query.abortSignal(signal);
    if (signal.aborted) break;
    if (error || !Array.isArray(data)) throw new Error("Commercial records unavailable");
    if (!data.length) return rows;
    if (!data.at(-1).id || data.at(-1).id<=cursor) throw new Error("Invalid pagination");
    rows.push(...data);
    cursor=data.at(-1).id;
    // Continue until an empty page, including under a lower server response limit.
  }
  throw new Error("Read cancelled");
}

function element(tag,text) {
  const node=document.createElement(tag);
  if (text !== undefined) node.textContent=text;
  return node;
}

function pagedList(parent, rows, render) {
  if (!rows.length) return;
  const list=element("ol"), more=element("button",t("عرض المزيد","Show more"));
  more.type="button";
  let offset=0;
  function append() {
    const page=rows.slice(offset,offset+15);
    list.append(...page.map(row=>element("li",render(row))));
    offset+=page.length;
    more.hidden=offset>=rows.length;
  }
  append();
  more.addEventListener("click",append);
  parent.append(list,more);
}

const format = new Intl.NumberFormat(document.documentElement.lang,{maximumSignificantDigits:6});
const financialFormat = new Intl.NumberFormat(document.documentElement.lang,{maximumFractionDigits:2});
function formatMoney(value,currency) { return financialFormat.format(value)+" "+currency; }

function renderContracts(parent,rows,today) {
  const {totals,notices}=contractPortfolio(rows,today);
  parent.append(element("h4",t("القيمة السنوية للعقود المسجلة كسارية","Annual value of contracts marked active")));
  if (!totals.length) parent.append(element("p",t("لا تظهر عقود مصنفة سارية في السجل.","No contracts marked active are visible.")));
  for (const group of totals) {
    const value=group.priced && group.cents !== null ? formatMoney(group.cents/100,group.currency) : t("قيمة غير متاحة","Value unavailable");
    parent.append(element("p",value+" · "+t("عقود ذات قيمة موثقة","Contracts with a recorded value")+" "+group.priced+"/"+group.count));
  }
  parent.append(element("p",t("القيم من سجل عقود المؤسسة، مفصّلة بالعملة. يحتاج قياس المصروف الفعلي وربحية الوحدة إلى فواتير وإيرادات مرتبطة بها.",
    "Figures use the organization’s contract register, grouped by currency. Actual spend and unit profitability require attributed invoices and revenue.")));
  parent.append(element("h4",t("مواعيد إشعار العقود السارية","Notice dates for contracts marked active")));
  const activeCount=totals.reduce((sum,group)=>sum+group.count,0);
  parent.append(element("p",t("عقود أمكن حساب مهلة إشعارها","Contracts with a calculable notice date")+" "+notices.length+"/"+activeCount));
  pagedList(parent,notices,row=>[row.name,row.supplier?.name,row.notice,
    row.past?t("تجاوز تاريخ الإشعار في السجل، راجع المراسلات.","Past the recorded notice date; verify correspondence.")
      :t("راجع قرار التجديد قبل الموعد.","Review the renewal decision by the notice date."),
    t("انتهاء العقد","Contract end")+" "+row.end_date].filter(Boolean).join(" · "));
  const newest=rows.reduce((stamp,row)=>row.updated_at>stamp?row.updated_at:stamp,"");
  if (newest) parent.append(element("small",t("آخر تعديل في سجلات العقود المقروءة","Latest change in the contract records read")+" · "+newest.slice(0,10)));
}

function renderPrices(parent,rows,today) {
  const pairs=comparableQuotes(rows,today);
  parent.append(element("h4",t("تغيّر سعر الوحدة في عروض المورد","Unit price movements in supplier quotations")));
  parent.append(element("p",t("تُقارن آخر تاريخين متاحين للصنف نفسه لدى المورد، مع تطابق الوصف والعملة والوحدة وحجم العبوة والكمية والضريبة والخصم والتوصيل. الأسعار للمواد قبل توزيع رسوم العرض. راجع المواصفة والضمان قبل التفاوض.",
    "The two most recent dates for the same supplier and product are compared when description, currency, unit, pack size, quantity, tax, discount and delivery match. Material prices exclude allocated quote charges. Verify specification and warranty before negotiation.")));
  if (!pairs.length) parent.append(element("p",t("لا يوجد زوج عروض متطابق الشروط يمكن قياس تغير سعره.","No comparable pair of dated quotations is available.")));
  pagedList(parent,pairs,pair=>[pair.name,pair.supplier,pair.start+" · "+format.format(pair.before)+" "+pair.currency,
    pair.end+" · "+format.format(pair.after)+" "+pair.currency,t("للوحدة","per unit")+" "+pair.unit,
    t("الكمية","Quantity")+" "+format.format(pair.quantity),t("حجم العبوة","Pack size")+" "+format.format(pair.packSize),
    pair.percent===null?t("التغير النسبي غير متاح لأساس صفري","Percentage unavailable for a zero baseline"):format.format(pair.percent)+"%",
    pair.references].filter(Boolean).join(" | "));
}

export function setupCommercialIntelligence(client) {
  const panel=element("details"), status=element("p"), container=element("div"), refresh=element("button",t("تحديث القراءة","Refresh records"));
  panel.id="commercial-intelligence";
  panel.id="commercial-intelligence";
  panel.append(element("summary",t("مالية المؤسسة ومقارنة عروض الموردين","Organization finances and supplier quotations")),status,refresh,container);
  status.setAttribute("role","status");
  refresh.type="button";
  document.querySelector("#contract-register").after(panel);
  let organization="", controller=null;
  async function load() {
    controller?.abort();
    if (!panel.open || !organization) return;
    const current = controller=new AbortController();
    refresh.disabled=true;
    container.replaceChildren();
    status.textContent=t("جارٍ قراءة سجلات المؤسسة…","Reading organization records…");
    const [contracts,quotes]=await Promise.allSettled([
      readCommercialRows(client,"contracts",contractFields,organization,current.signal),
      readCommercialRows(client,"quote_lines",quoteFields,organization,current.signal)
    ]);
    if (current.signal.aborted) return;
    const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Riyadh"}).format(new Date());
    if (contracts.status==="fulfilled") renderContracts(container,contracts.value,today);
    else container.append(element("p",t("تعذرت قراءة سجل العقود.","Contract register unavailable.")));
    if (quotes.status==="fulfilled") renderPrices(container,quotes.value,today);
    else container.append(element("p",t("تعذرت قراءة بنود عروض الأسعار.","Quotation lines unavailable.")));
    status.textContent=t("تاريخ محاولة القراءة بتوقيت الرياض","Read attempted on, Riyadh time")+" · "+today;
    refresh.disabled=false;
  }
  panel.addEventListener("toggle",load);
  refresh.addEventListener("click",load);
  return (id)=>{
    controller?.abort();
    organization=id;
    panel.open=false;
    refresh.disabled=false;
    container.replaceChildren();
    status.textContent="";
  };
}
