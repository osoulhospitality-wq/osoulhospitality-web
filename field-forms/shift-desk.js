(() => {
  "use strict";

  const closed = new Set(["completed", "closed", "cancelled"]);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  function buildRows(board) {
    const assets = new Map(board.assets.map(asset => [asset.id, asset]));
    const rows = [];
    function add(record, kind, due, title) {
      const asset = assets.get(record.asset_id);
      if (!asset) return;
      const date = typeof due === "string" && datePattern.test(due) ? due : "";
      let period = "undated";
      if (date && datePattern.test(board.today)) {
        period = date === board.today ? "today" : date < board.today ? "late" : "next";
      }
      rows.push({kind, date, period, title, asset});
    }
    for (const order of board.orders) {
      if (!closed.has(order.status)) add(order, "order", order.due_on, order.summary);
    }
    for (const plan of board.plans) {
      if (!plan.paused) add(plan, "plan", plan.next_due_on, plan.task);
    }
    return rows.sort((left, right) => (left.date || "9999").localeCompare(right.date || "9999")
      || left.asset.asset_code.localeCompare(right.asset.asset_code) || left.kind.localeCompare(right.kind));
  }

  function build(board, openAsset) {
    const rows = buildRows(board);
    const box = document.createElement("section");
    box.className = "shift-desk";
    const heading = document.createElement("h3");
    const stamp = document.createElement("p");
    const controls = document.createElement("div");
    controls.className = "shift-controls";
    const language = document.createElement("button");
    language.type = "button";
    language.className = "secondary";
    const filter = document.createElement("select");
    const type = document.createElement("select");
    const search = document.createElement("input");
    search.type = "search";
    function label(input) {
      const wrapper = document.createElement("label");
      const caption = document.createElement("span");
      wrapper.append(caption, input);
      controls.append(wrapper);
      return caption;
    }
    const periodLabel = label(filter);
    const kindLabel = label(type);
    const searchLabel = label(search);
    const summary = document.createElement("p");
    summary.setAttribute("role", "status");
    const list = document.createElement("ul");
    const more = document.createElement("button");
    more.type = "button";
    more.className = "secondary";
    box.append(heading, stamp, language, controls, summary, list, more);

    let english = document.documentElement.lang === "en";
    let limit = 12;
    const tr = (ar, en) => english ? en : ar;
    const number = n => n.toLocaleString(english ? "en" : "ar-SA");
    const periods = {
      all: ["جميع الاستحقاقات", "All due dates"], late: ["متأخر", "Overdue"],
      today: ["اليوم", "Today"], next: ["قادم", "Upcoming"], undated: ["موعد غير متاح", "Date unavailable"]
    };
    const kinds = {
      all: ["الأوامر والخطط", "Orders and plans"],
      order: ["أمر عمل", "Work order"], plan: ["خطة دورية", "Recurring plan"]
    };
    function options(select, values) {
      const previous = select.value;
      select.replaceChildren(...Object.entries(values).map(([key, words]) => new Option(tr(...words), key)));
      if (Object.hasOwn(values, previous)) select.value = previous;
    }
    function render() {
      const query = search.value.trim().toLocaleLowerCase();
      const matches = rows.filter(row => (filter.value === "all" || row.period === filter.value)
        && (type.value === "all" || row.kind === type.value)
        && [row.title, row.asset.asset_code, row.asset.name].some(value => String(value || "").toLocaleLowerCase().includes(query)));
      list.replaceChildren();
      for (const row of matches.slice(0, limit)) {
        const item = document.createElement("li");
        const title = document.createElement("strong");
        title.textContent = row.title;
        const detail = document.createElement("span");
        detail.textContent = [tr(...kinds[row.kind]), row.asset.name, row.asset.asset_code, tr(...periods[row.period]), row.date].filter(Boolean).join(" · ");
        detail.className = "shift-detail";
        detail.dataset.period = row.period;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary";
        button.textContent = tr("فتح بطاقة الأصل", "Open asset record");
        button.setAttribute("aria-label", [button.textContent, row.asset.asset_code, row.title].join(" · "));
        button.onclick = () => openAsset(row.asset.id);
        item.append(title, detail, button);
        list.append(item);
      }
      summary.textContent = matches.length
        ? tr("المعروض ", "Showing ") + number(Math.min(matches.length, limit)) + tr(" من ", " of ") + number(matches.length)
        : tr("لا توجد بنود مطابقة في السجل المقروء.", "No matching entries in the loaded record.");
      more.hidden = matches.length <= limit;
    }
    function translate() {
      box.lang = english ? "en" : "ar";
      box.dir = english ? "ltr" : "rtl";
      heading.textContent = tr("جدول أعمال المنشأة", "Facility work schedule");
      stamp.textContent = tr("خطط الصيانة وأوامر العمل المفتوحة · تاريخ السجل بتوقيت الرياض ", "Maintenance plans and open work orders · Riyadh record date ") + board.today;
      language.textContent = tr("English schedule", "الجدول بالعربية");
      language.lang = english ? "ar" : "en";
      periodLabel.textContent = tr("موعد الاستحقاق", "Due date");
      kindLabel.textContent = tr("نوع البند", "Entry type");
      searchLabel.textContent = tr("البحث بالمهمة أو اسم الأصل أو رمزه", "Search by task, asset name or code");
      more.textContent = tr("عرض المزيد", "Show more");
      options(filter, periods);
      options(type, kinds);
      render();
    }
    for (const input of [filter, type, search]) {
      input.addEventListener(input === search ? "input" : "change", () => { limit = 12; render(); });
    }
    language.onclick = () => { english = !english; translate(); };
    more.onclick = () => { limit += 12; render(); };
    translate();
    return box;
  }

  function overview(board, openAsset, singleAsset) {
    const en = document.documentElement.lang.startsWith("en");
    const text = (ar, english) => en ? english : ar;
    const number = new Intl.NumberFormat(en ? "en" : "ar-SA").format;
    const create = (tag, caption, cls) => {
      const element = document.createElement(tag);
      if (caption !== undefined) element.textContent = caption;
      if (cls) element.className = cls;
      return element;
    };
    const button = (caption, action, cls) => {
      const el = create("button", caption, cls);
      el.type = "button";
      el.onclick = action;
      return el;
    };
    const assets = new Map(board.assets.map(asset => [asset.id, asset]));
    const orders = board.orders.filter(order => assets.has(order.asset_id));
    const schedule = buildRows(board);
    const periods = [
      ["late", text("متأخرة", "Overdue"), "#c65d41"],
      ["today", text("مستحقة اليوم", "Due today"), "#b07922"],
      ["next", text("قادمة", "Upcoming"), "#367e71"],
      ["undated", text("دون موعد", "Undated"), "#8b9690"]
    ];
    const states = [
      ["open", text("مفتوحة", "Open"), "#397f72"],
      ["in_progress", text("قيد التنفيذ", "In progress"), "#c08a2d"],
      ["done", text("مكتملة", "Completed"), "#294b5a"],
      ["cancelled", text("ملغاة", "Cancelled"), "#8c928f"],
      ["other", text("حالات أخرى", "Other"), "#827396"]
    ];
    function state(order) {
      if (order.status === "completed" || order.status === "closed") return "done";
      return states.some(([key]) => key === order.status) ? order.status : "other";
    }
    const work = orders.map(order => ({
      title:order.summary, date:order.due_on, asset:assets.get(order.asset_id), state:state(order),
      kind:text("أمر عمل", "Work order")
    }));
    const due = schedule.map(row => ({...row, kind:row.kind === "order" ? text("أمر عمل","Work order") : text("خطة دورية","Recurring plan")}));
    const operator = board.can_manage && location.hash === "#decisions";
    const box = create("div", undefined, "field-visual");
    const mast = create("div", undefined, "field-mast");
    const identity = create("div");
    identity.append(create("p", operator ? text("لوحة المشغّل","Operator dashboard") : text("لوحة الفني","Technician dashboard"),"field-role"));
    const siteName = document.getElementById("site")?.selectedOptions[0]?.textContent;
    const heading = create("h2", singleAsset ? text("سجل الأصل المحدد","Selected asset") : siteName || text("المنشأة المسندة","Assigned facility"));
    identity.append(heading, create("p", text("تاريخ سجل التشغيل · الرياض","Operating record date · Riyadh") + "  " + (board.today || text("غير متاح","Unavailable"))));
    mast.append(identity);
    const chips = create("div", undefined, "field-signals");
    function signal(label, count) {
      const unit=create("div");unit.append(create("strong",number(count)),create("span",label));chips.append(unit);
    }
    signal(text("أصول في السجل","Assets on record"), assets.size);
    signal(text("خطط دورية نشطة","Active recurring plans"), board.plans.filter(p => !p.paused && assets.has(p.asset_id)).length);
    mast.append(chips);
    const grid=create("div",undefined,"field-chart-grid");
    const volume=create("article",undefined,"field-chart");
    const chartTitle=text("حالة أوامر العمل","Work order status");
    volume.append(create("h3",chartTitle));
    const volumeBody=create("div",undefined,"field-distribution");
    const ring=create("div",undefined,"field-ring");
    ring.setAttribute("aria-hidden","true");
    const center=create("div");
    center.append(create("strong",number(work.length)),create("span",text("أمر عمل","Work orders")));
    ring.append(center);
    const legend=create("div",undefined,"field-legend");
    const details=create("div",undefined,"field-trace");
    details.hidden=true;
    details.tabIndex=-1;
    function drill(title, matches) {
      details.hidden=false;
      const h=create("h3",title+" · "+number(matches.length));
      const ul=create("ul");let offset=0;
      const more=button(text("عرض المزيد","Show more"),render,"secondary");
      function render() {
        for(const entry of matches.slice(offset,offset+8)) {
          const item=create("li");
          const label=create("span");
          label.append(create("strong",entry.title || entry.asset.name),create("small",[entry.kind,entry.asset.asset_code,entry.date].filter(Boolean).join(" · ")));
          const link=button(text("سجل الأصل","Asset record"),()=>openAsset(entry.asset.id),"field-link");
          link.setAttribute("aria-label",link.textContent+" · "+entry.asset.asset_code);
          item.append(label,link);ul.append(item);
        }
        offset+=8; more.hidden=offset>=matches.length;
      }
      const close=button(text("إغلاق التفاصيل","Close details"),()=>{details.hidden=true; active?.focus();},"secondary");
      details.replaceChildren(h);
      if (!matches.length) details.append(create("p",text("لا توجد بنود مسجلة لهذه الفئة.","No recorded items in this category.")));
      details.append(ul,more,close);
      render();details.focus({preventScroll:true});details.scrollIntoView({block:"nearest"});
    }
    let active;
    function chartButton(caption, matches, color, bar=false) {
      const el=button("",()=>{active=el;drill(caption,matches);},"field-chart-button");
      el.style.setProperty("--series",color);
      const item=create("span",caption);
      const count=create("b",number(matches.length));
      el.append(item,count);
      if(bar) {
        const track=create("span",undefined,"field-bar");
        const fill=create("i");
        fill.style.width = (due.length ? 100*matches.length/due.length : 0) + "%";
        track.setAttribute("aria-hidden","true");track.append(fill);el.append(track);
      }
      return el;
    }
    let start=0;const segments=[];
    for(const [key,caption,color] of states) {
      const matches=work.filter(entry => entry.state === key);
      if(!matches.length && (key==="other"||key==="cancelled"))continue;
      legend.append(chartButton(caption,matches,color));
      const end=start+(work.length ? matches.length/work.length*100 : 0);
      if(end>start)segments.push(color+" "+start+"% "+end+"%");
      start=end;
    }
    if(segments.length>0)ring.style.background="conic-gradient("+segments.join(",")+")";
    volumeBody.append(ring,legend);volume.append(volumeBody);
    const deadlines=create("article",undefined,"field-chart");
    deadlines.append(create("h3",text("استحقاقات العمل","Work due dates")),create("p",text("الأوامر المفتوحة والخطط الدورية النشطة","Open orders and active recurring plans")));
    const bars=create("div",undefined,"field-bars");
    for(const [key,caption,color] of periods)bars.append(chartButton(caption,due.filter(row=>row.period===key),color,true));
    deadlines.append(bars);
    grid.append(volume,deadlines);
    const actions=create("nav", undefined, "field-launch");
    actions.setAttribute("aria-label",text("إجراءات الميدان","Field actions"));
    const annex = (caption,id) => actions.append(button(caption,()=>{
      const target=document.getElementById(id);
      if(!target||target.closest("[hidden]"))return;
      const toggle=target.tagName==="DETAILS" ? target : target.querySelector("details");
      if(toggle&&!toggle.open)toggle.querySelector("summary").click();
      const focus=target.querySelector("summary,h2,select");
      if(focus){focus.tabIndex=-1;focus.focus();focus.scrollIntoView({block:"start"});}
    },"field-launch-button"));
    function formAction(caption,code) {
      actions.append(button(caption,()=>{
        const search=document.getElementById("search");search.value=code;search.dispatchEvent(new Event("input"));
        const target=document.getElementById("template");
        if(target.value!==code)return;
        target.focus();target.scrollIntoView({block:"center"});
      },"field-launch-button"));
    }
    if(operator)annex(text("قرارات اليوم","Today’s decisions"),"decisions");
    formAction(text("توثيق أمر عمل","Record work order"),"F08");
    annex(text("مسح رمز الأصل","Scan asset code"),"asset-scan");
    formAction(text("نطاق عقد الخدمة","Service contract scope"),"F15");
    const history = create("div");
    history.dataset.osoulHistory = "technician";
    history.dataset.site = document.getElementById("site")?.value || "";
    history.dataset.siteLabel = siteName || "";
    history.dataset.role = operator ? "operator" : "technician";
    box.append(mast,actions,grid,details,history);
    return box;
  }

  window.OsoulShiftDesk = Object.freeze({ build, overview });
})();
