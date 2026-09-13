// =============================================================
// VPSVNDEX — dữ liệu gói VPS
// Thông số đã cân đối với giá, theo thị trường VN/US.
// Bước nhảy ~800K/tháng tương ứng tăng rõ rệt vCPU + RAM + NVMe.
// =============================================================
const packages = [
  {
    id: "starter",
    name: "Nền tảng",
    tag: "CHO CÔNG VIỆC CƠ BẢN",
    subtitle: "VPS nhẹ cho web tĩnh, blog cá nhân và môi trường dev.",
    price: 2900000,
    specs: {
      cpu: "6 vCPU · AMD EPYC",
      ram: "16 GB DDR4",
      disk: "200 GB NVMe",
      bandwidth: "1 Gbps · shared",
      ipv4: "01 IPv4 riêng",
    },
  },
  {
    id: "standard",
    name: "Tiêu chuẩn",
    tag: "CÂN BẰNG HIỆU NĂNG",
    subtitle: "Phù hợp cho web doanh nghiệp vừa, API và CRM nội bộ.",
    price: 3700000,
    specs: {
      cpu: "8 vCPU · AMD EPYC",
      ram: "24 GB DDR4",
      disk: "300 GB NVMe",
      bandwidth: "1 Gbps · quốc tế",
      ipv4: "01 IPv4 riêng",
    },
  },
  {
    id: "pro",
    name: "Hiệu năng",
    tag: "ĐƯỢC CHỌN NHIỀU",
    subtitle: "Dư dả cho e‑commerce, WordPress lớn, backend production.",
    price: 4500000,
    popular: true,
    specs: {
      cpu: "12 vCPU · AMD EPYC",
      ram: "32 GB DDR4",
      disk: "500 GB NVMe",
      bandwidth: "1 Gbps · quốc tế",
      ipv4: "01 IPv4 riêng",
    },
  },
  {
    id: "max",
    name: "Chuyên dụng",
    tag: "TÀI NGUYÊN CAO",
    subtitle: "Workload nặng: AI/ML, database lớn, SaaS nhiều tenant.",
    price: 5300000,
    specs: {
      cpu: "16 vCPU · AMD EPYC",
      ram: "48 GB DDR4",
      disk: "800 GB NVMe",
      bandwidth: "1 Gbps · quốc tế",
      ipv4: "01 IPv4 riêng",
    },
  },
];

const regionData = {
  vn: { label: "Việt Nam", location: "Hà Nội / TP. Hồ Chí Minh" },
  us: { label: "US", location: "Los Angeles · Hoa Kỳ" },
};

// =============================================================
// Khởi tạo Supabase (có try/catch — không để auth crash toàn bộ app)
// =============================================================
let supabase = null;
try {
  const cfg = window.SUPABASE_CONFIG || {};
  const url = cfg.url;
  const anonKey = cfg.anonKey;
  const hasCreds = url && anonKey && !String(url).includes("YOUR-PROJECT-ID");
  if (typeof window.supabase === "undefined") {
    console.warn("[VPSVNDEX] Thư viện Supabase chưa load — bỏ qua auth.");
  } else if (!hasCreds) {
    console.warn(
      "[VPSVNDEX] supabase-config.js chưa có URL/anon key — auth sẽ không hoạt động."
    );
  } else {
    supabase = window.supabase.createClient(url, anonKey);
  }
} catch (error) {
  console.warn("[VPSVNDEX] Khởi tạo Supabase thất bại:", error?.message || error);
  supabase = null;
}

// =============================================================
// State
// =============================================================
let activeRegion = "vn";
let authMode = "login"; // "login" | "signup"
const money = new Intl.NumberFormat("vi-VN");

// =============================================================
// DOM refs
// =============================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const plansGrid = $("#plans-grid");
const checkout = $("#checkout");
const toast = $("#toast");

const authModal = $("#auth-modal");
const authForm = $("#auth-form");
const authTabs = $$(".auth-tab");
const authEmailInput = $("#auth-email-input");
const authPasswordInput = $("#auth-password-input");
const authConfirmInput = $("#auth-confirm-input");
const authConfirmField = $("#confirm-password-field");
const authFeedback = $("#auth-feedback");
const authSubmit = $("#auth-submit");
const authTitle = $("#auth-title");

const guestActions = $("#guest-actions");
const accountActions = $("#account-actions");
const accountEmail = $("#account-email");
const logoutButton = $("#logout-button");

// =============================================================
// Helpers
// =============================================================
function formatMoney(value) {
  return `${money.format(value)}đ`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("is-visible"), 1700);
}

function lockScroll(lock) {
  document.documentElement.classList.toggle("is-locked", lock);
  document.body.classList.toggle("is-locked", lock);
}

