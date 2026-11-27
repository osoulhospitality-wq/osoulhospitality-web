import {feedLabels, labelNames, matchesScope, mergeFeeds, scopeOf, terminalShare} from "./request-feed.js";

(() => {
  "use strict";

  const english = document.documentElement.lang.startsWith("en");
  const locale = english ? "en-SA" : "ar-SA";
  const tr = (arabic, englishText) => english ? englishText : arabic;

  const APP_VERSION = "13.0.0";
  const STORAGE_KEY = "osoul-command-center-v13";
  const DRAGON_CACHE_KEY = "osoul-dragon-feed-v14";
  const DRAGON_ISSUE_API = "https://api.github.com/repos/osoulhospitality-wq/osoulhospitality-web/issues";
  const DRAGON_NEW_URL = "https://github.com/osoulhospitality-wq/osoulhospitality-web/issues/new";
  const AUTO_REFRESH_MS = 600000;
  let fetchingDragon = false;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const today = () => new Date().toISOString().slice(0, 10);
  const money = value => new Intl.NumberFormat(locale, {style:"currency", currency:"SAR", maximumFractionDigits:2}).format(Number(value || 0));
  const date = value => value ? new Intl.DateTimeFormat(locale, {dateStyle:"medium"}).format(new Date(value.length === 10 ? `${value}T12:00:00` : value)) : "—";
  const dateTime = value => value ? new Intl.DateTimeFormat(locale, {dateStyle:"medium", timeStyle:"short", timeZone:"Asia/Riyadh"}).format(new Date(value)) : "—";
  const daysTo = value => Math.ceil((new Date(`${value}T12:00:00`) - new Date()) / 86400000);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
  const markdown = value => {
    const safe = escape(value || tr("لا يوجد محتوى.", "No content available.")).replace(/\r/g, "");
    const lines = safe.split("\n");
    let list = "", output = [];
    const flushList = () => {
      if (!list) return;
      output.push(`<ul>${list}</ul>`);
      list = "";
    };
    lines.forEach(line => {
      const trimmed = line.trim();
      const bullet = trimmed.match(/^[-*]\s+(.+)/);
      if (bullet) {
        list += `<li>${bullet[1]}</li>`;
        return;
      }
      flushList();
      if (!trimmed) return output.push("<br>");
      const heading = trimmed.match(/^(#{1,4})\s+(.+)/);
      if (heading) return output.push(`<h${Math.min(heading[1].length + 2, 6)}>${heading[2]}</h${Math.min(heading[1].length + 2, 6)}>`);
      if (/^---+$/.test(trimmed)) return output.push("<hr>");
      output.push(`<p>${trimmed.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>")}</p>`);
    });
    flushList();
    return output.join("");
  };
  const blank = () => ({version:13, suppliers:[], products:[], quotes:[], contracts:[], decisions:[], documents:[], audit:[], updatedAt:new Date().toISOString()});

  let state;
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("osoul-command-center-v12") || localStorage.getItem("osoul-command-center-v11") || localStorage.getItem("osoul-command-center-v10");
    state = {...blank(), ...(JSON.parse(saved) || {})};
    state.version = 13;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    state = blank();
  }

  const dragon = {
    issues: [],
    comments: new Map(),
    loading: true,
    error: "",
    lastSync: null,
    rateRemaining: null,
    selectedNumber: null
  };

  try {
    const cached = JSON.parse(localStorage.getItem(DRAGON_CACHE_KEY));
    if (Array.isArray(cached?.issues) && Number.isFinite(Date.parse(cached.savedAt))) {
      dragon.issues = cached.issues;
      dragon.lastSync = cached.savedAt;
      dragon.loading = false;
    }
  } catch { /* cache is optional */ }

  const seed = () => {
    const supplierA = uid(), supplierB = uid(), supplierC = uid(), productA = uid(), productB = uid();
    state = {
      version:13, documents:[], audit:[], updatedAt:new Date().toISOString(),
      suppliers:[
        {id:supplierA,name:tr("مورد ألف — تجريبي", "Supplier A — sample"),cr:"1010XXXXXX",city:tr("الرياض", "Riyadh"),status:"approved",coverage:tr("الرياض", "Riyadh"),payment:tr("30 يوم", "30 days")},
        {id:supplierB,name:tr("شركة باء — تجريبي", "Supplier B — sample"),cr:"1011XXXXXX",city:tr("الرياض", "Riyadh"),status:"under_review",coverage:tr("الوسطى", "Central region"),payment:tr("نقدي", "Cash")},
        {id:supplierC,name:tr("مصاعد جيم — تجريبي", "Lift services C — sample"),cr:"1012XXXXXX",city:tr("الرياض", "Riyadh"),status:"approved",coverage:tr("المملكة", "Saudi Arabia"),payment:tr("ربع سنوي", "Quarterly")}
      ],
      products:[
        {id:productA,sku:"CLN-001",name:tr("منظف أرضيات مركز — تجريبي", "Concentrated floor cleaner — sample"),supplierId:supplierA,category:tr("مواد نظافة", "Cleaning supplies"),packPrice:92,standardQty:20,unit:tr("لتر", "litre"),moq:5},
        {id:productB,sku:"CLN-002",name:tr("منظف أرضيات مركز — تجريبي", "Concentrated floor cleaner — sample"),supplierId:supplierB,category:tr("مواد نظافة", "Cleaning supplies"),packPrice:28,standardQty:5,unit:tr("لتر", "litre"),moq:12}
      ],
      quotes:[
        {id:uid(),productId:productA,supplierId:supplierA,quantity:10,packPrice:92,discount:50,delivery:0,taxRate:15,validUntil:"2026-09-30"},
        {id:uid(),productId:productB,supplierId:supplierB,quantity:40,packPrice:28,discount:0,delivery:100,taxRate:15,validUntil:"2026-09-15"}
      ],
      contracts:[
        {id:uid(),name:tr("صيانة مصعد — تجريبي", "Lift maintenance — sample"),supplierId:supplierC,building:tr("مبنى نموذجي", "Example building"),value:42000,endDate:"2026-11-30",noticeDays:90,probability:4,impact:4,risk:tr("قطع رئيسية مستثناة دون قائمة أسعار معتمدة", "Major parts are excluded and have no agreed price list"),status:"open"},
        {id:uid(),name:tr("صيانة دورية — تجريبي", "Routine maintenance — sample"),supplierId:supplierC,building:tr("مبنى العرض", "Demonstration building"),value:36000,endDate:"2027-02-28",noticeDays:60,probability:2,impact:3,risk:tr("زمن الاستجابة غير محدد بدقة", "The response time is not clearly defined"),status:"open"}
      ],
      decisions:[{id:uid(),subject:tr("عقد المصعد التجريبي", "Sample lift contract"),decision:tr("تفاوض", "Negotiate"),approver:tr("معتمد تجريبي", "Sample approver"),evidence:"DEMO-CON-001",rationale:tr("إضافة مصفوفة قطع الغيار وSLA والجزاءات قبل الاعتماد", "Agree a spare-parts schedule, service levels and penalties before approval"),createdAt:today()}]
    };
    save(tr("تم تحميل بيانات العرض التجريبية", "Sample data loaded"));
  };

  const audit = (action, entity, detail = "") => {
    state.audit ??= [];
    state.audit.push({id:uid(), at:new Date().toISOString(), actor:tr("مستخدم محلي", "Local user"), action, entity, detail});
  };
  const save = (message, event) => {
    if (event) audit(event.action, event.entity, event.detail);
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderBusiness();
    if (message) toast(message);
  };
  const toast = message => {
    const element = $("#toast");
    element.textContent = message;
    element.classList.add("show");
    setTimeout(() => element.classList.remove("show"), 2600);
  };

  const supplier = id => state.suppliers.find(item => item.id === id);
  const product = id => state.products.find(item => item.id === id);
  const normalizedProductPrice = item => Number(item.packPrice) / Number(item.standardQty || 1);
  const quoteTotal = item => ((Number(item.packPrice) * Number(item.quantity)) - Number(item.discount || 0) + Number(item.delivery || 0)) * (1 + Number(item.taxRate || 0) / 100);
  const quoteUnit = item => {
    const linkedProduct = product(item.productId);
    return linkedProduct ? quoteTotal(item) / (Number(item.quantity) * Number(linkedProduct.standardQty || 1)) : 0;
  };
  const riskScore = contract => Number(contract.probability) * Number(contract.impact);
  const riskLevel = score => score >= 20 ? "critical" : score >= 12 ? "high" : score >= 6 ? "medium" : score >= 2 ? "low" : "note";
  const riskLabel = score => ({critical:tr("حرج", "Critical"), high:tr("مرتفع", "High"), medium:tr("متوسط", "Medium"), low:tr("منخفض", "Low"), note:tr("ملاحظة", "Note")}[riskLevel(score)]);
  const empty = text => `<div class="empty">${escape(text)}</div>`;
  const table = (heads, rows) => rows.length ? `<table><thead><tr>${heads.map(head => `<th>${head}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>` : empty(tr("لا توجد سجلات بعد.", "No records yet."));
  const statusBadge = status => {
    const map = {approved:[tr("معتمد", "Approved"),""], under_review:[tr("قيد المراجعة", "Under review"),"review"], suspended:[tr("موقوف", "Suspended"),"high"]};
    const item = map[status] || [status, ""];
    return `<span class="badge ${item[1]}">${item[0]}</span>`;
  };

  const requestStatus = issue => {
    const labels = new Set(labelNames(issue));
    const terminalCount = Number(labels.has("dragon-failed")) + Number(labels.has("dragon-completed"));
    if (terminalCount > 1 || (labels.has("dragon-processing") && terminalCount)) return "conflict";
    if (labels.has("dragon-failed")) return "failed";
    if (labels.has("dragon-processing")) return "processing";
    if (labels.has("dragon-completed")) return "completed";
    if (issue.state === "closed") return "archived";
    return "new";
  };
  const statusInfo = status => ({
    new:{label:tr("جديد", "New"), className:"new"},
    processing:{label:tr("قيد المعالجة", "In progress"), className:"processing"},
    completed:{label:tr("سُلّمت المسودة", "Draft delivered"), className:"completed"},
    failed:{label:tr("متعثر", "Failed"), className:"failed"},
    conflict:{label:tr("تعارض حالة", "Conflicting status"), className:"conflict"},
    archived:{label:tr("مؤرشف", "Archived"), className:"archived"}
  }[status]);
  const controlValue = (issue, name) => {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = (issue.body || "").match(new RegExp(`^-\\s*${escapedName}\\s*:\\s*(.+)$`, "im"));
    return match?.[1]?.trim() || "";
  };
  const requestCategory = issue => {
    const title = issue.title.toLowerCase(), text = `${issue.title} ${issue.body || ""}`.toLowerCase();
    const declared = (controlValue(issue, "المسار") || controlValue(issue, "Category")).toLowerCase();
    if (/سلامة|safety/.test(declared)) return "safety";
    if (/امتثال|compliance/.test(declared)) return "compliance";
    if (/عميل|client/.test(declared)) return "client";
    if (/شراكة|partnership/.test(declared)) return "partnership";
    if (/استراتيجية|strategy/.test(declared)) return "strategy";
    if (/سلامة|حريق|طوارئ|safety|fire|emergency/.test(title)) return "safety";
    if (/امتثال|ترخيص|رخص|compliance|licen[cs]/.test(title)) return "compliance";
    if (/عميل|فندق|عرض فني|client|customer|hotel/.test(title)) return "client";
    if (/شراكة|operator|partnership|market entry|تطوير أعمال/.test(title)) return "partnership";
    if (/خطة|استراتيجية|إطلاق|strategy|launch|تنفيذ/.test(title)) return "strategy";
    if (/سلامة|حريق|طوارئ|safety|fire|emergency/.test(text)) return "safety";
    if (/امتثال|ترخيص|رخص|compliance|licen[cs]/.test(text)) return "compliance";
    if (/عميل|فندق|عرض فني|client|customer|hotel/.test(text)) return "client";
    if (/شراكة|operator|partnership|market entry|تطوير أعمال/.test(text)) return "partnership";
    if (/خطة|استراتيجية|إطلاق|strategy|launch|تنفيذ/.test(text)) return "strategy";
    return "general";
  };
  const categoryInfo = category => ({
    safety:{label:tr("السلامة", "Safety"), code:"SAF"}, compliance:{label:tr("الامتثال", "Compliance"), code:"COM"}, client:{label:tr("العملاء", "Client services"), code:"CLT"}, partnership:{label:tr("الشراكات", "Partnerships"), code:"BD"}, strategy:{label:tr("الاستراتيجية", "Strategy"), code:"STR"}, general:{label:tr("عام", "General"), code:"GEN"}
  }[category]);
  const requestPriority = issue => {
    const text = `${issue.title} ${issue.body || ""}`.toLowerCase();
    const declared = (controlValue(issue, "الأولوية") || controlValue(issue, "Priority")).toLowerCase();
    if (/عاجل|urgent|critical/.test(declared)) return {label:tr("عاجل", "Urgent"), className:"urgent", rank:3};
    if (/مرتفع|high/.test(declared)) return {label:tr("مرتفع", "High"), className:"high", rank:2};
    if (/عاجل|فوري|الليلة|urgent|critical|emergency/.test(text)) return {label:tr("عاجل", "Urgent"), className:"urgent"};
    if (requestCategory(issue) === "safety" || /قبل التشغيل|قرب الافتتاح|قبل الافتتاح/.test(text)) return {label:tr("مرتفع", "High"), className:"high"};
    return {label:tr("عادي", "Normal"), className:"normal"};
  };
  const requestDueDate = issue => {
    const value = (controlValue(issue, "الموعد المستهدف") || controlValue(issue, "Target date"));
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  };
  const requestFlags = issue => {
    const status = requestStatus(issue), ageMs = Date.now() - new Date(issue.updated_at).getTime();
    const due = requestDueDate(issue);
    return {
      overdue: Boolean(due && new Date(`${due}T23:59:59+03:00`) < new Date() && !["completed", "archived"].includes(status)),
      stale: status === "processing" ? ageMs > 15 * 60 * 1000 : status === "new" ? ageMs > 60 * 60 * 1000 : false,
      conflict: status === "conflict"
    };
  };
  const currentRequestScope = () => $("[data-filter=requestScope]")?.value || "queue";
  const scopedRequests = () => dragon.issues.filter(issue => matchesScope(issue, currentRequestScope()));
  const scopeLabel = scope => ({
    queue:tr("قائمة المتابعة العامة", "Public work queue"),
    operational:tr("موسوم تشغيليًا", "Labelled operational"),
    unclassified:tr("بانتظار التصنيف", "Unclassified"),
    pilot:tr("اختبار تجريبي", "Pilot test"),
    all:tr("كل السجلات", "All records")
  })[scope];

  async function fetchPages(baseUrl, {maxPages = 5, signal} = {}) {
    const records = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const separator = baseUrl.includes("?") ? "&" : "?";
      const response = await fetch(`${baseUrl}${separator}page=${page}`, {
        headers:{Accept:"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28"},
        signal,
        cache:"no-store"
      });
      dragon.rateRemaining = response.headers.get("X-RateLimit-Remaining");
      if (!response.ok) throw new Error(response.status === 403 ? tr("تم بلوغ حد التحديث المؤقت", "The temporary refresh limit has been reached") : `${tr("تعذر جلب البيانات (", "Could not retrieve the data (")}${response.status})`);
      const pageRecords = await response.json();
      records.push(...pageRecords);
      const links = response.headers.get("Link");
      if (pageRecords.length < 100 || (links && !links.includes('rel="next"'))) break;
      if (page === maxPages) throw new Error(tr("تجاوز السجل حد العرض؛ تعذر حساب مجموعة كاملة.", "The feed exceeds the display limit; no complete snapshot is available."));
    }
    return records;
  }

  async function loadDragon({force = false, quiet = false} = {}) {
    if (fetchingDragon) return;
    if (!navigator.onLine) {
      dragon.error = tr("لا يوجد اتصال بالإنترنت — يتم عرض آخر نسخة محفوظة", "You are offline. Showing the last saved copy.");
      dragon.loading = false;
      renderRequests();
      return;
    }
    if (!force && dragon.lastSync && Date.now() - new Date(dragon.lastSync).getTime() < 60000) {
      renderRequests();
      return;
    }
    fetchingDragon = true;
    dragon.loading = true;
    dragon.error = "";
    renderConnection();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const feeds = await Promise.all(feedLabels.map(label =>
        fetchPages(`${DRAGON_ISSUE_API}?state=all&labels=${label}&per_page=100`, {signal:controller.signal})
      ));
      dragon.issues = mergeFeeds(feeds);
      dragon.comments.clear();
      dragon.lastSync = new Date().toISOString();
      try { localStorage.setItem(DRAGON_CACHE_KEY, JSON.stringify({savedAt:dragon.lastSync, issues:dragon.issues})); } catch { /* The live view still works when storage is full. */ }
      if (!quiet && force) toast(tr("تم تحديث طلبات Dragon", "Dragon requests updated"));
    } catch (error) {
      controller.abort();
      const hasSnapshot = Boolean(dragon.lastSync);
      dragon.error = `${error.name === "AbortError" ? tr("انتهت مهلة الاتصال", "Connection timed out") : error.message}${hasSnapshot ? tr(" — يتم عرض آخر نسخة محفوظة", " — showing the last saved copy") : ""}`;
    } finally {
      clearTimeout(timeout);
      fetchingDragon = false;
      dragon.loading = false;
      renderRequests();
    }
  }

  function renderConnection() {
    const stateElement = $("#systemState"), banner = $("#connectionBanner"), lastSync = $("#lastSync");
    if (dragon.loading) {
      stateElement.className = "system-state loading";
      stateElement.querySelector("span").textContent = tr("جاري التحديث", "Refreshing");
    } else if (dragon.error) {
      stateElement.className = "system-state warning";
      stateElement.querySelector("span").textContent = dragon.lastSync ? tr("عرض محفوظ", "Saved view") : tr("البيانات غير متاحة", "Feed unavailable");
    } else {
      stateElement.className = "system-state connected";
      stateElement.querySelector("span").textContent = tr("السجل متصل", "Feed connected");
    }
    lastSync.textContent = `${tr("آخر مزامنة: ", "Last sync: ")}${dragon.lastSync ? dateTime(dragon.lastSync) : "—"}`;
    if (banner) {
      banner.classList.toggle("warning", Boolean(dragon.error));
      const title = banner.querySelector("b"), note = banner.querySelector("small");
      title.textContent = dragon.error ? tr("تعذر التحديث المباشر", "Live update unavailable") : tr("سجل طلبات دراقون العام", "Public Dragon request feed");
      const rateWarning = dragon.rateRemaining !== null && Number(dragon.rateRemaining) <= 10 ? tr(" • السعة العامة منخفضة", " • Few API requests remaining") : "";
      note.textContent = dragon.error ? [dragon.error, dragon.lastSync && dateTime(dragon.lastSync)].filter(Boolean).join(" · ") : `${tr("سجل عام تجريبي • تحديث كل 10 دقائق", "Public pilot log • Refreshes every ten minutes")}${dragon.rateRemaining ? `${tr(" • سعة الاتصال ", " • API requests remaining: ")}${dragon.rateRemaining}` : ""}${rateWarning}`;
    }
  }

  function requestMetrics(requests) {
    const counts = {new:0, processing:0, completed:0, failed:0, conflict:0, archived:0};
    requests.forEach(issue => counts[requestStatus(issue)]++);
    const success = terminalShare(counts);
    const needsDecision = issue => ["failed", "conflict"].includes(requestStatus(issue)) || requestFlags(issue).overdue || requestFlags(issue).stale;
    const attention = requests.filter(needsDecision);
    const flags = requests.map(requestFlags);
    return {counts, success, attention, total:requests.length, overdue:flags.filter(flag => flag.overdue).length, stale:flags.filter(flag => flag.stale).length};
  }

  function renderRequests() {
    renderConnection();
    const requests = scopedRequests();
    const metrics = requestMetrics(requests);
    const navCount = metrics.counts.new + metrics.counts.processing + metrics.counts.failed + metrics.counts.conflict;
    $("#requestNavCount").textContent = dragon.lastSync ? navCount : "—";
    $("#requestNavCount").classList.toggle("has-work", navCount > 0);
    $("#requestScopeLabel").textContent = scopeLabel(currentRequestScope());
    const hasData = Boolean(dragon.lastSync);
    const shareText = metrics.success === null || !hasData ? "—" : `${metrics.success}%`;
    const unclassified = requests.filter(issue => scopeOf(issue) === "unclassified").length;
    const sourceText = dragon.lastSync ? dateTime(dragon.lastSync) : (dragon.error || tr("بانتظار المزامنة", "Awaiting sync"));
    const queueAttention = currentRequestScope() === "queue" ? metrics.attention.length : requestMetrics(dragon.issues.filter(issue => matchesScope(issue, "queue"))).attention.length;
    $("#executiveQueue").textContent = hasData
      ? tr(`تحتاج ${queueAttention} من طلبات السجل العام إلى مراجعة. آخر مزامنة: ${sourceText}.`,
           `${queueAttention} public requests need review. Last sync: ${sourceText}.`)
      : sourceText;
    $("#requestKpis").innerHTML = [
      {label:tr("إجمالي الطلبات", "Total requests"), value:metrics.total, note:tr(`بانتظار التصنيف: ${unclassified}`, `Unclassified: ${unclassified}`), className:"neutral"},
      {label:tr("تحت العمل", "Active requests"), value:metrics.counts.new + metrics.counts.processing, note:`${metrics.counts.new}${tr(" جديد • ", " new • ")}${metrics.counts.processing}${tr(" معالجة", " in progress")}`, className:"processing"},
      {label:tr("مسودات مسلّمة", "Drafts delivered"), value:metrics.counts.completed, note:tr("بحسب وسم الطلب", "From the issue status label"), className:"completed"},
      {label:tr("تحتاج تدخلًا", "Need attention"), value:metrics.attention.length, note:`${metrics.counts.failed}${tr(" فشل • ", " failed • ")}${metrics.counts.conflict}${tr(" تعارض • ", " conflicting • ")}${metrics.overdue}${tr(" متأخر", " overdue")}`, className:(metrics.attention.length) ? "failed" : "completed"},
      {label:tr("نسبة تسليم المسودات", "Draft delivery share"), value:shareText, note:tr("المسلّمة من الحالات النهائية الظاهرة", "Delivered among visible terminal states"), className:"gold"},
      {label:tr("مدة معالجة المسودة", "Draft processing time"), value:"—", note:tr("تُقاس من سجل التشغيل الخاص", "Measured in the private execution log"), className:"neutral"}
    ].map(item => `<article class="request-kpi ${item.className}"><small>${item.label}</small><b>${hasData ? item.value : "—"}</b><span>${item.note}</span></article>`).join("");

    const statusOrder = ["completed", "processing", "new", "failed", "conflict", "archived"];
    const statusRows = statusOrder.filter(status => metrics.counts[status]).map(status => {
      const info = statusInfo(status), percent = metrics.total ? Math.round(metrics.counts[status] / metrics.total * 100) : 0;
      return `<div class="health-row"><span><i class="status-dot ${info.className}"></i>${info.label}</span><div class="health-track"><i class="${info.className}" style="width:${percent}%"></i></div><b>${metrics.counts[status]}</b></div>`;
    }).join("");
    const categories = ["strategy", "client", "compliance", "safety", "partnership", "general"].map(category => ({category, count:requests.filter(issue => requestCategory(issue) === category).length})).filter(item => item.count);
    $("#deliveryHealth").innerHTML = metrics.total ? `<div class="success-gauge" style="--success:${metrics.success ?? 0}"><div><b>${shareText}</b><span>${tr("تسليم", "delivered")}</span></div></div><div class="health-breakdown">${statusRows}</div><div class="category-pills">${categories.map(item => `<span>${categoryInfo(item.category).label}<b>${item.count}</b></span>`).join("")}</div>` : empty(hasData ? tr("لا توجد طلبات ضمن النطاق المحدد.", "No requests in this scope.") : sourceText);

    const attention = [...metrics.attention].sort((a, b) => {
      const order = {conflict:0, failed:1, processing:2, new:3};
      return (order[requestStatus(a)] ?? 4) - (order[requestStatus(b)] ?? 4) || Date.parse(a.created_at) - Date.parse(b.created_at);
    }).slice(0, 5);
    $("#attentionList").innerHTML = attention.length ? attention.map(issue => {
      const status = statusInfo(requestStatus(issue));
      const flags = requestFlags(issue);
      const flagText = flags.overdue ? tr(" • تجاوز الموعد", " • Overdue") : flags.stale ? tr(" • متوقف عن التحديث", " • No recent updates") : "";
      return `<button class="attention-row" type="button" data-request-number="${issue.number}"><span class="status-dot ${status.className}"></span><div><b>#${issue.number} ${escape(issue.title)}</b><small>${status.label}${flagText}${tr(" • آخر تحديث ", " • Last updated ")}${dateTime(issue.updated_at)}</small></div><em>←</em></button>`;
    }).join("") : !hasData ? empty(sourceText) : `<div class="all-clear"><span>✓</span><div><b>${tr("لا توجد حالات تحتاج تدخلك", "No requests need your attention")}</b><small>${tr("لا تظهر حالات تعثر أو تأخير ضمن هذا النطاق.", "No delays, failures or conflicting statuses are currently flagged.")}</small></div></div>`;

    renderRequestTable(requests);
  }

  function renderRequestTable(requests) {
    const query = ($("[data-search=requests]")?.value || "").trim().toLowerCase();
    const statusFilter = $("[data-filter=requestStatus]")?.value || "";
    const categoryFilter = $("[data-filter=requestCategory]")?.value || "";
    const visible = requests.filter(issue => {
      const matchesQuery = !query || `#${issue.number} ${issue.title} ${issue.body || ""}`.toLowerCase().includes(query);
      return matchesQuery && (!statusFilter || requestStatus(issue) === statusFilter) && (!categoryFilter || requestCategory(issue) === categoryFilter);
    }).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    $("#recordCount").textContent = `${visible.length}${tr(" من ", " of ")}${requests.length}`;
    if (dragon.loading && !dragon.lastSync) {
      $("#requestTable").innerHTML = `<div class="loading-state"><span></span><b>${tr("جاري تحميل طلبات Dragon…", "Loading Dragon requests…")}</b></div>`;
      return;
    }
    const rows = visible.map(issue => {
      const status = statusInfo(requestStatus(issue)), category = categoryInfo(requestCategory(issue)), priority = requestPriority(issue);
      const flags = requestFlags(issue);
      return `<tr class="${flags.overdue || flags.stale || flags.conflict ? "needs-attention" : ""}">
        <td><span class="request-id">#${issue.number}</span></td>
        <td><button class="request-title" type="button" data-request-number="${issue.number}"><b>${escape(issue.title)}</b><small>${scopeLabel(scopeOf(issue))} · ${escape((issue.body || "").replace(/\s+/g, " ").slice(0, 105))}${(issue.body || "").length > 105 ? "…" : ""}</small></button></td>
        <td><span class="category-badge"><i>${category.code}</i>${category.label}</span></td>
        <td><span class="priority ${priority.className}">${priority.label}</span></td>
        <td><span class="request-status ${status.className}"><i></i>${status.label}</span></td>
        <td><span class="comment-count">${issue.comments || 0}${tr(" رد", " replies")}</span></td>
        <td><span class="updated-time">${dateTime(issue.updated_at)}</span></td>
        <td><button class="row-action" type="button" data-request-number="${issue.number}" aria-label="${tr("عرض الطلب رقم", "View request")} ${issue.number}">${tr("عرض", "View")}</button></td>
      </tr>`;
    });
    $("#requestTable").innerHTML = visible.length ? table([tr("الرقم", "Number"), tr("الطلب", "Request"), tr("المسار", "Category"), tr("الأولوية", "Priority"), tr("الحالة", "Status"), tr("التواصل", "Replies"), tr("آخر تحديث", "Last updated"), ""], rows) : empty(dragon.error && !dragon.lastSync ? dragon.error : tr("لا توجد طلبات مطابقة للفلاتر الحالية.", "No requests match your filters."));
  }

  async function openRequestDetail(number) {
    const issue = dragon.issues.find(item => item.number === Number(number));
    if (!issue) return;
    dragon.selectedNumber = issue.number;
    $("#copyLatestResponse").disabled = true;
    renderRequestDetail(issue);
    $("#requestDetailDialog").showModal();
    if (dragon.comments.has(issue.number)) return;
    $("#detailThread").innerHTML = `<div class="loading-state compact"><span></span><b>${tr("جاري تحميل الردود…", "Loading replies…")}</b></div>`;
    try {
      dragon.comments.set(issue.number, await fetchPages(`${DRAGON_ISSUE_API}/${issue.number}/comments?per_page=100`, {maxPages:5}));
    } catch (error) {
      if (dragon.selectedNumber === issue.number) $("#detailThread").innerHTML = empty(error.message);
      return;
    }
    if (dragon.selectedNumber === issue.number) renderRequestDetail(issue);
  }

  function renderRequestDetail(issue) {
    const status = statusInfo(requestStatus(issue)), category = categoryInfo(requestCategory(issue)), priority = requestPriority(issue);
    $("#detailHeading").innerHTML = `<small>DRAGON REQUEST #${issue.number}</small><h2>${escape(issue.title)}</h2>`;
    $("#detailMeta").innerHTML = `<span class="request-status ${status.className}"><i></i>${status.label}</span><span class="category-badge"><i>${category.code}</i>${category.label}</span><span class="priority ${priority.className}">${priority.label}</span><span>${tr("أُنشئ", "Created")} ${dateTime(issue.created_at)}</span><span>${scopeLabel(scopeOf(issue))}</span>`;
    $("#detailRequest").innerHTML = markdown(issue.body);
    $("#detailGithubLink").href = issue.html_url;
    const thread = dragon.comments.get(issue.number);
    if (!thread) {
      $("#threadCount").textContent = `${issue.comments || 0}${tr(" رد", " replies")}`;
      return;
    }
    if (thread.error) {
      $("#detailThread").innerHTML = `<div class="empty">${escape(thread.error)}. ${tr("يمكنك فتح سجل المصدر من الزر أدناه.", "Use the link below to open the source log.")}</div>`;
      return;
    }
    $("#threadCount").textContent = `${thread.length}${tr(" رد", " replies")}`;
    $("#detailThread").innerHTML = thread.length ? thread.map((comment, index) => `<article class="thread-item ${index === thread.length - 1 ? "latest" : ""}"><header><div><span class="avatar">${escape((comment.user?.login || "D").slice(0, 1).toUpperCase())}</span><b>${escape(comment.user?.login || "Dragon")}</b>${index === thread.length - 1 ? tr("<em>أحدث رد</em>", "<em>Latest reply</em>") : ""}</div><time>${dateTime(comment.created_at)}</time></header><div class="thread-content" dir="auto">${markdown(comment.body)}</div></article>`).join("") : empty(tr("لا توجد ردود بعد.", "No replies yet."));
    const copyButton = $("#copyLatestResponse");
    if (copyButton) copyButton.disabled = !thread.length;
  }

  async function copyLatestResponse() {
    const thread = dragon.comments.get(dragon.selectedNumber);
    if (!Array.isArray(thread) || !thread.length) return toast(tr("لا يوجد رد جاهز للنسخ", "There is no response to copy"));
    const latestDelivery = [...thread].reverse().find(comment => /Dragon delivery/i.test(comment.body || "")) || thread.at(-1);
    try {
      await navigator.clipboard.writeText(latestDelivery.body || "");
      toast(tr("تم نسخ أحدث مخرج", "Latest response copied"));
    } catch {
      toast(tr("تعذر النسخ من هذا المتصفح", "Copying is unavailable in this browser"));
    }
  }

  function renderBusiness() {
    state.documents ??= [];
    state.audit ??= [];
    renderOptions();
    renderDashboard();
    renderSuppliers();
    renderProducts();
    renderQuotes();
    renderContracts();
    renderDecisions();
    renderDocuments();
    renderAudit();
  }

  function renderOptions() {
    $$('[data-options="suppliers"]').forEach(element => {
      const oldValue = element.value;
      element.innerHTML = `<option value="">${tr("اختر المورد", "Select supplier")}</option>${state.suppliers.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join("")}`;
      element.value = oldValue;
    });
    $$('[data-options="products"]').forEach(element => {
      const oldValue = element.value;
      element.innerHTML = `<option value="">${tr("اختر المنتج", "Select product")}</option>${state.products.map(item => `<option value="${item.id}">${escape(item.name)} — ${escape(item.sku)}</option>`).join("")}`;
      element.value = oldValue;
    });
  }

  function renderDashboard() {
    const expired = state.contracts.filter(contract => daysTo(contract.endDate) < 0);
    const expiring = state.contracts.filter(contract => daysTo(contract.endDate) >= 0 && daysTo(contract.endDate) <= 120).sort((a, b) => a.endDate.localeCompare(b.endDate));
    const risks = state.contracts.filter(contract => riskScore(contract) >= 6).sort((a, b) => riskScore(b) - riskScore(a));
    const potential = savings().reduce((total, item) => total + item.saving, 0);
    $("#kpis").innerHTML = [
      [tr("الموردون المعتمدون", "Approved suppliers"), state.suppliers.filter(item => item.status === "approved").length, `${tr("من أصل ", "of ")}${state.suppliers.length}`],
      [tr("بنود الأسعار", "Price records"), state.products.length, "Product Master"],
      [tr("عقود تستحق ≤120 يوم", "Contracts expiring within 120 days or already expired"), expiring.length + expired.length, expired.length ? `${expired.length}${tr(" منتهية • ", " expired • ")}${expiring.length}${tr(" قادمة", " upcoming")}` : tr("تحتاج مراجعة مبكرة", "Review renewal dates")],
      [tr("توفير محتمل", "Potential savings"), money(potential), tr("غير محقق حتى الاعتماد", "Subject to approval")]
    ].map(item => `<article class="kpi"><small>${item[0]}</small><b>${item[1]}</b><span>${item[2]}</span></article>`).join("");
    const watchedContracts = [...expired, ...expiring];
    $("#expiryList").innerHTML = watchedContracts.length ? watchedContracts.map(contract => {
      const remaining = daysTo(contract.endDate);
      return `<div class="list-row"><div><b>${escape(contract.name)}</b><small>${escape(contract.building)} • ${escape(supplier(contract.supplierId)?.name || "—")}</small></div><span class="badge ${remaining < 60 ? "high" : "medium"}">${remaining < 0 ? `${tr("منتهي منذ ", "Expired · days since expiry: ")}${Math.abs(remaining)}${tr(" يوم", " d")}` : `${remaining}${tr(" يوم", " d")}`}</span></div>`;
    }).join("") : empty(tr("لا توجد عقود قريبة.", "No upcoming or expired contracts."));
    $("#riskList").innerHTML = risks.length ? risks.map(contract => `<div class="list-row"><div><b>${escape(contract.risk || contract.name)}</b><small>${escape(contract.name)} • ${tr("الإجراء: مراجعة المختص", "Action: specialist review")}</small></div><span class="badge ${riskLevel(riskScore(contract))}">${riskLabel(riskScore(contract))} ${riskScore(contract)}</span></div>`).join("") : empty(tr("لا توجد مخاطر مفتوحة.", "No open risks."));
    const savingRows = savings();
    $("#savingList").innerHTML = table([tr("المنتج", "Product"), tr("أفضل مورد", "Best-priced supplier"), tr("سعر الوحدة", "Unit price"), tr("التوفير المحتمل", "Potential savings")], savingRows.map(item => `<tr><td>${escape(item.name)}</td><td>${escape(item.supplier)}</td><td class="money">${money(item.best)}</td><td class="money positive">${money(item.saving)}</td></tr>`));
  }

  function renderSuppliers() {
    const query = ($('[data-search="suppliers"]')?.value || "").toLowerCase(), filter = $('[data-filter="supplierStatus"]')?.value || "";
    const rows = state.suppliers.filter(item => (!filter || item.status === filter) && [item.name,item.cr,item.city].join(" ").toLowerCase().includes(query)).map(item => `<tr><td><b>${escape(item.name)}</b></td><td>${escape(item.cr || "—")}</td><td>${escape(item.city || "—")}</td><td>${escape(item.coverage || "—")}</td><td>${escape(item.payment || "—")}</td><td>${statusBadge(item.status)}</td><td><button class="danger-button" data-delete="suppliers" data-id="${item.id}">${tr("حذف", "Delete")}</button></td></tr>`);
    $("#supplierTable").innerHTML = table([tr("المورد", "Supplier"), tr("السجل", "Registration number"), tr("المدينة", "City"), tr("التغطية", "Coverage"), tr("الدفع", "Payment terms"), tr("الحالة", "Status"), ""], rows);
  }

  function renderProducts() {
    const query = ($('[data-search="products"]')?.value || "").toLowerCase();
    const rows = state.products.filter(item => [item.name,item.sku,supplier(item.supplierId)?.name].join(" ").toLowerCase().includes(query)).map(item => `<tr><td><b>${escape(item.sku)}</b></td><td>${escape(item.name)}</td><td>${escape(supplier(item.supplierId)?.name || "—")}</td><td class="money">${money(item.packPrice)}</td><td>${escape(item.standardQty)} ${escape(item.unit)}</td><td class="money"><b>${money(normalizedProductPrice(item))}</b> / ${escape(item.unit)}</td><td>${escape(item.moq)}</td><td><button class="danger-button" data-delete="products" data-id="${item.id}">${tr("حذف", "Delete")}</button></td></tr>`);
    $("#productTable").innerHTML = table(["SKU", tr("المنتج", "Product"), tr("المورد", "Supplier"), tr("العبوة", "Pack"), tr("الكمية القياسية", "Standard quantity"), tr("سعر الوحدة", "Unit price"), "MOQ", ""], rows);
  }

  function renderQuotes() {
    const grouped = {};
    state.quotes.forEach(item => (grouped[item.productId] ??= []).push(item));
    const rows = Object.values(grouped).flatMap(group => {
      const best = Math.min(...group.map(quoteUnit));
      return group.sort((a, b) => quoteUnit(a) - quoteUnit(b)).map(item => {
        const linkedProduct = product(item.productId), unit = quoteUnit(item);
        return `<tr><td>${escape(linkedProduct?.name || tr("منتج محذوف", "Deleted product"))}</td><td>${escape(supplier(item.supplierId)?.name || "—")}</td><td>${item.quantity}</td><td class="money">${money(quoteTotal(item))}</td><td class="money"><b>${money(unit)}</b> / ${escape(linkedProduct?.unit || tr("وحدة", "unit"))}</td><td>${unit === best ? tr("<span class=\"badge\">الأفضل سعريًا</span>", "<span class=\"badge\">Lowest price</span>") : tr("<span class=\"badge review\">راجع الجودة</span>", "<span class=\"badge review\">Review quality</span>")}</td><td>${date(item.validUntil)}</td><td><button class="danger-button" data-delete="quotes" data-id="${item.id}">${tr("حذف", "Delete")}</button></td></tr>`;
      });
    });
    $("#quoteTable").innerHTML = table([tr("المنتج", "Product"), tr("المورد", "Supplier"), tr("الكمية", "Quantity"), tr("الإجمالي شامل الضريبة", "Total including tax"), tr("سعر الوحدة", "Unit price"), tr("التوصية", "Recommendation"), tr("الصلاحية", "Valid until"), ""], rows);
  }

  function renderContracts() {
    const rows = state.contracts.map(contract => {
      const score = riskScore(contract), renewal = new Date(`${contract.endDate}T12:00:00`);
      renewal.setDate(renewal.getDate() - Number(contract.noticeDays || 0));
      return `<tr><td><b>${escape(contract.name)}</b><small>${escape(contract.building)}</small></td><td>${escape(supplier(contract.supplierId)?.name || "—")}</td><td class="money">${money(contract.value)}</td><td>${date(contract.endDate)}</td><td>${date(renewal.toISOString().slice(0,10))}</td><td><span class="badge ${riskLevel(score)}">${riskLabel(score)} ${score}</span></td><td>${escape(contract.risk || tr("لا يوجد وصف", "No description"))}</td><td><button class="danger-button" data-delete="contracts" data-id="${contract.id}">${tr("حذف", "Delete")}</button></td></tr>`;
    });
    $("#contractTable").innerHTML = table([tr("العقد/الأصل", "Contract / asset"), tr("المورد", "Supplier"), tr("القيمة", "Value"), tr("النهاية", "End date"), tr("آخر إشعار", "Notice deadline"), tr("الخطر", "Risk"), tr("الملاحظة", "Note"), ""], rows);
  }

  function renderDecisions() {
    const rows = [...state.decisions].reverse().map(item => `<tr><td>${date(item.createdAt)}</td><td><b>${escape(item.subject)}</b></td><td><span class="badge">${escape(item.decision)}</span></td><td>${escape(item.approver)}</td><td>${escape(item.evidence || "—")}</td><td>${escape(item.rationale)}</td><td><button class="danger-button" data-delete="decisions" data-id="${item.id}">${tr("حذف", "Delete")}</button></td></tr>`);
    $("#decisionTable").innerHTML = table([tr("التاريخ", "Date"), tr("الموضوع", "Subject"), tr("القرار", "Decision"), tr("المعتمد", "Approver"), tr("الدليل", "Evidence"), tr("المبررات", "Rationale"), ""], rows);
  }

  function renderDocuments() {
    const rows = [...state.documents].reverse().map(item => `<tr><td>${date(item.createdAt)}</td><td><b>${escape(item.name)}</b><small>${escape(item.type)}</small></td><td>${escape(item.reference || "—")}</td><td>${escape(item.size)}</td><td><code>${escape(item.hash.slice(0,18))}…</code></td><td><span class="badge review">${tr("مسجل محليًا", "Registered locally")}</span></td><td><button class="danger-button" data-delete="documents" data-id="${item.id}">${tr("حذف", "Delete")}</button></td></tr>`);
    $("#documentTable").innerHTML = table([tr("التاريخ", "Date"), tr("الملف/النوع", "File / type"), tr("المرجع", "Reference"), tr("الحجم", "Size"), "SHA-256", tr("الحالة", "Status"), ""], rows);
  }

  function renderAudit() {
    const rows = [...state.audit].reverse().map(item => `<tr><td>${dateTime(item.at)}</td><td>${escape(item.actor)}</td><td><span class="badge">${escape(item.action)}</span></td><td>${escape(item.entity)}</td><td>${escape(item.detail || "—")}</td></tr>`);
    $("#auditTable").innerHTML = table([tr("الوقت", "Time"), tr("المنفذ", "User"), tr("الإجراء", "Action"), tr("الكيان", "Record type"), tr("التفاصيل", "Details")], rows);
  }

  function savings() {
    const groups = {};
    state.quotes.forEach(item => (groups[item.productId] ??= []).push(item));
    return Object.values(groups).filter(group => group.length > 1).map(group => {
      const sorted = group.map(item => ({item, unit:quoteUnit(item)})).sort((a, b) => a.unit - b.unit), linkedProduct = product(group[0].productId), quantity = Math.max(...group.map(item => Number(item.quantity) * Number(linkedProduct?.standardQty || 1)));
      return {name:linkedProduct?.name || "—", supplier:supplier(sorted[0].item.supplierId)?.name || "—", best:sorted[0].unit, saving:(sorted.at(-1).unit - sorted[0].unit) * quantity};
    });
  }

  function download(filename, body, type = "application/json") {
    const blob = new Blob([body], {type}), anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }
  function exportData() {
    download(`osoul-command-center-backup-${today()}.json`, JSON.stringify(state, null, 2));
    audit(tr("تصدير", "Export"), tr("نسخة احتياطية", "Backup"), today());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    toast(tr("تم تنزيل النسخة الاحتياطية", "Backup downloaded"));
  }
  function exportAudit() {
    download(`osoul-audit-${today()}.json`, JSON.stringify(state.audit, null, 2));
    toast(tr("تم تصدير سجل التدقيق", "Audit log exported"));
  }
  function exportRequests() {
    const requests = scopedRequests();
    const rows = [["Request ID","Scope","Title","Category","Priority","Status","Created At","Updated At","Closed At","Comments","URL"], ...requests.map(issue => [issue.number, scopeOf(issue), issue.title, categoryInfo(requestCategory(issue)).label, requestPriority(issue).label, statusInfo(requestStatus(issue)).label, issue.created_at, issue.updated_at, issue.closed_at || "", issue.comments || 0, issue.html_url])];
    const csv = "\uFEFF" + rows.map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    download(`osoul-dragon-requests-${today()}.csv`, csv, "text/csv;charset=utf-8");
    toast(tr("تم تصدير تقرير الطلبات", "Request report exported"));
  }

  async function registerDocument() {
    const file = $("#documentFile").files[0];
    if (!file) { toast(tr("اختر ملفًا أولًا", "Choose a file first")); return; }
    if (file.size > 25 * 1024 * 1024) { toast(tr("الحد الأقصى لحساب البصمة محليًا هو 25 MB", "The maximum file size for local fingerprinting is 25 MB")); return; }
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
    state.documents.push({id:uid(), name:file.name, type:$("#documentType").value, reference:$("#documentReference").value, size:`${(file.size / 1024).toFixed(1)} KB`, mime:file.type, hash, createdAt:today()});
    $("#documentFile").value = "";
    $("#documentReference").value = "";
    save(tr("تم تسجيل المستند وبصمته", "Document and fingerprint registered"), {action:tr("إنشاء", "Create"), entity:tr("مستند", "Document"), detail:file.name});
  }

  function submitDragonRequest(form) {
    const data = Object.fromEntries(new FormData(form));
    if (data.publicDataConsent !== "yes") {
      toast(tr("يلزم تأكيد خلو الطلب من البيانات الحساسة", "Confirm that the request contains no sensitive data"));
      return;
    }
    const categories = {strategy:tr("استراتيجية", "Strategy"), client:tr("عميل", "Client"), compliance:tr("امتثال", "Compliance"), safety:tr("سلامة", "Safety"), partnership:tr("شراكة", "Partnership"), general:tr("عام", "General")};
    const priorities = {normal:tr("عادية", "Normal"), high:tr("مرتفعة", "High"), urgent:tr("عاجلة", "Urgent")};
    const title = `[${categories[data.category]}] ${data.title.trim()}`;
    const body = `## ${tr("ملخص الطلب", "Request summary")}\n${data.details.trim()}\n\n## ${tr("المخرج المطلوب", "Required deliverable")}\n${data.deliverable.trim()}\n\n## ${tr("بيانات التحكم", "Request parameters")}\n- ${tr("المسار", "Category")}: ${categories[data.category]}\n- ${tr("الأولوية", "Priority")}: ${priorities[data.priority]}\n- ${tr("الموعد المستهدف", "Target date")}: ${data.dueDate || tr("غير محدد", "Not specified")}\n- ${tr("مصدر الطلب", "Source")}: Osoul Command Center v${APP_VERSION}\n- ${tr("تصنيف البيانات: عام / منزوع الحساسية", "Data classification: public / anonymised")}\n\n## ${tr("ضوابط التنفيذ", "Delivery instructions")}\n- ${tr("افصل الحقائق عن الافتراضات.", "Distinguish facts from assumptions.")}\n- ${tr("لا تدّع تنفيذ أي إجراء خارجي دون دليل.", "Verify external actions before reporting them as complete.")}\n- ${tr("وضّح أي معلومات ناقصة أو قرارات تحتاج اعتمادًا.", "Identify missing information and decisions requiring approval.")}`;
    const url = `${DRAGON_NEW_URL}?${new URLSearchParams({title, body, labels:"dragon-task,qa"})}`;
    window.open(url, "_blank", "noopener");
    form.closest("dialog").close();
    form.reset();
    toast(tr("تم تجهيز الطلب التجريبي العام — راجعه قبل الإرسال", "Public pilot request prepared. Review it before publishing."));
  }

  const validateBackup = parsed => {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const allowed = ["suppliers", "products", "quotes", "contracts", "decisions", "documents", "audit"];
    const clean = blank();
    for (const key of allowed) {
      if (!Array.isArray(parsed[key]) || parsed[key].length > 10000) return null;
      clean[key] = parsed[key].filter(item => item && typeof item === "object" && !Array.isArray(item));
    }
    return clean;
  };

  const canDelete = (collection, id) => {
    if (collection === "suppliers") {
      const linked = state.products.some(item => item.supplierId === id) || state.quotes.some(item => item.supplierId === id) || state.contracts.some(item => item.supplierId === id);
      if (linked) return tr("لا يمكن حذف مورد مرتبط بمنتج أو عرض أو عقد", "This supplier has a linked product, quote or contract and cannot be deleted");
    }
    if (collection === "products" && state.quotes.some(item => item.productId === id)) return tr("لا يمكن حذف منتج مرتبط بعرض سعر", "This product has a linked quote and cannot be deleted");
    return "";
  };

  function handleForm(form) {
    const data = Object.fromEntries(new FormData(form)), kind = form.dataset.form;
    if (kind === "request") { submitDragonRequest(form); return; }
    if (kind === "supplier") state.suppliers.push({id:uid(), ...data});
    if (kind === "product") state.products.push({id:uid(), ...data, packPrice:+data.packPrice, standardQty:+data.standardQty, moq:+data.moq});
    if (kind === "quote") state.quotes.push({id:uid(), ...data, quantity:+data.quantity, packPrice:+data.packPrice, discount:+data.discount, delivery:+data.delivery, taxRate:+data.taxRate});
    if (kind === "contract") state.contracts.push({id:uid(), ...data, value:+data.value, noticeDays:+data.noticeDays, probability:+data.probability, impact:+data.impact, status:"open"});
    if (kind === "decision") state.decisions.push({id:uid(), ...data, createdAt:today()});
    form.closest("dialog").close();
    form.reset();
    save(tr("تم حفظ السجل", "Record saved"), {action:tr("إنشاء", "Create"), entity:kind, detail:data.name || data.subject || data.sku || ""});
  }

  function activateView(name) {
    const target = $(`#view-${name}`), nav = $(`[data-view="${name}"]`);
    if (!target || !nav) return;
    $$(".nav-item,.view").forEach(element => element.classList.remove("active"));
    nav.classList.add("active");
    target.classList.add("active");
    history.replaceState(null, "", `#${name}`);
    window.scrollTo({top:0, behavior:"smooth"});
  }

  document.addEventListener("click", event => {
    if (event.target.closest("[data-action=reviewQueue]")) {
      $("[data-filter=requestScope]").value = "queue";
      renderRequests();
      activateView("requests");
      $("#attentionList").scrollIntoView({block:"center"});
    }
    const nav = event.target.closest("[data-view]");
    if (nav) activateView(nav.dataset.view);
    const opener = event.target.closest("[data-open]");
    if (opener) document.getElementById(opener.dataset.open).showModal();
    const requestTrigger = event.target.closest("[data-request-number]");
    if (requestTrigger) openRequestDetail(requestTrigger.dataset.requestNumber);
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "seed" && confirm(tr("سيتم استبدال البيانات التجارية الحالية ببيانات تجريبية. متابعة؟", "Replace the current procurement records with sample data?"))) seed();
    if (action === "export") exportData();
    if (action === "exportAudit") exportAudit();
    if (action === "exportRequests") exportRequests();
    if (action === "refreshDragon") loadDragon({force:true});
    if (action === "registerDocument") registerDocument();
    if (action === "copyLatestResponse") copyLatestResponse();
    if (action === "closeRequestDetail") $("#requestDetailDialog").close();
    if (action === "reset" && confirm(tr("حذف جميع البيانات التجارية المحلية من هذا الجهاز؟", "Delete all local procurement data from this device?"))) { state = blank(); save(tr("تم مسح البيانات", "Local records cleared"), {action:tr("مسح", "Clear"), entity:tr("قاعدة الجهاز", "Local database")}); }
    const deleteButton = event.target.closest("[data-delete]");
    if (deleteButton && confirm(tr("حذف هذا السجل؟", "Delete this record?"))) {
      const blocker = canDelete(deleteButton.dataset.delete, deleteButton.dataset.id);
      if (blocker) { toast(blocker); return; }
      state[deleteButton.dataset.delete] = state[deleteButton.dataset.delete].filter(item => item.id !== deleteButton.dataset.id);
      save(tr("تم حذف السجل", "Record deleted"), {action:tr("حذف", "Delete"), entity:deleteButton.dataset.delete, detail:deleteButton.dataset.id});
    }
  });

  $$('form[data-form]').forEach(form => form.addEventListener("submit", event => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    handleForm(form);
  }));
  $$('[data-search], [data-filter]').forEach(element => element.addEventListener("input", () => {
    if (element.dataset.search === "requests" || element.dataset.filter?.startsWith("request")) renderRequests();
    else renderBusiness();
  }));
  $("#restoreFile").addEventListener("change", async event => {
    try {
      const parsed = validateBackup(JSON.parse(await event.target.files[0].text()));
      if (!parsed) throw new Error();
      state = {...blank(), ...parsed, version:13};
      save(tr("تمت استعادة النسخة", "Backup restored"), {action:tr("استعادة", "Restore"), entity:tr("نسخة احتياطية", "Backup")});
    } catch {
      toast(tr("ملف النسخة غير صالح", "Invalid backup file"));
    }
    event.target.value = "";
  });
  window.addEventListener("online", () => loadDragon({force:true, quiet:true}));
  window.addEventListener("offline", () => { dragon.error = tr("لا يوجد اتصال بالإنترنت — يتم عرض آخر نسخة محفوظة", "You are offline. Showing the last saved copy."); renderRequests(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && (!dragon.lastSync || Date.now() - new Date(dragon.lastSync).getTime() > AUTO_REFRESH_MS)) loadDragon({force:true, quiet:true});
  });

  const initialView = location.hash.slice(1);
  if (initialView && document.getElementById("view-" + initialView)) activateView(initialView);
  renderBusiness();
  renderRequests();
  loadDragon({force:true, quiet:true});
  setInterval(() => { if (document.visibilityState === "visible") loadDragon({force:true, quiet:true}); }, AUTO_REFRESH_MS);
})();
