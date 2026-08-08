(function () {
  "use strict";
  var CONSENT_KEY = "osoul_analytics_consent_v1";
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
      body: "With your permission, Osool Hospitality uses Google Analytics 4 and HubSpot analytics to understand visits and improve enquiries. No optional analytics loads before you accept.",
      accept: "Accept analytics",
      reject: "Essential only",
      settings: "Privacy settings",
      policy: "Read the privacy notice",
      policyHref: "/en/privacy/"
    } : {
      title: "خصوصيتك بقرارك",
      body: "بعد موافقتك فقط، تستخدم أصول الضيافة Google Analytics 4 وتحليلات HubSpot لفهم الزيارات وتحسين طلبات المشاريع. لا تُحمّل التحليلات الاختيارية قبل القبول.",
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

  ["/site-v13.css", "/site-v14.css"].forEach(function (href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  });
  if (!document.querySelector('script[data-osoul-enhancer="14"]')) {
    var script = document.createElement("script");
    script.src = "/site-hostinger-v13.js?v=14";
    script.defer = true;
    script.dataset.osoulEnhancer = "14";
    document.head.appendChild(script);
  }
  addPrivacySettingsButton();
  addPrivacyDisclosure();
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
