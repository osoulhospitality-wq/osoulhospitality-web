import { uiText } from "./locale.js";
import { createClient } from "@supabase/supabase-js";
import { setupFacilityOperations } from "./facility-operations.js";

import { setupPerformance } from "./facility-performance.js";

import { setupContracts } from "./contracts.js";

import { setupProviderDesk } from "./provider-desk.js";
import { setupCommercialIntelligence } from "./commercial-intelligence.js";
import { setupPortfolio } from "./portfolio.js";

let providerDesk, showCommercial, showPortfolio, resetOperations;
let authEpoch=0, activeSessionId=null;
let dashboardGeneration=0;
const workspace = new URLSearchParams(location.search).get("workspace");
let showContracts;
let countsVersion = 0;
let showPerformance;
const config = window.OSOUL_ENTERPRISE_CONFIG || {};
const requiredKeys = ["supabaseUrl", "supabasePublishableKey"];
const configReady = requiredKeys.every((key) => typeof config[key] === "string" && config[key].length > 10);

const views = {
  signIn: document.querySelector("#sign-in-view"),
  recoveryRequest: document.querySelector("#recovery-request-view"),
  passwordUpdate: document.querySelector("#password-update-view"),
  verify: document.querySelector("#mfa-verify-view"),
  enroll: document.querySelector("#mfa-enroll-view"),
  provider: document.querySelector("#provider-view"),
  dashboard: document.querySelector("#dashboard-view")
};
const statusNode = document.querySelector("#app-status");
let activeFactorId = null;
let passwordUpdateUserId = null;
let supabase = null;

function setStatus(message = "", type = "") {
  statusNode.textContent = message;
  statusNode.className = `app-status${type ? ` is-${type}` : ""}`;
}

function showView(name) {
  if(name!=="provider") void providerDesk?.showProvider(false);
  if (name !== "dashboard") {
    document.getElementById("panel-search").value="";
    document.getElementById("panel-matches").replaceChildren();
    resetOperations?.();
    countsVersion++;
    dashboardGeneration++;
    providerDesk?.setOrganization("");
    showCommercial?.("");
    showPortfolio?.("");
    document.querySelector("#organization-select").replaceChildren();
    document.querySelector("#organization-dashboard").hidden=true;
    document.querySelector("#organization-empty").hidden=true;
    document.querySelector("#profile-status").textContent="";
    document.querySelector("#session-identity").textContent="";
    document.querySelector("#display-name").value="";
    showPerformance?.("");
    showContracts?.("");
    document.querySelector("#kpi-grid").replaceChildren();
  }
  Object.entries(views).forEach(([key, node]) => { node.hidden = key !== name; });
}

function friendlyError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("invalid login")) return uiText("تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور.", "Sign-in failed. Check your email and password.");
  if (message.includes("expired") || message.includes("invalid totp")) return uiText("الرمز غير صحيح أو انتهت صلاحيته. جرّب الرمز الحالي.", "That code is invalid or has expired. Enter the current code.");
  if (message.includes("rate limit")) return uiText("محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم أعد المحاولة.", "Too many attempts. Wait a moment and try again.");
  if (message.includes("mfa")) return uiText("تعذر إكمال التحقق متعدد العوامل. أعد المحاولة أو تواصل مع مسؤول النظام.", "Multi-factor verification could not be completed. Try again or contact your administrator.");
  return uiText("تعذر إكمال العملية الآمنة. أعد المحاولة، ثم تواصل مع مسؤول النظام إذا استمرت المشكلة.", "The operation could not be completed. Try again, then contact your administrator if the problem persists.");
}

function setBusy(form, busy) {
  form.querySelectorAll("button,input,select").forEach((element) => { element.disabled = busy; });
}

async function signOut() {
  setStatus(uiText("جارٍ إنهاء الجلسة…", "Signing out…"));
  const {error}=await supabase.auth.signOut();
  if(error){setStatus(friendlyError(error),"error");return;}
  activeFactorId = null;
  passwordUpdateUserId = null;
  showView("signIn");
  setStatus(uiText("تم إنهاء الجلسة بأمان.", "You have signed out securely."), "success");
}

