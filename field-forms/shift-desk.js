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

  window.OsoulShiftDesk = Object.freeze({ build });
})();