// =============================================================
// Render pricing
// =============================================================
function renderPlans() {
  const region = regionData[activeRegion];
  const regionBandwidth = activeRegion === "vn"
    ? "1 Gbps · nội địa tối ưu"
    : "1 Gbps · quốc tế";
  plansGrid.innerHTML = packages
    .map(
      (plan) => {
        const bandwidth = plan.id === "starter"
          ? (activeRegion === "vn" ? "1 Gbps · shared" : "1 Gbps · shared")
          : regionBandwidth;
        return `
      <article class="plan-card ${plan.popular ? "is-featured" : ""}">
        ${plan.popular ? '<span class="popular">PHỔ BIẾN</span>' : ""}
        <p class="plan-tag">${plan.tag}</p>
        <h3 class="plan-name">VPS ${plan.name}</h3>
        <p class="plan-subtitle">${plan.subtitle}</p>
        <p class="plan-price">${formatMoney(plan.price)} <small>/ tháng</small></p>
        <ul class="plan-features">
          <li><span>CPU</span><b>${plan.specs.cpu}</b></li>
          <li><span>RAM</span><b>${plan.specs.ram}</b></li>
          <li><span>Ổ cứng</span><b>${plan.specs.disk}</b></li>
          <li><span>Băng thông</span><b>${bandwidth}</b></li>
          <li><span>Địa chỉ IP</span><b>${plan.specs.ipv4}</b></li>
          <li><span>Vị trí</span><b>${region.label}</b></li>
        </ul>
        <button class="plan-button" type="button" data-package="${plan.id}">Thanh toán ngay <span>→</span></button>
      </article>`;
      }
    )
    .join("");
}

// =============================================================
// Checkout modal
// =============================================================
function openCheckout(packageId) {
  const plan = packages.find((item) => item.id === packageId);
  const region = regionData[activeRegion];
  if (!plan) return;

  $("#checkout-plan").textContent = `VPS ${plan.name}`;
  $("#checkout-region").textContent = `${region.label} · ${region.location}`;
  $("#checkout-price").textContent = formatMoney(plan.price);
  const transferNote = `VPSVNDEX ${plan.id.toUpperCase()} ${activeRegion.toUpperCase()}`;
  $("#transfer-note").textContent = transferNote;
  $("#copy-note").dataset.copy = transferNote;

  checkout.classList.add("is-open");
  checkout.setAttribute("aria-hidden", "false");
  lockScroll(true);
  window.location.hash = "thanh-toan";
}

function closeCheckout() {
  checkout.classList.remove("is-open");
  checkout.setAttribute("aria-hidden", "true");
  lockScroll(false);
  if (window.location.hash === "#thanh-toan") {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    showToast("Đã sao chép thông tin");
  } catch {
    showToast("Không thể sao chép, vui lòng chép thủ công");
  }
}

// =============================================================
// Auth — Supabase
// =============================================================
function setAuthMode(mode) {
  authMode = mode;
  authTabs.forEach((tab) => {
    const isActive = tab.dataset.authMode === mode;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  authConfirmField.hidden = mode !== "signup";
  authConfirmInput.required = mode === "signup";
  authEmailInput.setAttribute(
    "autocomplete",
    mode === "signup" ? "email" : "email"
  );
  authPasswordInput.setAttribute(
    "autocomplete",
    mode === "signup" ? "new-password" : "current-password"
  );
  authSubmit.firstChild.textContent = mode === "signup" ? "Tạo tài khoản " : "Đăng nhập ";
  authTitle.innerHTML =
    mode === "signup"
      ? 'Tạo tài khoản<br /><em>trong vài giây.</em>'
      : 'Đăng nhập<br /><em>để tiếp tục.</em>';
  setAuthFeedback("", "");
  authForm.reset();
}

function setAuthFeedback(message, type = "info") {
  authFeedback.textContent = message;
  authFeedback.dataset.type = type;
}

function validateAuthForm() {
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  const confirm = authConfirmInput.value;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Vui lòng nhập email hợp lệ.";
  }
  if (password.length < 8) {
    return "Mật khẩu phải có ít nhất 8 ký tự.";
  }
  if (authMode === "signup" && password !== confirm) {
    return "Mật khẩu xác nhận không khớp.";
  }
  return null;
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!supabase) {
    setAuthFeedback(
      "Chưa cấu hình Supabase. Mở supabase-config.js và điền URL + anon key.",
      "error"
    );
    return;
  }

  const validationError = validateAuthForm();
  if (validationError) {
    setAuthFeedback(validationError, "error");
    return;
  }

  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  authSubmit.disabled = true;
  setAuthFeedback("Đang xử lý…", "info");

  try {
    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data?.session) {
        await applySession(data.session);
        closeAuth();
        showToast("Đăng ký thành công");
      } else {
        setAuthFeedback(
          "Đăng ký thành công. Kiểm tra email để xác nhận tài khoản trước khi đăng nhập.",
          "success"
        );
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await applySession(data.session);
      closeAuth();
      showToast("Đăng nhập thành công");
    }
  } catch (error) {
    setAuthFeedback(translateAuthError(error), "error");
  } finally {
    authSubmit.disabled = false;
  }
}

