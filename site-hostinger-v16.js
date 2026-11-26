(function () {
  "use strict";
  var CONSENT_KEY = "osoul_analytics_consent_v1";
  var LOADER_VERSION = "16";
  var HUBSPOT_PORTAL_ID = "149059794";
  var HUBSPOT_SCRIPT = "https://js-eu1.hs-scripts.com/" + HUBSPOT_PORTAL_ID + ".js";
  var GA4_MEASUREMENT_ID = "G-HY8WJ4SDCM";
  var GA4_SCRIPT = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA4_MEASUREMENT_ID);

  function safeStorageGet() {
    try { return window.localStorage.getItem(CONSENT_KEY); } catch (_) { return null; }
  }

  function safeStorageSet(value) {
    try { window.localStorage.setItem(CONSENT_KEY, value); } catch (_) {}
    document.cookie = "osoul_analytics_consent=" + encodeURIComponent(value) + "; Path=/; Max-Age=31536000; SameSite=Lax; Secure";
  }

  function safeSessionGet(key) {
    try { return window.sessionStorage.getItem(key); } catch (_) { return null; }
  }

  function safeSessionSet(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch (_) {}
  }

  function clearCompletedLeadToken() {
    var path = window.location.pathname.replace(/\/+$/, "");
    if (path !== "/thank-you" && path !== "/en/thank-you") return;
    var params = new URLSearchParams(window.location.search);
    if (params.get("submitted") !== "1") return;
    try { window.sessionStorage.removeItem("osoul_lead_submission_token_v1"); } catch (_) {}
  }

  function trackLeadSuccess() {
    var path = window.location.pathname.replace(/\/+$/, "");
    if (path !== "/thank-you" && path !== "/en/thank-you") return;
    var params = new URLSearchParams(window.location.search);
    var receipt = params.get("receipt") || "";
    if (params.get("submitted") !== "1" || !/^[a-f0-9]{16}$/.test(receipt)) return;
    var storageKey = "osoul_generate_lead_" + receipt;
    if (safeSessionGet(storageKey) === "sent") return;
    window.gtag("event", "generate_lead", {
      method: "website_form",
      language: path.indexOf("/en/") === 0 ? "en" : "ar"
    });
    safeSessionSet(storageKey, "sent");
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  function loadHubSpot() {
    if (document.getElementById("hs-script-loader")) return;
    window._hsq = window._hsq || [];
    window._hsq.push(["doNotTrack", { track: true }]);
    var script = document.createElement("script");
    script.id = "hs-script-loader";
    script.async = true;
    script.defer = true;
    script.src = HUBSPOT_SCRIPT;
    script.dataset.osoulAnalytics = "hubspot-opt-in";
    document.head.appendChild(script);
  }

  function stopHubSpot() {
    window._hsq = window._hsq || [];
    window._hsp = window._hsp || [];
    window._hsq.push(["doNotTrack"]);
    window._hsp.push(["revokeCookieConsent"]);
  }

  function loadGA4() {
    window["ga-disable-" + GA4_MEASUREMENT_ID] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("consent", "update", { analytics_storage: "granted" });
    window.gtag("config", GA4_MEASUREMENT_ID, {
      anonymize_ip: true,
      allow_google_signals: false,
      page_location: window.location.href,
      page_title: document.title
    });
    trackLeadSuccess();
    if (document.getElementById("osoul-ga4-loader")) return;
    var script = document.createElement("script");
    script.id = "osoul-ga4-loader";
    script.async = true;
    script.src = GA4_SCRIPT;
    script.dataset.osoulAnalytics = "ga4-opt-in";
    document.head.appendChild(script);
  }

  function stopGA4() {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", { analytics_storage: "denied" });
    window["ga-disable-" + GA4_MEASUREMENT_ID] = true;
  }

  function privacyCopy() {
    var english = document.documentElement.lang.toLowerCase().indexOf("en") === 0;
    return english ? {
      title: "Your privacy, your choice",
      body: "With your permission, Google Analytics and HubSpot help us improve the enquiry experience.",
      accept: "Accept analytics",
      reject: "Essential only",
      settings: "Privacy settings",
      policy: "Read the privacy notice",
      policyHref: "/en/privacy/"
    } : {
      title: "خصوصيتك بقرارك",
      body: "بموافقتك، نستخدم تحليلات Google وHubSpot لتحسين تجربة طلب الخدمة.",
      accept: "قبول التحليلات",
      reject: "الضروري فقط",
      settings: "إعدادات الخصوصية",
      policy: "اقرأ إشعار الخصوصية",
      policyHref: "/privacy/"
    };
  }

  function removeConsentPanel() {
    var panel = document.getElementById("osoul-consent-panel");
    if (panel) panel.remove();
  }

  function showConsentPanel() {
    if (document.getElementById("osoul-consent-panel")) return;
    var copy = privacyCopy();
    var panel = document.createElement("section");
    panel.id = "osoul-consent-panel";
    panel.className = "osoul-consent-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "osoul-consent-title");
    panel.innerHTML = '<div class="osoul-consent-copy"><strong id="osoul-consent-title">' + copy.title + '</strong><p>' + copy.body + '</p><a href="' + copy.policyHref + '">' + copy.policy + '</a></div><div class="osoul-consent-actions"><button type="button" data-consent="reject">' + copy.reject + '</button><button type="button" class="osoul-consent-accept" data-consent="accept">' + copy.accept + '</button></div>';
    panel.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-consent]");
      if (!button) return;
      var accepted = button.dataset.consent === "accept";
      safeStorageSet(accepted ? "accepted" : "rejected");
      if (accepted) {
        loadHubSpot();
        loadGA4();
      } else {
        stopHubSpot();
        stopGA4();
      }
      removeConsentPanel();
    });
    document.body.appendChild(panel);
    var firstButton = panel.querySelector("button");
    if (firstButton) firstButton.focus({ preventScroll: true });
  }

  function addPrivacySettingsButton() {
    if (document.querySelector("[data-osoul-privacy-settings]")) return;
    var copy = privacyCopy();
    var target = document.querySelector(".footer-bottom") || document.querySelector("footer") || document.body;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "osoul-privacy-settings";
    button.dataset.osoulPrivacySettings = "true";
    button.textContent = copy.settings;
    button.addEventListener("click", showConsentPanel);
    target.appendChild(button);
  }

  function addPrivacyDisclosure() {
    var path = window.location.pathname.replace(/\/+$/, "");
    if (path !== "/privacy" && path !== "/en/privacy") return;
    if (document.getElementById("osoul-analytics-disclosure")) return;
    var english = document.documentElement.lang.toLowerCase().indexOf("en") === 0;
    var section = document.createElement("section");
    section.id = "osoul-analytics-disclosure";
    section.className = "osoul-analytics-disclosure";
    section.innerHTML = english
      ? '<h2>Optional analytics and CRM</h2><p>After opt-in, we use HubSpot (EU data region) to measure page visits and enquiry journeys and, where non-HubSpot form capture is enabled, to associate a submitted business enquiry with its visitor journey. This can include IP address, device and browser information, viewed pages, referral source, cookie identifiers and the details you choose to submit. The purpose is service improvement, lead management and response measurement. You may reject analytics or reopen Privacy settings at any time; rejection does not affect essential site functions. Historical records and deletion requests are handled under the retention and rights sections of this notice.</p>'
      : '<h2>التحليلات الاختيارية وإدارة العملاء</h2><p>بعد الموافقة فقط، نستخدم HubSpot (منطقة بيانات أوروبية) لقياس زيارات الصفحات ومسار طلب المشروع، وعند تفعيل التقاط النماذج الخارجية يمكن ربط الطلب التجاري المرسل برحلة الزائر. قد تشمل البيانات عنوان IP ومعلومات الجهاز والمتصفح والصفحات ومصدر الإحالة ومعرّفات الارتباط والبيانات التي تختار إرسالها. الغرض هو تحسين الخدمة وإدارة العملاء المحتملين وقياس الاستجابة. يمكنك رفض التحليلات أو إعادة فتح إعدادات الخصوصية في أي وقت، ولا يؤثر الرفض في وظائف الموقع الضرورية. تخضع السجلات السابقة وطلبات المحو لأحكام الاحتفاظ والحقوق في هذا الإشعار.</p>';
    var host = document.querySelector(".osoul-prose") || document.querySelector("main") || document.body;
    host.appendChild(section);
  }

  function installProjectBriefFallback() {
    var form = document.querySelector('form[action="/submit.php"]');
    if (!form || form.dataset.osoulStepFallback === "true") return;
    var fieldsets = Array.prototype.slice.call(form.querySelectorAll("fieldset"));
    var actions = form.querySelector(".brief-actions");
    var card = form.closest(".brief-card");
    if (fieldsets.length < 3 || !actions || !card) return;

    form.dataset.osoulStepFallback = "true";
    var step = 1;
    var english = document.documentElement.lang.toLowerCase().indexOf("en") === 0;

    function value(name) {
      var field = form.elements.namedItem(name);
      return field && typeof field.value === "string" ? field.value.trim() : "";
    }

    function valid(targetStep) {
      if (targetStep === 1) return !!(value("asset_type") && value("city"));
      if (targetStep === 2) return !!(value("stage") && value("opening_target") && value("units"));
      var consent = form.elements.namedItem("consent");
      return !!(
        value("primary_gap") &&
        value("urgency") &&
        value("documents") &&
        value("requested_support") &&
        value("name") &&
        value("organization") &&
        value("email") &&
        consent &&
        consent.checked
      );
    }

    function renderActions() {
      actions.innerHTML = "";
      if (step > 1) {
        var back = document.createElement("button");
        back.className = "brief-back";
        back.type = "button";
        back.dataset.osoulStepAction = "back";
        back.textContent = english ? "Previous" : "السابق";
        actions.appendChild(back);
      }
      var primary = document.createElement("button");
      primary.className = step < 3 ? "brief-next" : "brief-submit";
      primary.type = step < 3 ? "button" : "submit";
      primary.dataset.osoulStepAction = step < 3 ? "next" : "submit";
      primary.disabled = !valid(step);
      primary.textContent = step < 3 ? (english ? "Next" : "التالي") : (english ? "Send brief" : "إرسال الموجز");
      actions.appendChild(primary);
    }

    function refresh() {
      fieldsets.forEach(function (fieldset, index) {
        fieldset.hidden = index !== step - 1;
      });
      var counter = card.querySelector(".brief-head b");
      if (counter) counter.textContent = "0" + step + " / 03";
      var progress = card.querySelector(".brief-progress");
      if (progress) progress.setAttribute("aria-label", (english ? "Step " : "الخطوة ") + step + (english ? " of 3" : " من 3"));
      card.querySelectorAll(".brief-progress i").forEach(function (item, index) {
        item.classList.toggle("active", index < step);
      });
      renderActions();
    }

    form.addEventListener("input", function (event) {
      event.stopPropagation();
      refresh();
    }, true);
    form.addEventListener("change", function (event) {
      event.stopPropagation();
      refresh();
    }, true);
    form.addEventListener("click", function (event) {
      var control = event.target.closest("[data-osoul-step-action]");
      if (!control) return;
      var action = control.dataset.osoulStepAction;
      if (action === "next") {
        event.preventDefault();
        event.stopPropagation();
        if (valid(step)) {
          step = Math.min(3, step + 1);
          refresh();
        }
      } else if (action === "back") {
        event.preventDefault();
        event.stopPropagation();
        step = Math.max(1, step - 1);
        refresh();
      }
    }, true);
    form.addEventListener("submit", function (event) {
      var complete = valid(1) && valid(2) && valid(3);
      if (!complete || !form.checkValidity()) {
        event.preventDefault();
        step = !valid(1) ? 1 : (!valid(2) ? 2 : 3);
        refresh();
        form.reportValidity();
      }
      event.stopPropagation();
    }, true);

    var emailField = form.elements.namedItem("email");
    if (emailField) {
      emailField.required = true;
      emailField.setAttribute("aria-required", "true");
    }
    var hint = form.querySelector(".form-hint");
    if (hint) hint.textContent = english ? "A professional email is required; phone is optional." : "البريد المهني مطلوب، ورقم التواصل اختياري.";
    refresh();
  }

  function installQuickEnquiry() {
    var form = document.querySelector("form[data-quick-enquiry]");
    if (!form) return;
    var submit = form.querySelector('button[type="submit"]');
    var feedback = form.querySelector(".quick-enquiry-feedback");
    var toggle = form.querySelector(".quick-enquiry-channel");
    var phone = form.elements.namedItem("phone");
    var email = form.elements.namedItem("email");
    var phoneGroup = form.querySelector("#quick-contact-phone");
    var emailGroup = form.querySelector("#quick-contact-email");
    if (!submit || !feedback || !toggle || !phone || !email || !phoneGroup || !emailGroup) return;
    var english = document.documentElement.lang.startsWith("en");
    var label = submit.textContent;
    var started = Date.now();
    var pending = false;
    var useEmail = false;
    var phoneError = english
      ? "Enter a valid mobile or WhatsApp number with 7 to 15 digits."
      : "أدخل رقم جوال أو واتساب صحيحًا من ٧ إلى ١٥ رقمًا.";
    var emailError = english ? "Enter a valid email address." : "أدخل بريدًا إلكترونيًا صحيحًا.";

    function selectChannel(emailSelected) {
      useEmail = emailSelected;
      phoneGroup.hidden = useEmail;
      phone.disabled = useEmail;
      phone.required = !useEmail;
      emailGroup.hidden = !useEmail;
      email.disabled = !useEmail;
      email.required = useEmail;
      phone.setCustomValidity("");
      toggle.textContent = useEmail
        ? (english ? "Use a mobile number instead" : "استخدم رقم الجوال بدلًا من البريد")
        : (english ? "Use email instead" : "استخدم البريد الإلكتروني بدلًا من الرقم");
    }

    function cleanPhone(value) {
      return value.replace(/[٠-٩۰-۹]/g, function (digit) {
        var code = digit.charCodeAt(0);
        return String(code - (code < 0x06F0 ? 0x0660 : 0x06F0));
      }).replace(/[\s()-]/g, "");
    }

    selectChannel(false);
    toggle.hidden = false;
    toggle.addEventListener("click", function () {
      if (pending) return;
      selectChannel(!useEmail);
      feedback.textContent = "";
      (useEmail ? email : phone).focus();
    });
    phone.addEventListener("input", function () { phone.setCustomValidity(""); });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (pending) return;
      var fields = new URLSearchParams(new FormData(form));
      if (!useEmail) {
        var number = cleanPhone(phone.value);
        if (!/^\+?[0-9]{7,15}$/.test(number)) {
          phone.setCustomValidity(phoneError);
          phone.reportValidity();
          return;
        }
        fields.set("phone", number);
      } else {
        fields.set("email", email.value.trim());
      }
      pending = true;
      submit.disabled = true;
      toggle.disabled = true;
      submit.textContent = english ? "Sending…" : "جارٍ الإرسال…";
      feedback.textContent = "";
      try {
        // Honour the existing server-side minimum form age, including autofill.
        if (Date.now() - started > 23 * 60 * 60 * 1000) started = Date.now();
        var wait = 3100 - (Date.now() - started);
        if (wait > 0) await new Promise(function (resolve) { window.setTimeout(resolve, wait); });

        var idempotency = form.elements.namedItem("idempotency_key");
        if (idempotency) fields.set("idempotency_key", idempotency.value);
        fields.set("started_at", String(started));
        var response = await fetch(form.action, {
          method: "POST",
          headers: { "Accept": "application/json" },
          body: fields
        });
        var result = await response.json();
        if (typeof result.location !== "string") throw new Error("Missing enquiry redirect");
        var next = new URL(result.location, window.location.origin);
        if (response.ok && result.received === true && next.origin === window.location.origin &&
            next.pathname === (english ? "/en/thank-you/" : "/thank-you/") &&
            next.searchParams.get("submitted") === "1" &&
            /^[a-f0-9]{16}$/.test(next.searchParams.get("receipt") || "")) {
          window.location.assign(next.href);
          return;
        }
        if (next.origin !== window.location.origin) throw new Error("Unexpected enquiry redirect");
        var status = next.searchParams.get("status");
        if (status === "rate-limit") {
          feedback.textContent = english ? "Too many attempts. Try again in 15 minutes." : "المحاولات كثيرة. أعد المحاولة بعد ١٥ دقيقة.";
        } else if (status === "phone") {
          feedback.textContent = phoneError;
          phone.focus();
        } else if (status === "email") {
          feedback.textContent = emailError;
          email.focus();
        } else if (status === "contact-required" || status === "email-required") {
          feedback.textContent = english
            ? "Enter a mobile number or switch to email."
            : "أدخل رقم جوالك أو اختر التواصل بالبريد الإلكتروني.";
          (useEmail ? email : phone).focus();
        } else if (status === "incomplete") {
          feedback.textContent = english
            ? "Enter your name, choose a service and agree to the privacy notice."
            : "أدخل اسمك، واختر الخدمة، ووافق على إشعار الخصوصية.";
        } else {
          throw new Error("Enquiry not confirmed");
        }
      } catch (_) {
        feedback.textContent = english
          ? "We couldn’t confirm receipt. Your details are still here. Please try again."
          : "تعذّر تأكيد الاستلام. بياناتك ما زالت في النموذج. أعد المحاولة.";
      }
      pending = false;
      submit.disabled = false;
      toggle.disabled = false;
      submit.textContent = label;
    });
  }

  ["/site-v13.css", "/site-v14.css?v=5"].forEach(function (href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  });
  if (!document.querySelector('script[data-osoul-enhancer="14"]')) {
    var script = document.createElement("script");
    script.src = "/site-hostinger-v13.js?v=23";
    script.defer = true;
    script.dataset.osoulEnhancer = "14";
    document.head.appendChild(script);
  }
  addPrivacySettingsButton();
  addPrivacyDisclosure();
  installProjectBriefFallback();
  installQuickEnquiry();
  clearCompletedLeadToken();
  var consent = safeStorageGet();
  var privacySignal = navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";
  if (consent === "accepted" && !privacySignal) {
    loadHubSpot();
    loadGA4();
  } else if (consent === "rejected" || privacySignal) {
    stopHubSpot();
    stopGA4();
  }
  else showConsentPanel();
})();