async function initializeSession(callback) {
  const callbackType = callback.get("type");
  const callbackToken = callback.get("access_token");
  const { data } = await supabase.auth.getSession();
  if ((callbackType === "invite" || callbackType === "recovery")
    && callbackToken && data?.session?.access_token === callbackToken) {
    passwordUpdateUserId = data.session.user.id;
  }
  await routeSession();
  if (!callback.size && !views.signIn.hidden && !data?.session
    && new URLSearchParams(location.search).get("action") === "recover") {
    document.querySelector("#show-password-recovery").click();
  }
  if (callback.has("error") || (callbackToken
    && (callbackType === "invite" || callbackType === "recovery")
    && !passwordUpdateUserId)) {
    setStatus(uiText("رابط الدخول غير صالح أو انتهت صلاحيته. اطلب رابط استعادة جديدًا.", "This sign-in link is invalid or has expired. Request a new reset link."), "error");
  }
}

async function beginEnrollment() {
  const button = document.querySelector("#start-enrollment");
  button.disabled = true;
  setStatus(uiText("جارٍ إنشاء عامل تحقق جديد…", "Creating an authenticator setup code…"));
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
    setStatus(uiText("امسح الرمز وأدخل رمز التأكيد لتفعيل التحقق بخطوتين.", "Scan the QR code and enter the confirmation code to enable two-step verification."), "success");
    document.querySelector("#enroll-code").focus();
  } catch (error) {
    setStatus(friendlyError(error), "error");
    button.disabled = false;
  }
}

async function verifyFactor(form, factorId) {
  const code = new FormData(form).get("code")?.toString().trim();
  if (!/^\d{6}$/.test(code || "")) {
    setStatus(uiText("أدخل رمزًا صحيحًا من 6 أرقام.", "Enter a six-digit code."), "error");
    return;
  }
  setBusy(form, true);
  setStatus(uiText("جارٍ التحقق من الرمز…", "Checking the code…"));
  try {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) throw error;
    await supabase.auth.refreshSession();
    form.reset();
    setStatus(uiText("تم التحقق متعدد العوامل بنجاح.", "Multi-factor verification succeeded."), "success");
    await routeSession();
  } catch (error) {
    setStatus(friendlyError(error), "error");
  } finally {
    setBusy(form, false);
  }
}

async function getOrganizations() {
  const rows=[];
  for(let offset=0;;){
    const {data,error}=await supabase.from("organizations").select("id,name,created_at").order("created_at").order("id").range(offset,offset+99);
    if(error)throw error;
    if(!data?.length)return rows;
    rows.push(...data);
    offset+=data.length;
  }
}

async function loadCounts(organizationId) {
  const version = ++countsVersion;
  document.getElementById("panel-search").value="";
  document.getElementById("panel-matches").replaceChildren();
  document.querySelector("#kpi-grid").replaceChildren();
  showContracts(organizationId);
  providerDesk.setOrganization(organizationId);
  showCommercial(organizationId);
  const portfolioReady=showPortfolio(organizationId);
  void showPerformance(organizationId);
  const definitions = [
    ["suppliers", uiText("الموردون", "Suppliers")], ["products", uiText("المنتجات", "Products")], ["quotes", uiText("عروض الأسعار", "Quotations")],
    ["contracts", uiText("العقود", "Contracts")], ["requests", uiText("الطلبات", "Requests")], ["approvals", uiText("الاعتمادات", "Approvals")]
  ];
  const results = await Promise.all(definitions.map(async ([table, label]) => {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true }).eq("organization_id", organizationId);
    return { label, count: !error && Number.isSafeInteger(count) ? count : uiText("غير متاح", "Unavailable") };
  }));
  await portfolioReady;
  if (version !== countsVersion) return;
  document.querySelector("#kpi-grid").innerHTML = results.map(({ label, count }) => `<div class="kpi"><strong>${count}</strong><span>${label}</span></div>`).join("");
}

function renderAccountIdentity(user) {
  const name = typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : "";
  document.querySelector("#display-name").value = name;
  document.querySelector("#session-identity").textContent = name || user.email || uiText("حساب العمل", "Business account");
}

