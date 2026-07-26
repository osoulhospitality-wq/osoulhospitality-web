(function () {
  "use strict";

  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!link || link.hasAttribute("download") || link.target === "_blank") return;
    var url;
    try { url = new URL(link.href, window.location.href); } catch { return; }
    if (url.origin !== window.location.origin || url.protocol !== window.location.protocol) return;
    if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(url.pathname + url.search + url.hash);
  }, true);

  var form = document.querySelector('form[action="/submit.php"]');
  if (form) {
    var started = document.createElement("input");
    started.type = "hidden";
    started.name = "started_at";
    started.value = String(Date.now());
    form.appendChild(started);
  }

  var params = new URLSearchParams(window.location.search);
  var status = params.get("status");
  var messages = {
    "incomplete": "بعض الحقول المطلوبة غير مكتملة. راجع الموجز ثم أعد الإرسال.",
    "contact": "أدخل بريدًا مهنيًا أو رقم تواصل واحدًا على الأقل.",
    "email": "صيغة البريد الإلكتروني غير صحيحة.",
    "phone": "صيغة رقم التواصل غير صحيحة.",
    "security": "تعذر التحقق من مصدر الطلب. أعد فتح النموذج من الموقع مباشرة.",
    "send-error": "تعذر إرسال الموجز الآن. أرسله إلى info@osoulhospitality.com أو استخدم واتساب."
  };
  if (status && messages[status]) {
    var card = document.getElementById("project-brief");
    if (card) {
      var alert = document.createElement("div");
      alert.className = "form-alert";
      alert.setAttribute("role", "alert");
      alert.textContent = messages[status];
      card.insertBefore(alert, card.firstChild);
    }
  }
})();