function translateAuthError(error) {
  const message = (error?.message || "").toLowerCase();
  if (message.includes("invalid login credentials")) return "Email hoặc mật khẩu không đúng.";
  if (message.includes("user already registered")) return "Email này đã được đăng ký.";
  if (message.includes("email not confirmed")) return "Vui lòng xác nhận email trước khi đăng nhập.";
  if (message.includes("password should be")) return "Mật khẩu phải có ít nhất 8 ký tự.";
  if (message.includes("rate limit")) return "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.";
  if (message.includes("network") || message.includes("fetch")) return "Mất kết nối mạng, vui lòng thử lại.";
  return error?.message || "Đã có lỗi xảy ra, vui lòng thử lại.";
}

async function applySession(session) {
  if (!session) return;
  const user = session.user;
  if (!user) return;
  accountEmail.textContent = user.email;
  guestActions.hidden = true;
  accountActions.hidden = false;
}

function clearSession() {
  guestActions.hidden = false;
  accountActions.hidden = true;
  accountEmail.textContent = "";
}

function openAuth(mode = "login") {
  setAuthMode(mode);
  authModal.classList.add("is-open");
  authModal.setAttribute("aria-hidden", "false");
  lockScroll(true);
  setTimeout(() => authEmailInput.focus(), 50);
}

function closeAuth() {
  authModal.classList.remove("is-open");
  authModal.setAttribute("aria-hidden", "true");
  lockScroll(false);
  setAuthFeedback("", "");
  authForm.reset();
}

async function handleLogout() {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
    clearSession();
    showToast("Đã đăng xuất");
  } catch (error) {
    showToast("Không thể đăng xuất, vui lòng thử lại");
  }
}

async function bootstrapAuth() {
  if (!supabase) return; // đã log warning ở phần khởi tạo
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session) await applySession(data.session);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) applySession(session);
      else clearSession();
    });
    // Một số version SDK trả về { data: { subscription } } thay vì { data: subscription }
    if (sub && typeof sub.unsubscribe === "function") {
      window.addEventListener("beforeunload", () => sub.unsubscribe());
    }
  } catch (error) {
    console.warn("[VPSVNDEX] bootstrapAuth thất bại:", error?.message || error);
  }
}

// =============================================================
// Event wiring
// =============================================================
function wireEvents() {
  // Region switcher
  $$(".region-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      activeRegion = tab.dataset.region;
      $$(".region-tab").forEach((button) => {
        const isActive = button === tab;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
      });
      renderPlans();
    });
  });

  // Plans grid
  plansGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-package]");
    if (button) openCheckout(button.dataset.package);
  });

  // Checkout close
  $$("[data-close-checkout]").forEach((el) => el.addEventListener("click", closeCheckout));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (authModal.classList.contains("is-open")) closeAuth();
      else closeCheckout();
    }
  });

  // Copy
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-copy]");
    if (button) copyText(button.dataset.copy);
  });

  // Auth tabs
  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => setAuthMode(tab.dataset.authMode));
  });

  // Auth form
  authForm.addEventListener("submit", handleAuthSubmit);

  // Auth open/close
  $$("[data-open-auth]").forEach((el) =>
    el.addEventListener("click", () => openAuth(el.dataset.openAuth))
  );
  $$("[data-close-auth]").forEach((el) => el.addEventListener("click", closeAuth));
  logoutButton.addEventListener("click", handleLogout);
}

// =============================================================
// Boot
// =============================================================
function init() {
  try { $("#year").textContent = new Date().getFullYear(); } catch (e) {}
  try { renderPlans(); } catch (e) { console.error("[renderPlans]", e); }
  try { wireEvents(); } catch (e) { console.error("[wireEvents]", e); }
  // bootstrapAuth chạy bất đồng bộ, có try/catch riêng
  bootstrapAuth();

  if (window.location.hash === "#thanh-toan") {
    try { openCheckout("starter"); } catch (e) { console.error(e); }
  }
}

try {
  init();
} catch (error) {
  console.error("[VPSVNDEX] init() failed:", error);
}
