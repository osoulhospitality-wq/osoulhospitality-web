import { createClient } from "@supabase/supabase-js";

const config = window.OSOUL_ENTERPRISE_CONFIG || {};
const requiredKeys = ["supabaseUrl", "supabasePublishableKey"];
const configReady = requiredKeys.every((key) => typeof config[key] === "string" && config[key].length > 10);

const views = {
  signIn: document.querySelector("#sign-in-view"),
  verify: document.querySelector("#mfa-verify-view"),
  enroll: document.querySelector("#mfa-enroll-view"),
  dashboard: document.querySelector("#dashboard-view")
};
const statusNode = document.querySelector("#app-status");
let activeFactorId = null;
let supabase = null;

function setStatus(message = "", type = "") {
  statusNode.textContent = message;
  statusNode.className = `app-status${type ? ` is-${type}` : ""}`;
}

function showView(name) {
  Object.entries(views).forEach(([key, node]) => { node.hidden = key !== name; });
}

function friendlyError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("invalid login")) return "تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور.";
  if (message.includes("expired") || message.includes("invalid totp")) return "الرمز غير صحيح أو انتهت صلاحيته. جرّب الرمز الحالي.";
  if (message.includes("rate limit")) return "محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم أعد المحاولة.";
  if (message.includes("mfa")) return "تعذر إكمال التحقق متعدد العوامل. أعد المحاولة أو تواصل مع مسؤول النظام.";
  return "تعذر إكمال العملية الآمنة. أعد المحاولة، ثم تواصل مع مسؤول النظام إذا استمرت المشكلة.";
}

function setBusy(form, busy) {
  form.querySelectorAll("button,input,select").forEach((element) => { element.disabled = busy; });
}

async function signOut() {
  setStatus("جارٍ إنهاء الجلسة…");
  await supabase.auth.signOut();
  activeFactorId = null;
  showView("signIn");
  setStatus("تم إنهاء الجلسة بأمان.", "success");
}

async function beginEnrollment() {
  const button = document.querySelector("#start-enrollment");
  button.disabled = true;
  setStatus("جارٍ إنشاء عامل تحقق جديد…");
  try {
    const listed = await supabase.auth.mfa.listFactors();
    if (listed.error) throw listed.error;
    const unverified = [...(listed.data?.totp || [])].filter((factor) => factor.status !== "verified");
    for (const factor of unverified) {
      const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (removed.error) throw removed.error;
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Osoul Command Center"
    });
    if (error) throw error;
    activeFactorId = data.id;
    document.querySelector("#totp-qr").src = data.totp.qr_code;
    document.querySelector("#totp-secret").textContent = data.totp.secret;
    document.querySelector("#enrollment-details").hidden = false;
    button.hidden = true;
    setStatus("امسح الرمز وأدخل رمز التأكيد لتفعيل MFA.", "success");
    document.querySelector("#enroll-code").focus();
  } catch (error) {
    setStatus(friendlyError(error), "error");
    button.disabled = false;
  }
}

async function verifyFactor(form, factorId) {
  const code = new FormData(form).get("code")?.toString().trim();
  if (!/^\d{6}$/.test(code || "")) {
    setStatus("أدخل رمزًا صحيحًا من 6 أرقام.", "error");
    return;
  }
  setBusy(form, true);
  setStatus("جارٍ التحقق من الرمز…");
  try {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) throw error;
    await supabase.auth.refreshSession();
    form.reset();
    setStatus("تم التحقق متعدد العوامل بنجاح.", "success");
    await routeSession();
  } catch (error) {
    setStatus(friendlyError(error), "error");
  } finally {
    setBusy(form, false);
  }
}

async function getOrganizations() {
  const { data, error } = await supabase.from("organizations").select("id,name,created_at").order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadCounts(organizationId) {
  const definitions = [
    ["suppliers", "الموردون"], ["products", "المنتجات"], ["quotes", "عروض الأسعار"],
    ["contracts", "العقود"], ["requests", "الطلبات"], ["approvals", "الاعتمادات"]
  ];
  const results = await Promise.all(definitions.map(async ([table, label]) => {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true }).eq("organization_id", organizationId);
    if (error) throw error;
    return { label, count: count || 0 };
  }));
  document.querySelector("#kpi-grid").innerHTML = results.map(({ label, count }) => `<div class="kpi"><strong>${count}</strong><span>${label}</span></div>`).join("");
}