async function showDashboard(session) {
  if(workspace==="provider") {
    showView("provider");
    setStatus();
    await providerDesk.showProvider(true);
    return;
  }
  showView("signIn");
  const generation=++dashboardGeneration;
  showPerformance?.("");
  renderAccountIdentity(session.user);
  document.querySelector("#profile-status").textContent = "";
  try {
    const organizations = await getOrganizations();
    if(generation!==dashboardGeneration)return;
    showView("dashboard");
    const empty = document.querySelector("#organization-empty");
    const dashboard = document.querySelector("#organization-dashboard");
    if (!organizations.length) {
      empty.hidden = false;
      dashboard.hidden = true;
      setStatus(uiText("الجلسة محمية. أنشئ مساحة المنشأة الأولى للبدء.", "Your session is secure. Create your first organization workspace."), "success");
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
    if(generation!==dashboardGeneration)return;
    if(workspace==="portfolio") {
      const portfolio=document.getElementById("portfolio-desk");
      if(portfolio && !portfolio.hidden){portfolio.open=true;portfolio.scrollIntoView({block:"start"});}
    }
    setStatus(uiText("تم فتح لوحة المنشأة.", "Your facility dashboard is open."), "success");
  } catch (error) {
    if(generation===dashboardGeneration)setStatus(friendlyError(error), "error");
  }
}

async function routeSession() {
  const epoch=authEpoch;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if(epoch!==authEpoch)return;
  if (sessionError) {
    setStatus(friendlyError(sessionError), "error");
    showView("signIn");
    return;
  }
  const session = sessionData.session;
  if (!session) {
    passwordUpdateUserId = null;
    showView("signIn");
    setStatus(uiText("الوصول بدعوة فقط؛ سجّل الدخول بحسابك المؤسسي.", "Access is by invitation. Sign in with your business account."));
    return;
  }

  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if(epoch!==authEpoch)return;
  if (aalError) {
    setStatus(friendlyError(aalError), "error");
    return;
  }
  if (passwordUpdateUserId === session.user.id
    && (aal.currentLevel === "aal2" || aal.nextLevel !== "aal2")) {
    showView("passwordUpdate");
    setStatus(uiText("تم التحقق من الرابط. عيّن كلمة المرور للمتابعة.", "Link verified. Set your password to continue."));
    document.querySelector("#new-password").focus();
    return;
  }
  if (aal.currentLevel === "aal2") {
    await showDashboard(session);
    return;
  }

  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if(epoch!==authEpoch)return;
  if (factorsError) {
    setStatus(friendlyError(factorsError), "error");
    return;
  }
  const verified = (factors.totp || []).find((factor) => factor.status === "verified");
  if (verified) {
    activeFactorId = verified.id;
    showView("verify");
    setStatus(uiText("أدخل الرمز الظاهر في تطبيق التحقق لفتح لوحتك.", "Enter the authenticator code to verify your session."));
    document.querySelector("#mfa-code").focus();
  } else {
    showView("enroll");
    document.querySelector("#start-enrollment").hidden = false;
    document.querySelector("#start-enrollment").disabled = false;
    document.querySelector("#enrollment-details").hidden = true;
    setStatus(uiText("يلزم ربط تطبيق مصادقة قبل إتاحة بيانات العمل.", "Connect your authenticator app to access operational data."));
  }
}

if (!configReady) {
  showView("signIn");
  setStatus(uiText("إعداد الاتصال الآمن غير مكتمل. تواصل مع مسؤول النظام.", "The secure connection is not configured. Contact your administrator."), "error");
} else {
  const callback = new URLSearchParams(window.location.hash.slice(1));
  supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { headers: { "X-Client-Info": "osoul-command-center-v15" } }
  });
  const search=document.getElementById("panel-search");
  const matches=document.getElementById("panel-matches");
  const normalize=value=>value.normalize("NFKC").toLocaleLowerCase().replace(/[أإآ]/g,"ا").replace(/[\u064B-\u065F]/g,"").trim();
  search.addEventListener("input",()=>{
    matches.replaceChildren();
    const term=normalize(search.value);
    if(!term)return;
    for(const item of document.querySelectorAll("#organization-dashboard details > summary")){
      if(item.closest("[hidden]")||!normalize(item.textContent).includes(term))continue;
      const button=document.createElement("button");
      button.type="button";button.textContent=item.textContent;
      button.onclick=()=>{
        if(!item.isConnected||item.closest("[hidden]"))return;
        for(let el=item.parentElement;el;el=el.parentElement)if(el.tagName==="DETAILS")el.open=true;
        item.focus();item.scrollIntoView({block:"center"});
      };
      matches.append(button);
    }
    if(!matches.childElementCount)matches.textContent=uiText("لم تظهر أداة بهذا الاسم ضمن المنشأة المحددة.","No matching tool for the selected facility.");
  });
  resetOperations = setupFacilityOperations(supabase);
  showPerformance = setupPerformance(supabase);
  showContracts = setupContracts(supabase);
  providerDesk = setupProviderDesk(supabase);
  showCommercial = setupCommercialIntelligence(supabase);
  showPortfolio = setupPortfolio(supabase);
  if(workspace==="provider"||workspace==="portfolio"){
    const title=workspace==="provider"?uiText("بوابة مقدم الخدمة","Service provider portal"):uiText("غرفة إدارة المحفظة","Portfolio command center");
    document.getElementById("enterprise-title").textContent=title;
    document.title=title+" | Osoul";
  }
  supabase.auth.onAuthStateChange((event,session)=>{
    const id=session?.user?.id||null;
    const changed=activeSessionId!==null && id!==activeSessionId;
    activeSessionId=id;
    if(event==="SIGNED_OUT"||changed){
      authEpoch++;
      activeFactorId=null;
      passwordUpdateUserId=null;
      document.querySelector("#totp-qr").removeAttribute("src");
      document.querySelector("#totp-secret").textContent="";
      for(const form of document.querySelectorAll("#enterprise-app form"))form.reset();
      showView("signIn");
      setStatus();
      if(id)window.setTimeout(routeSession,0);
    }
  });

  document.querySelector("#display-name-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector("#profile-status");
    const name = form.elements.displayName.value.trim();
    if (!name || name.length > 80) {
      status.textContent = uiText("أدخل اسم عرض من حرف إلى 80 حرفًا.", "Enter a display name of 1 to 80 characters.");
      return;
    }
    const epoch=authEpoch;
    setBusy(form, true);
    try {
      const { data, error } = await supabase.auth.updateUser({ data: { display_name: name } });
      if (error) throw error;
      if(epoch!==authEpoch)return;
      renderAccountIdentity(data.user);
      status.textContent = uiText("حُفظ اسم العرض.", "Display name saved.");
    } catch (error) {
      status.textContent = friendlyError(error);
    } finally {
      setBusy(form, false);
    }
  });
  const recoveryButton = document.querySelector("#show-password-recovery");
  recoveryButton.disabled = false;
  recoveryButton.addEventListener("click", () => {
    const email = document.querySelector("#recovery-email");
    email.value = document.querySelector("#email").value;
    showView("recoveryRequest");
    setStatus();
    email.focus();
  });
  document.querySelector("#back-to-sign-in").addEventListener("click", () => {
    showView("signIn");
    setStatus();
    document.querySelector("#email").focus();
  });
  views.recoveryRequest.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = new FormData(form).get("email").trim();
    setBusy(form, true);
    try {
      const redirectTo = new URL("/command-center/enterprise/", window.location.origin).href;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setStatus(uiText("إذا كان البريد مرتبطًا بحساب، فسيصلك رابط الاستعادة.", "If the email belongs to an account, you will receive a reset link."), "success");
    } catch (error) {
      setStatus(friendlyError(error), "error");
    } finally {
      setBusy(form, false);
    }
  });
  views.passwordUpdate.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const password = values.get("password");
    if (password !== values.get("confirmPassword")) {
      setStatus(uiText("كلمتا المرور غير متطابقتين.", "The passwords do not match."), "error");
      return;
    }
    setBusy(form, true);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!passwordUpdateUserId || data.session?.user.id !== passwordUpdateUserId) {
        passwordUpdateUserId = null;
        await routeSession();
        setStatus(uiText("انتهت جلسة تعيين كلمة المرور. اطلب رابط استعادة جديدًا.", "Your password setup session has expired. Request a new reset link."), "error");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      passwordUpdateUserId = null;
      form.reset();
      await routeSession();
    } catch (error) {
      setStatus(friendlyError(error), "error");
    } finally {
      setBusy(form, false);
    }
  });

  document.querySelector("#sign-in-view").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(form, true);
    setStatus(uiText("جارٍ التحقق من بيانات الدخول…", "Checking your sign-in details…"));
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
    setStatus(uiText("جارٍ تحميل مؤشرات المنشأة…", "Loading organization metrics…"));
    try {
      await loadCounts(event.currentTarget.value);
      setStatus(uiText("تم اختيار المنشأة.", "Facility selected."), "success");
    } catch (error) {
      setStatus(friendlyError(error), "error");
    }
  });
  document.querySelector("#create-organization-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = new FormData(form).get("name")?.toString().trim();
    setBusy(form, true);
    setStatus(uiText("جارٍ إنشاء مساحة المنشأة وعزلها…", "Creating the organization workspace…"));
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

  initializeSession(callback);
}
