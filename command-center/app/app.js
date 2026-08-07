(() => {
  "use strict";

  const APP_VERSION = "13.0.0";
  const STORAGE_KEY = "osoul-command-center-v13";
  const DRAGON_CACHE_KEY = "osoul-dragon-feed-v13";
  const DRAGON_API = "https://api.github.com/repos/osoulhospitality-wq/osoulhospitality-web/issues?state=all&labels=dragon-task&per_page=100";
  const DRAGON_ISSUE_API = "https://api.github.com/repos/osoulhospitality-wq/osoulhospitality-web/issues";
  const DRAGON_NEW_URL = "https://github.com/osoulhospitality-wq/osoulhospitality-web/issues/new";
  const AUTO_REFRESH_MS = 300000;
  const CACHE_MAX_AGE_MS = 900000;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const today = () => new Date().toISOString().slice(0, 10);
  const money = value => new Intl.NumberFormat("ar-SA", {style:"currency", currency:"SAR", maximumFractionDigits:2}).format(Number(value || 0));
  const date = value => value ? new Intl.DateTimeFormat("ar-SA", {dateStyle:"medium"}).format(new Date(value.length === 10 ? `${value}T12:00:00` : value)) : "—";
  const dateTime = value => value ? new Intl.DateTimeFormat("ar-SA", {dateStyle:"medium", timeStyle:"short"}).format(new Date(value)) : "—";
  const daysTo = value => Math.ceil((new Date(`${value}T12:00:00`) - new Date()) / 86400000);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
  const markdown = value => {
    const safe = escape(value || "لا يوجد محتوى.").replace(/\r/g, "");
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
    const cached = JSON.parse(localStorage.getItem(DRAGON_CACHE_KEY) || localStorage.getItem("osoul-dragon-feed-v12"));
    if (cached?.issues?.length) {
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
        {id:supplierA,name:"مورد ألف — تجريبي",cr:"1010XXXXXX",city:"الرياض",status:"approved",coverage:"الرياض",payment:"30 يوم"},
        {id:supplierB,name:"شركة باء — تجريبي",cr:"1011XXXXXX",city:"الرياض",status:"under_review",coverage:"الوسطى",payment:"نقدي"},
        {id:supplierC,name:"مصاعد جيم — تجريبي",cr:"1012XXXXXX",city:"الرياض",status:"approved",coverage:"المملكة",payment:"ربع سنوي"}
      ],
      products:[
        {id:productA,sku:"CLN-001",name:"منظف أرضيات مركز — تجريبي",supplierId:supplierA,category:"مواد نظافة",packPrice:92,standardQty:20,unit:"لتر",moq:5},
        {id:productB,sku:"CLN-002",name:"منظف أرضيات مركز — تجريبي",supplierId:supplierB,category:"مواد نظافة",packPrice:28,standardQty:5,unit:"لتر",moq:12}
      ],
      quotes:[
        {id:uid(),productId:productA,supplierId:supplierA,quantity:10,packPrice:92,discount:50,delivery:0,taxRate:15,validUntil:"2026-09-30"},
        {id:uid(),productId:productB,supplierId:supplierB,quantity:40,packPrice:28,discount:0,delivery:100,taxRate:15,validUntil:"2026-09-15"}
      ],
      contracts:[
        {id:uid(),name:"صيانة مصعد — تجريبي",supplierId:supplierC,building:"مبنى نموذجي",value:42000,endDate:"2026-11-30",noticeDays:90,probability:4,impact:4,risk:"قطع رئيسية مستثناة دون قائمة أسعار معتمدة",status:"open"},
        {id:uid(),name:"صيانة دورية — تجريبي",supplierId:supplierC,building:"مبنى العرض",value:36000,endDate:"2027-02-28",noticeDays:60,probability:2,impact:3,risk:"زمن الاستجابة غير محدد بدقة",status:"open"}
      ],
      decisions:[{id:uid(),subject:"عقد المصعد التجريبي",decision:"تفاوض",approver:"يزيد الجهني",evidence:"DEMO-CON-001",rationale:"إضافة مصفوفة قطع الغيار وSLA والجزاءات قبل الاعتماد",createdAt:today()}]
    };
    save("تم تحميل بيانات العرض التجريبية");
  };

  const audit = (action, entity, detail = "") => {
    state.audit ??= [];
    state.audit.push({id:uid(), at:new Date().toISOString(), actor:"يزيد الجهني — مالك", action, entity, detail});
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
  const riskLabel = score => ({critical:"حرج", high:"مرتفع", medium:"متوسط", low:"منخفض", note:"ملاحظة"}[riskLevel(score)]);
  const empty = text => `<div class="empty">${escape(text)}</div>`;
  const table = (heads, rows) => rows.length ? `<table><thead><tr>${heads.map(head => `<th>${head}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>` : empty("لا توجد سجلات بعد.");
  const statusBadge = status => {
    const map = {approved:["معتمد",""], under_review:["قيد المراجعة","review"], suspended:["موقوف","high"]};
    const item = map[status] || [status, ""];
    return `<span class="badge ${item[1]}">${item[0]}</span>`;
  };

  const labelNames = issue => (issue.labels || []).map(label => typeof label === "string" ? label : label.name);
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
    new:{label:"جديد", className:"new"},
    processing:{label:"قيد المعالجة", className:"processing"},
    completed:{label:"مكتمل", className:"completed"},
    failed:{label:"متعثر", className:"failed"},
    conflict:{label:"تعارض حالة", className:"conflict"},
    archived:{label:"مؤرشف", className:"archived"}
  }[status]);
  const isTestRequest = issue => /(?:acceptance|\be2e\b|\btest\b|\bqa\b|smoke|fixture|اختبار|تجريب)/i.test(`${issue.title} ${issue.body || ""}`) && !/\[LIVE-START/i.test(issue.title);
  const controlValue = (issue, name) => {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = (issue.body || "").match(new RegExp(`^-\\s*${escapedName}\\s*:\\s*(.+)$`, "im"));
    return match?.[1]?.trim() || "";
  };
  const requestCategory = issue => {
    const title = issue.title.toLowerCase(), text = `${issue.title} ${issue.body || ""}`.toLowerCase();
    const declared = controlValue(issue, "المسار").toLowerCase();
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
    safety:{label:"السلامة", code:"SAF"}, compliance:{label:"الامتثال", code:"COM"}, client:{label:"العملاء", code:"CLT"}, partnership:{label:"الشراكات", code:"BD"}, strategy:{label:"الاستراتيجية", code:"STR"}, general:{label:"عام", code:"GEN"}
  }[category]);
  const requestPriority = issue => {
    const text = `${issue.title} ${issue.body || ""}`.toLowerCase();
    const declared = controlValue(issue, "الأولوية").toLowerCase();
    if (/عاجل|urgent|critical/.test(declared)) return {label:"عاجل", className:"urgent", rank:3};
    if (/مرتفع|high/.test(declared)) return {label:"مرتفع", className:"high", rank:2};
    if (/عاجل|فوري|الليلة|urgent|critical|emergency/.test(text)) return {label:"عاجل", className:"urgent"};
    if (requestCategory(issue) === "safety" || /قبل التشغيل|قرب الافتتاح|قبل الافتتاح/.test(text)) return {label:"مرتفع", className:"high"};
    return {label:"عادي", className:"normal"};
  };
  const requestDueDate = issue => {
    const value = controlValue(issue, "الموعد المستهدف");
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  };
  const requestFlags = issue => {
    const status = requestStatus(issue), ageMs = Date.now() - new Date(issue.updated_at).getTime();
    const due = requestDueDate(issue);
    return {
      overdue: Boolean(due && new Date(`${due}T23:59:59`) < new Date() && !["completed", "archived"].includes(status)),
      stale: status === "processing" ? ageMs > 15 * 60 * 1000 : status === "new" ? ageMs > 60 * 60 * 1000 : false,
      conflict: status === "conflict"
    };
  };
  const cycleMilliseconds = issue => issue.closed_at ? new Date(issue.closed_at) - new Date(issue.created_at) : null;
  const duration = milliseconds => {
    if (milliseconds === null || !Number.isFinite(milliseconds)) return "—";
    const minutes = Math.max(0, Math.round(milliseconds / 60000));
    if (minutes < 60) return `${minutes} د`;
    const hours = Math.floor(minutes / 60), remaining = minutes % 60;
    if (hours < 24) return remaining ? `${hours} س ${remaining} د` : `${hours} س`;
    return `${Math.floor(hours / 24)} يوم`;
  };
  const currentRequestScope = () => $("[data-filter=requestScope]")?.value || "operational";
  const scopedRequests = () => currentRequestScope() === "all" ? dragon.issues : dragon.issues.filter(issue => !isTestRequest(issue));

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
      if (!response.ok) throw new Error(response.status === 403 ? "تم بلوغ حد التحديث المؤقت" : `تعذر جلب البيانات (${response.status})`);
      const pageRecords = await response.json();
      records.push(...pageRecords);
      if (pageRecords.length < 100) break;
    }
    return records;
  }

  async function loadDragon({force = false, quiet = false} = {}) {
    if (!navigator.onLine) {
      dragon.error = "لا يوجد اتصال بالإنترنت — يتم عرض آخر نسخة محفوظة";
      dragon.loading = false;
      renderRequests();
      return;
    }
    if (!force && dragon.lastSync && Date.now() - new Date(dragon.lastSync).getTime() < 60000) {
      renderRequests();
      return;
    }
    dragon.loading = true;
    dragon.error = "";
    renderConnection();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const issues = await fetchPages(DRAGON_API, {maxPages:5, signal:controller.signal});
      dragon.issues = issues.filter(issue => !issue.pull_request);
      dragon.lastSync = new Date().toISOString();
      localStorage.setItem(DRAGON_CACHE_KEY, JSON.stringify({savedAt:dragon.lastSync, issues:dragon.issues}));
      if (!quiet && force) toast("تم تحديث طلبات Dragon");
    } catch (error) {
      const hasFreshCache = dragon.issues.length && dragon.lastSync && Date.now() - new Date(dragon.lastSync).getTime() < CACHE_MAX_AGE_MS;
      dragon.error = `${error.name === "AbortError" ? "انتهت مهلة الاتصال" : error.message}${hasFreshCache ? " — يتم عرض آخر نسخة محفوظة" : ""}`;
    } finally {
      clearTimeout(timeout);
      dragon.loading = false;
      renderRequests();
    }
  }

  function renderConnection() {
    const stateElement = $("#systemState"), banner = $("#connectionBanner"), lastSync = $("#lastSync");
    if (dragon.loading) {
      stateElement.className = "system-state loading";
      stateElement.querySelector("span").textContent = "جاري التحديث";
    } else if (dragon.error) {
      stateElement.className = "system-state warning";
      stateElement.querySelector("span").textContent = "عرض محفوظ";
    } else {
      stateElement.className = "system-state connected";
      stateElement.querySelector("span").textContent = "Dragon متصل";
    }
    lastSync.textContent = `آخر مزامنة: ${dragon.lastSync ? dateTime(dragon.lastSync) : "—"}`;
    if (banner) {
      banner.classList.toggle("warning", Boolean(dragon.error));
      const title = banner.querySelector("b"), note = banner.querySelector("small");
      title.textContent = dragon.error ? "تعذر التحديث المباشر" : "مزامنة مباشرة مع Dragon";
      const rateWarning = Number(dragon.rateRemaining) <= 10 ? " • السعة العامة منخفضة" : "";
      note.textContent = dragon.error || `سجل عام تجريبي • تحديث كل 5 دقائق${dragon.rateRemaining ? ` • سعة الاتصال ${dragon.rateRemaining}` : ""}${rateWarning}`;
    }
  }

  function requestMetrics(requests) {
    const counts = {new:0, processing:0, completed:0, failed:0, conflict:0, archived:0};
    requests.forEach(issue => counts[requestStatus(issue)]++);
    const concluded = counts.completed + counts.failed + counts.conflict;
    const success = concluded ? Math.round(counts.completed / concluded * 100) : 0;
    const cycleValues = requests.filter(issue => requestStatus(issue) === "completed").map(cycleMilliseconds).filter(value => value !== null);
    const averageCycle = cycleValues.length ? cycleValues.reduce((total, value) => total + value, 0) / cycleValues.length : null;
    const flags = requests.map(requestFlags);
    return {counts, success, averageCycle, total:requests.length, overdue:flags.filter(flag => flag.overdue).length, stale:flags.filter(flag => flag.stale).length};
  }

  function renderRequests() {
    renderConnection();
    const requests = scopedRequests();
    const metrics = requestMetrics(requests);
    const navCount = metrics.counts.new + metrics.counts.processing + metrics.counts.failed + metrics.counts.conflict;
    $("#requestNavCount").textContent = navCount || "✓";
    $("#requestNavCount").classList.toggle("has-work", navCount > 0);
    $("#requestScopeLabel").textContent = currentRequestScope() === "all" ? "جميع الطلبات والاختبارات" : "الطلبات التشغيلية";

    $("#requestKpis").innerHTML = [
      {label:"إجمالي الطلبات", value:metrics.total, note:"ضمن النطاق المحدد", className:"neutral"},
      {label:"تحت العمل", value:metrics.counts.new + metrics.counts.processing, note:`${metrics.counts.new} جديد • ${metrics.counts.processing} معالجة`, className:"processing"},
      {label:"مكتملة حاليًا", value:metrics.counts.completed, note:"وفق آخر حالة ظاهرة", className:"completed"},
      {label:"تحتاج تدخلًا", value:metrics.counts.failed + metrics.counts.conflict + metrics.overdue + metrics.stale, note:`${metrics.counts.failed} فشل • ${metrics.counts.conflict} تعارض • ${metrics.overdue} متأخر`, className:(metrics.counts.failed + metrics.counts.conflict + metrics.overdue + metrics.stale) ? "failed" : "completed"},
      {label:"نسبة نجاح الحالة النهائية", value:`${metrics.success}%`, note:"لا تشمل محاولات الفشل التاريخية", className:"gold"},
      {label:"متوسط مدة الإغلاق", value:duration(metrics.averageCycle), note:"إنشاء GitHub ← إغلاقه", className:"neutral"}
    ].map(item => `<article class="request-kpi ${item.className}"><small>${item.label}</small><b>${item.value}</b><span>${item.note}</span></article>`).join("");

    const statusOrder = ["completed", "processing", "new", "failed", "conflict", "archived"];
    const statusRows = statusOrder.filter(status => metrics.counts[status]).map(status => {
      const info = statusInfo(status), percent = metrics.total ? Math.round(metrics.counts[status] / metrics.total * 100) : 0;
      return `<div class="health-row"><span><i class="status-dot ${info.className}"></i>${info.label}</span><div class="health-track"><i class="${info.className}" style="width:${percent}%"></i></div><b>${metrics.counts[status]}</b></div>`;
    }).join("");
    const categories = ["strategy", "client", "compliance", "safety", "partnership", "general"].map(category => ({category, count:requests.filter(issue => requestCategory(issue) === category).length})).filter(item => item.count);
    $("#deliveryHealth").innerHTML = metrics.total ? `<div class="success-gauge" style="--success:${metrics.success}"><div><b>${metrics.success}%</b><span>نجاح</span></div></div><div class="health-breakdown">${statusRows}</div><div class="category-pills">${categories.map(item => `<span>${categoryInfo(item.category).label}<b>${item.count}</b></span>`).join("")}</div>` : empty("لم تصل طلبات تشغيلية بعد.");

    const attention = requests.filter(issue => ["failed", "processing", "new", "conflict"].includes(requestStatus(issue)) || requestFlags(issue).overdue || requestFlags(issue).stale).sort((a, b) => {
      const order = {conflict:0, failed:1, processing:2, new:3};
      return (order[requestStatus(a)] ?? 4) - (order[requestStatus(b)] ?? 4) || new Date(a.created_at) - new Date(b.created_at);
    }).slice(0, 5);
    $("#attentionList").innerHTML = attention.length ? attention.map(issue => {
      const status = statusInfo(requestStatus(issue));
      const flags = requestFlags(issue);
      const flagText = flags.overdue ? " • تجاوز الموعد" : flags.stale ? " • متوقف عن التحديث" : "";
      return `<button class="attention-row" type="button" data-request-number="${issue.number}"><span class="status-dot ${status.className}"></span><div><b>#${issue.number} ${escape(issue.title)}</b><small>${status.label}${flagText} • آخر تحديث ${dateTime(issue.updated_at)}</small></div><em>←</em></button>`;
    }).join("") : `<div class="all-clear"><span>✓</span><div><b>لا توجد حالات تحتاج تدخلك</b><small>كل الطلبات التشغيلية في حالة نهائية سليمة.</small></div></div>`;

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
    $("#recordCount").textContent = `${visible.length} من ${requests.length}`;
    if (dragon.loading && !dragon.issues.length) {
      $("#requestTable").innerHTML = `<div class="loading-state"><span></span><b>جاري تحميل طلبات Dragon…</b></div>`;
      return;
    }
    const rows = visible.map(issue => {
      const status = statusInfo(requestStatus(issue)), category = categoryInfo(requestCategory(issue)), priority = requestPriority(issue);
      const flags = requestFlags(issue);
      return `<tr class="${flags.overdue || flags.stale || flags.conflict ? "needs-attention" : ""}">
        <td><span class="request-id">#${issue.number}</span></td>
        <td><button class="request-title" type="button" data-request-number="${issue.number}"><b>${escape(issue.title.replace(/^\[LIVE-START \d+\]\s*/i, ""))}</b><small>${escape((issue.body || "").replace(/\s+/g, " ").slice(0, 105))}${(issue.body || "").length > 105 ? "…" : ""}</small></button></td>
        <td><span class="category-badge"><i>${category.code}</i>${category.label}</span></td>
        <td><span class="priority ${priority.className}">${priority.label}</span></td>
        <td><span class="request-status ${status.className}"><i></i>${status.label}</span></td>
        <td><span class="comment-count">${issue.comments || 0} رد</span></td>
        <td><span class="updated-time">${dateTime(issue.updated_at)}</span></td>
        <td><button class="row-action" type="button" data-request-number="${issue.number}" aria-label="عرض الطلب رقم ${issue.number}">عرض</button></td>
      </tr>`;
    });
    $("#requestTable").innerHTML = visible.length ? table(["الرقم", "الطلب", "المسار", "الأولوية", "الحالة", "التواصل", "آخر تحديث", ""], rows) : empty("لا توجد طلبات مطابقة للفلاتر الحالية.");
  }

  async function openRequestDetail(number) {
    const issue = dragon.issues.find(item => item.number === Number(number));
    if (!issue) return;
    dragon.selectedNumber = issue.number;
    renderRequestDetail(issue);
    $("#requestDetailDialog").showModal();
    if (dragon.comments.has(issue.number)) return;
    $("#detailThread").innerHTML = `<div class="loading-state compact"><span></span><b>جاري تحميل الردود…</b></div>`;
    try {
      dragon.comments.set(issue.number, await fetchPages(`${DRAGON_ISSUE_API}/${issue.number}/comments?per_page=100`, {maxPages:5}));
    } catch (error) {
      dragon.comments.set(issue.number, {error:error.message});
    }
    renderRequestDetail(issue);
  }

  function renderRequestDetail(issue) {
    const status = statusInfo(requestStatus(issue)), category = categoryInfo(requestCategory(issue)), priority = requestPriority(issue);
    $("#detailHeading").innerHTML = `<small>DRAGON REQUEST #${issue.number}</small><h2>${escape(issue.title.replace(/^\[LIVE-START \d+\]\s*/i, ""))}</h2>`;
    $("#detailMeta").innerHTML = `<span class="request-status ${status.className}"><i></i>${status.label}</span><span class="category-badge"><i>${category.code}</i>${category.label}</span><span class="priority ${priority.className}">${priority.label}</span><span>أُنشئ ${dateTime(issue.created_at)}</span><span>دورة الطلب ${duration(cycleMilliseconds(issue))}</span>`;
    $("#detailRequest").innerHTML = markdown(issue.body);
    $("#detailGithubLink").href = issue.html_url;
    const thread = dragon.comments.get(issue.number);
    if (!thread) {
      $("#threadCount").textContent = `${issue.comments || 0} رد`;
      return;
    }
    if (thread.error) {
      $("#detailThread").innerHTML = `<div class="empty">${escape(thread.error)}. يمكنك فتح سجل المصدر من الزر أدناه.</div>`;
      return;
    }
    $("#threadCount").textContent = `${thread.length} رد`;
    $("#detailThread").innerHTML = thread.length ? thread.map((comment, index) => `<article class="thread-item ${index === thread.length - 1 ? "latest" : ""}"><header><div><span class="avatar">${escape((comment.user?.login || "D").slice(0, 1).toUpperCase())}</span><b>${escape(comment.user?.login || "Dragon")}</b>${index === thread.length - 1 ? '<em>أحدث رد</em>' : ""}</div><time>${dateTime(comment.created_at)}</time></header><div class="thread-content" dir="auto">${markdown(comment.body)}</div></article>`).join("") : empty("لا توجد ردود بعد.");
    const copyButton = $("#copyLatestResponse");
    if (copyButton) copyButton.disabled = !thread.length;
  }

  async function copyLatestResponse() {
    const thread = dragon.comments.get(dragon.selectedNumber);
    if (!Array.isArray(thread) || !thread.length) return toast("لا يوجد رد جاهز للنسخ");
    const latestDelivery = [...thread].reverse().find(comment => /Dragon delivery/i.test(comment.body || "")) || thread.at(-1);
    try {
      await navigator.clipboard.writeText(latestDelivery.body || "");
      toast("تم نسخ أحدث مخرج");
    } catch {
      toast("تعذر النسخ من هذا المتصفح");
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
      element.innerHTML = `<option value="">اختر المورد</option>${state.suppliers.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join("")}`;
      element.value = oldValue;
    });
    $$('[data-options="products"]').forEach(element => {
      const oldValue = element.value;
      element.innerHTML = `<option value="">اختر المنتج</option>${state.products.map(item => `<option value="${item.id}">${escape(item.name)} — ${escape(item.sku)}</option>`).join("")}`;
      element.value = oldValue;
    });
  }

  function renderDashboard() {
    const expired = state.contracts.filter(contract => daysTo(contract.endDate) < 0);
    const expiring = state.contracts.filter(contract => daysTo(contract.endDate) >= 0 && daysTo(contract.endDate) <= 120).sort((a, b) => a.endDate.localeCompare(b.endDate));
    const risks = state.contracts.filter(contract => riskScore(contract) >= 6).sort((a, b) => riskScore(b) - riskScore(a));
    const potential = savings().reduce((total, item) => total + item.saving, 0);
    $("#kpis").innerHTML = [
      ["الموردون المعتمدون", state.suppliers.filter(item => item.status === "approved").length, `من أصل ${state.suppliers.length}`],
      ["بنود الأسعار", state.products.length, "Product Master"],
      ["عقود تستحق ≤120 يوم", expiring.length + expired.length, expired.length ? `${expired.length} منتهية • ${expiring.length} قادمة` : "تحتاج مراجعة مبكرة"],
      ["توفير محتمل", money(potential), "غير محقق حتى الاعتماد"]
    ].map(item => `<article class="kpi"><small>${item[0]}</small><b>${item[1]}</b><span>${item[2]}</span></article>`).join("");
    const watchedContracts = [...expired, ...expiring];
    $("#expiryList").innerHTML = watchedContracts.length ? watchedContracts.map(contract => {
      const remaining = daysTo(contract.endDate);
      return `<div class="list-row"><div><b>${escape(contract.name)}</b><small>${escape(contract.building)} • ${escape(supplier(contract.supplierId)?.name || "—")}</small></div><span class="badge ${remaining < 60 ? "high" : "medium"}">${remaining < 0 ? `منتهي منذ ${Math.abs(remaining)} يوم` : `${remaining} يوم`}</span></div>`;
    }).join("") : empty("لا توجد عقود قريبة.");
    $("#riskList").innerHTML = risks.length ? risks.map(contract => `<div class="list-row"><div><b>${escape(contract.risk || contract.name)}</b><small>${escape(contract.name)} • الإجراء: مراجعة المختص</small></div><span class="badge ${riskLevel(riskScore(contract))}">${riskLabel(riskScore(contract))} ${riskScore(contract)}</span></div>`).join("") : empty("لا توجد مخاطر مفتوحة.");
    const savingRows = savings();
    $("#savingList").innerHTML = table(["المنتج", "أفضل مورد", "سعر الوحدة", "التوفير المحتمل"], savingRows.map(item => `<tr><td>${escape(item.name)}</td><td>${escape(item.supplier)}</td><td class="money">${money(item.best)}</td><td class="money positive">${money(item.saving)}</td></tr>`));
  }

  function renderSuppliers() {
    const query = ($('[data-search="suppliers"]')?.value || "").toLowerCase(), filter = $('[data-filter="supplierStatus"]')?.value || "";
    const rows = state.suppliers.filter(item => (!filter || item.status === filter) && [item.name,item.cr,item.city].join(" ").toLowerCase().includes(query)).map(item => `<tr><td><b>${escape(item.name)}</b></td><td>${escape(item.cr || "—")}</td><td>${escape(item.city || "—")}</td><td>${escape(item.coverage || "—")}</td><td>${escape(item.payment || "—")}</td><td>${statusBadge(item.status)}</td><td><button class="danger-button" data-delete="suppliers" data-id="${item.id}">حذف</button></td></tr>`);
    $("#supplierTable").innerHTML = table(["المورد", "السجل", "المدينة", "التغطية", "الدفع", "الحالة", ""], rows);
  }

  function renderProducts() {
    const query = ($('[data-search="products"]')?.value || "").toLowerCase();
    const rows = state.products.filter(item => [item.name,item.sku,supplier(item.supplierId)?.name].join(" ").toLowerCase().includes(query)).map(item => `<tr><td><b>${escape(item.sku)}</b></td><td>${escape(item.name)}</td><td>${escape(supplier(item.supplierId)?.name || "—")}</td><td class="money">${money(item.packPrice)}</td><td>${escape(item.standardQty)} ${escape(item.unit)}</td><td class="money"><b>${money(normalizedProductPrice(item))}</b> / ${escape(item.unit)}</td><td>${escape(item.moq)}</td><td><button class="danger-button" data-delete="products" data-id="${item.id}">حذف</button></td></tr>`);
    $("#productTable").innerHTML = table(["SKU", "المنتج", "المورد", "العبوة", "الكمية القياسية", "سعر الوحدة", "MOQ", ""], rows);
  }

  function renderQuotes() {
    const grouped = {};
    state.quotes.forEach(item => (grouped[item.productId] ??= []).push(item));
    const rows = Object.values(grouped).flatMap(group => {
      const best = Math.min(...group.map(quoteUnit));
      return group.sort((a, b) => quoteUnit(a) - quoteUnit(b)).map(item => {
        const linkedProduct = product(item.productId), unit = quoteUnit(item);
        return `<tr><td>${escape(linkedProduct?.name || "منتج محذوف")}</td><td>${escape(supplier(item.supplierId)?.name || "—")}</td><td>${item.quantity}</td><td class="money">${money(quoteTotal(item))}</td><td class="money"><b>${money(unit)}</b> / ${escape(linkedProduct?.unit || "وحدة")}</td><td>${unit === best ? '<span class="badge">الأفضل سعريًا</span>' : '<span class="badge review">راجع الجودة</span>'}</td><td>${date(item.validUntil)}</td><td><button class="danger-button" data-delete="quotes" data-id="${item.id}">حذف</button></td></tr>`;
      });
    });
    $("#quoteTable").innerHTML = table(["المنتج", "المورد", "الكمية", "الإجمالي شامل الضريبة", "سعر الوحدة", "التوصية", "الصلاحية", ""], rows);
  }

  function renderContracts() {
    const rows = state.contracts.map(contract => {
      const score = riskScore(contract), renewal = new Date(`${contract.endDate}T12:00:00`);
      renewal.setDate(renewal.getDate() - Number(contract.noticeDays || 0));
      return `<tr><td><b>${escape(contract.name)}</b><small>${escape(contract.building)}</small></td><td>${escape(supplier(contract.supplierId)?.name || "—")}</td><td class="money">${money(contract.value)}</td><td>${date(contract.endDate)}</td><td>${date(renewal.toISOString().slice(0,10))}</td><td><span class="badge ${riskLevel(score)}">${riskLabel(score)} ${score}</span></td><td>${escape(contract.risk || "لا يوجد وصف")}</td><td><button class="danger-button" data-delete="contracts" data-id="${contract.id}">حذف</button></td></tr>`;
    });
    $("#contractTable").innerHTML = table(["العقد/الأصل", "المورد", "القيمة", "النهاية", "آخر إشعار", "الخطر", "الملاحظة", ""], rows);
  }

  function renderDecisions() {
    const rows = [...state.decisions].reverse().map(item => `<tr><td>${date(item.createdAt)}</td><td><b>${escape(item.subject)}</b></td><td><span class="badge">${escape(item.decision)}</span></td><td>${escape(item.approver)}</td><td>${escape(item.evidence || "—")}</td><td>${escape(item.rationale)}</td><td><button class="danger-button" data-delete="decisions" data-id="${item.id}">حذف</button></td></tr>`);
    $("#decisionTable").innerHTML = table(["التاريخ", "الموضوع", "القرار", "المعتمد", "الدليل", "المبررات", ""], rows);
  }

  function renderDocuments() {
    const rows = [...state.documents].reverse().map(item => `<tr><td>${date(item.createdAt)}</td><td><b>${escape(item.name)}</b><small>${escape(item.type)}</small></td><td>${escape(item.reference || "—")}</td><td>${escape(item.size)}</td><td><code>${escape(item.hash.slice(0,18))}…</code></td><td><span class="badge review">مسجل محليًا</span></td><td><button class="danger-button" data-delete="documents" data-id="${item.id}">حذف</button></td></tr>`);
    $("#documentTable").innerHTML = table(["التاريخ", "الملف/النوع", "المرجع", "الحجم", "SHA-256", "الحالة", ""], rows);
  }

  function renderAudit() {
    const rows = [...state.audit].reverse().map(item => `<tr><td>${dateTime(item.at)}</td><td>${escape(item.actor)}</td><td><span class="badge">${escape(item.action)}</span></td><td>${escape(item.entity)}</td><td>${escape(item.detail || "—")}</td></tr>`);
    $("#auditTable").innerHTML = table(["الوقت", "المنفذ", "الإجراء", "الكيان", "التفاصيل"], rows);
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
    audit("تصدير", "نسخة احتياطية", today());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    toast("تم تنزيل النسخة الاحتياطية");
  }
  function exportAudit() {
    download(`osoul-audit-${today()}.json`, JSON.stringify(state.audit, null, 2));
    toast("تم تصدير سجل التدقيق");
  }
  function exportRequests() {
    const requests = scopedRequests();
    const rows = [["Request ID","Title","Category","Priority","Status","Created At","Updated At","Closed At","Comments","URL"], ...requests.map(issue => [issue.number, issue.title, categoryInfo(requestCategory(issue)).label, requestPriority(issue).label, statusInfo(requestStatus(issue)).label, issue.created_at, issue.updated_at, issue.closed_at || "", issue.comments || 0, issue.html_url])];
    const csv = "\uFEFF" + rows.map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    download(`osoul-dragon-requests-${today()}.csv`, csv, "text/csv;charset=utf-8");
    toast("تم تصدير تقرير الطلبات");
  }

  async function registerDocument() {
    const file = $("#documentFile").files[0];
    if (!file) { toast("اختر ملفًا أولًا"); return; }
    if (file.size > 25 * 1024 * 1024) { toast("الحد الأقصى لحساب البصمة محليًا هو 25 MB"); return; }
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
    state.documents.push({id:uid(), name:file.name, type:$("#documentType").value, reference:$("#documentReference").value, size:`${(file.size / 1024).toFixed(1)} KB`, mime:file.type, hash, createdAt:today()});
    $("#documentFile").value = "";
    $("#documentReference").value = "";
    save("تم تسجيل المستند وبصمته", {action:"إنشاء", entity:"مستند", detail:file.name});
  }

  function submitDragonRequest(form) {
    const data = Object.fromEntries(new FormData(form));
    if (data.publicDataConsent !== "yes") {
      toast("يلزم تأكيد خلو الطلب من البيانات الحساسة");
      return;
    }
    const categories = {strategy:"استراتيجية", client:"عميل", compliance:"امتثال", safety:"سلامة", partnership:"شراكة", general:"عام"};
    const priorities = {normal:"عادية", high:"مرتفعة", urgent:"عاجلة"};
    const title = `[${categories[data.category]}] ${data.title.trim()}`;
    const body = `## ملخص الطلب\n${data.details.trim()}\n\n## المخرج المطلوب\n${data.deliverable.trim()}\n\n## بيانات التحكم\n- المسار: ${categories[data.category]}\n- الأولوية: ${priorities[data.priority]}\n- الموعد المستهدف: ${data.dueDate || "غير محدد"}\n- مصدر الطلب: Osoul Command Center v${APP_VERSION}\n- تصنيف البيانات: عام / منزوع الحساسية\n\n## ضوابط التنفيذ\n- افصل الحقائق عن الافتراضات.\n- لا تدّع تنفيذ أي إجراء خارجي دون دليل.\n- وضّح أي معلومات ناقصة أو قرارات تحتاج اعتمادًا.`;
    const url = `${DRAGON_NEW_URL}?${new URLSearchParams({title, body, labels:"dragon-task"})}`;
    window.open(url, "_blank", "noopener");
    form.closest("dialog").close();
    form.reset();
    toast("تم تجهيز الطلب التجريبي العام — راجعه قبل الإرسال");
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
      if (linked) return "لا يمكن حذف مورد مرتبط بمنتج أو عرض أو عقد";
    }
    if (collection === "products" && state.quotes.some(item => item.productId === id)) return "لا يمكن حذف منتج مرتبط بعرض سعر";
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
    save("تم حفظ السجل", {action:"إنشاء", entity:kind, detail:data.name || data.subject || data.sku || ""});
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
    const nav = event.target.closest("[data-view]");
    if (nav) activateView(nav.dataset.view);
    const opener = event.target.closest("[data-open]");
    if (opener) document.getElementById(opener.dataset.open).showModal();
    const requestTrigger = event.target.closest("[data-request-number]");
    if (requestTrigger) openRequestDetail(requestTrigger.dataset.requestNumber);
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "seed" && confirm("سيتم استبدال البيانات التجارية الحالية ببيانات تجريبية. متابعة؟")) seed();
    if (action === "export") exportData();
    if (action === "exportAudit") exportAudit();
    if (action === "exportRequests") exportRequests();
    if (action === "refreshDragon") loadDragon({force:true});
    if (action === "registerDocument") registerDocument();
    if (action === "copyLatestResponse") copyLatestResponse();
    if (action === "closeRequestDetail") $("#requestDetailDialog").close();
    if (action === "reset" && confirm("حذف جميع البيانات التجارية المحلية من هذا الجهاز؟")) { state = blank(); save("تم مسح البيانات", {action:"مسح", entity:"قاعدة الجهاز"}); }
    const deleteButton = event.target.closest("[data-delete]");
    if (deleteButton && confirm("حذف هذا السجل؟")) {
      const blocker = canDelete(deleteButton.dataset.delete, deleteButton.dataset.id);
      if (blocker) { toast(blocker); return; }
      state[deleteButton.dataset.delete] = state[deleteButton.dataset.delete].filter(item => item.id !== deleteButton.dataset.id);
      save("تم حذف السجل", {action:"حذف", entity:deleteButton.dataset.delete, detail:deleteButton.dataset.id});
    }
  });

  $$('form[data-form]').forEach(form => form.addEventListener("submit", event => { event.preventDefault(); handleForm(form); }));
  $$('[data-search], [data-filter]').forEach(element => element.addEventListener("input", () => {
    if (element.dataset.search === "requests" || element.dataset.filter?.startsWith("request")) renderRequests();
    else renderBusiness();
  }));
  $("#restoreFile").addEventListener("change", async event => {
    try {
      const parsed = validateBackup(JSON.parse(await event.target.files[0].text()));
      if (!parsed) throw new Error();
      state = {...blank(), ...parsed, version:13};
      save("تمت استعادة النسخة", {action:"استعادة", entity:"نسخة احتياطية"});
    } catch {
      toast("ملف النسخة غير صالح");
    }
    event.target.value = "";
  });
  window.addEventListener("online", () => loadDragon({force:true, quiet:true}));
  window.addEventListener("offline", () => { dragon.error = "لا يوجد اتصال بالإنترنت — يتم عرض آخر نسخة محفوظة"; renderRequests(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && (!dragon.lastSync || Date.now() - new Date(dragon.lastSync).getTime() > AUTO_REFRESH_MS)) loadDragon({force:true, quiet:true});
  });

  const initialView = location.hash.slice(1);
  if (initialView && $(`#view-${initialView}`)) activateView(initialView);
  renderBusiness();
  renderRequests();
  loadDragon({quiet:true});
  setInterval(() => { if (document.visibilityState === "visible") loadDragon({force:true, quiet:true}); }, AUTO_REFRESH_MS);
})();