async function showDashboard(session) {
  showView("dashboard");
  document.querySelector("#session-identity").textContent = `الحساب: ${session.user.email || "مستخدم مؤسسي"}`;
  try {
    const organizations = await getOrganizations();
    const empty = document.querySelector("#organization-empty");
    const dashboard = document.querySelector("#organization-dashboard");
    if (!organizations.length) {
      empty.hidden = false;
      dashboard.hidden = true;
      setStatus("الجلسة محمية. أنشئ مساحة المنشأة الأولى للبدء.", "success");
      return;
    }
    empty.hidden = true;
    dashboard.hidden = false;
    const select = document.querySelector("#organization-select");
    const options = organizations.map((org) => {
      const option = document.createElement("option");
      option.value = org.id;
      option.textContent = org.name;
      return option;
    });
    select.replaceChildren(...options);
    await loadCounts(select.value);
    setStatus("الجلسة محمية بـ MFA، وتم تحميل البيانات المصرح بها فقط.", "success");
  } catch (error) {
    setStatus(friendlyError(error), "error");
  }
}

async function routeSession() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    setStatus(friendlyError(sessionError), "error");
    showView("signIn");
    return;
  }
  const session = sessionData.session;
  if (!session) {
    showView("signIn");
    setStatus("الوصول بدعوة فقط؛ سجّل الدخول بحسابك المؤسسي.");
    return;
  }

  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError) {
    setStatus(friendlyError(aalError), "error");
    return;
  }
  if (aal.currentLevel === "aal2") {
    await showDashboard(session);
    return;
  }

  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError) {
    setStatus(friendlyError(factorsError), "error");
    return;
  }
  const verified = (factors.totp || []).find((factor) => factor.status === "verified");
  if (verified) {
    activeFactorId = verified.id;
    showView("verify");
    setStatus("أكمل رمز التحقق لرفع مستوى الجلسة إلى aal2.");
    document.querySelector("#mfa-code").focus();
  } else {
    showView("enroll");
    document.querySelector("#start-enrollment").hidden = false;
    document.querySelector("#start-enrollment").disabled = false;
    document.querySelector("#enrollment-details").hidden = true;
    setStatus("يلزم ربط تطبيق مصادقة قبل إتاحة بيانات العمل.");
  }
}

if (!configReady) {
  showView("signIn");
  setStatus("إعداد الاتصال الآمن غير مكتمل. تواصل مع مسؤول النظام.", "error");
} else {
  supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { headers: { "X-Client-Info": "osoul-command-center-v15" } }
  });

  document.querySelector("#sign-in-view").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(form, true);
    setStatus("جارٍ التحقق من بيانات الدخول…");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.get("email")?.toString().trim(),
        password: values.get("password")?.toString()
      });
      if (error) throw error;
      form.reset();
      await routeSession();
    } catch (error) {
      setStatus(friendlyError(error), "error");
    } finally {
      setBusy(form, false);
    }
  });

  document.querySelector("#mfa-verify-view").addEventListener("submit", (event) => {
    event.preventDefault();
    verifyFactor(event.currentTarget, activeFactorId);
  });
  document.querySelector("#mfa-enroll-form").addEventListener("submit", (event) => {
    event.preventDefault();
    verifyFactor(event.currentTarget, activeFactorId);
  });
  document.querySelector("#start-enrollment").addEventListener("click", beginEnrollment);
  document.querySelectorAll(".js-sign-out").forEach((button) => button.addEventListener("click", signOut));
  document.querySelector("#organization-select").addEventListener("change", async (event) => {
    setStatus("جارٍ تحميل مؤشرات المنشأة…");
    try {
      await loadCounts(event.currentTarget.value);
      setStatus("تم تحميل البيانات المصرح بها.", "success");
    } catch (error) {
      setStatus(friendlyError(error), "error");
    }
  });
  document.querySelector("#create-organization-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = new FormData(form).get("name")?.toString().trim();
    setBusy(form, true);
    setStatus("جارٍ إنشاء مساحة المنشأة وعزلها…");
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError || new Error("No authenticated user");
      const { error } = await supabase.from("organizations").insert({ name, created_by: userData.user.id });
      if (error) throw error;
      await showDashboard((await supabase.auth.getSession()).data.session);
    } catch (error) {
      setStatus(friendlyError(error), "error");
    } finally {
      setBusy(form, false);
    }
  });

  routeSession();
}
