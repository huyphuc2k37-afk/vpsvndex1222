/* =============================================================
 * VPSVNDEX — Frontend application
 * Cấu trúc: IIFE để tránh leak global, chia thành 5 module con.
 *   1. data      : packages + region metadata
 *   2. supabase  : khởi tạo client (safe-fail nếu thiếu config)
 *   3. state     : auth state + pending intent (plan đang chọn dở)
 *   4. ui        : render / modal / toast / format helpers
 *   5. auth      : đăng ký / đăng nhập / đăng xuất / gate
 *   6. orders    : tạo đơn + lịch sử đơn của tôi
 * ============================================================= */
(function () {
  'use strict';

  /* ===========================================================
   * 1. DATA
   * =========================================================== */
  const PACKAGES = [
    {
      id: 'starter',
      name: 'Nền tảng',
      tag: 'CHO CÔNG VIỆC CƠ BẢN',
      subtitle: 'VPS nhẹ cho web tĩnh, blog cá nhân và môi trường dev.',
      price: 2900000,
      specs: {
        cpu: '6 vCPU · AMD EPYC',
        ram: '16 GB DDR4',
        disk: '200 GB NVMe',
        bandwidth: '1 Gbps · shared',
        ipv4: '01 IPv4 riêng',
      },
    },
    {
      id: 'standard',
      name: 'Tiêu chuẩn',
      tag: 'CÂN BẰNG HIỆU NĂNG',
      subtitle: 'Phù hợp cho web doanh nghiệp vừa, API và CRM nội bộ.',
      price: 3700000,
      specs: {
        cpu: '8 vCPU · AMD EPYC',
        ram: '24 GB DDR4',
        disk: '300 GB NVMe',
        bandwidth: '1 Gbps · quốc tế',
        ipv4: '01 IPv4 riêng',
      },
    },
    {
      id: 'pro',
      name: 'Hiệu năng',
      tag: 'ĐƯỢC CHỌN NHIỀU',
      subtitle: 'Dư dả cho e‑commerce, WordPress lớn, backend production.',
      price: 4500000,
      popular: true,
      specs: {
        cpu: '12 vCPU · AMD EPYC',
        ram: '32 GB DDR4',
        disk: '500 GB NVMe',
        bandwidth: '1 Gbps · quốc tế',
        ipv4: '01 IPv4 riêng',
      },
    },
    {
      id: 'max',
      name: 'Chuyên dụng',
      tag: 'TÀI NGUYÊN CAO',
      subtitle: 'Workload nặng: AI/ML, database lớn, SaaS nhiều tenant.',
      price: 5300000,
      specs: {
        cpu: '16 vCPU · AMD EPYC',
        ram: '48 GB DDR4',
        disk: '800 GB NVMe',
        bandwidth: '1 Gbps · quốc tế',
        ipv4: '01 IPv4 riêng',
      },
    },
  ];

  const REGIONS = {
    vn: { label: 'Việt Nam', location: 'Hà Nội / TP. Hồ Chí Minh' },
    us: { label: 'US', location: 'Los Angeles · Hoa Kỳ' },
  };

  /* ===========================================================
   * 2. SUPABASE — init với try/catch, không để crash app
   * =========================================================== */
  let supabase = null;
  function initSupabase() {
    try {
      const cfg = window.SUPABASE_CONFIG || {};
      const url = cfg.url;
      const anonKey = cfg.anonKey;
      const hasCreds = url && anonKey && !String(url).includes('YOUR-PROJECT-ID');
      if (typeof window.supabase === 'undefined') {
        console.warn('[VPSVNDEX] Supabase JS chưa load — auth bị tắt.');
        return null;
      }
      if (!hasCreds) {
        console.warn('[VPSVNDEX] supabase-config.js thiếu URL/anon key — auth bị tắt.');
        return null;
      }
      return window.supabase.createClient(url, anonKey);
    } catch (err) {
      console.warn('[VPSVNDEX] Khởi tạo Supabase thất bại:', err?.message || err);
      return null;
    }
  }

  /* ===========================================================
   * 3. STATE
   * =========================================================== */
  const state = {
    activeRegion: 'vn',
    authMode: 'login',         // 'login' | 'signup'
    user: null,                // Supabase user object | null
    pendingPackageId: null,    // plan đang chọn dở khi chưa login
    orders: [],                // lịch sử đơn hàng của user hiện tại
  };

  /* ===========================================================
   * 4. UI — DOM helpers + render + modal + toast
   * =========================================================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const moneyFmt = new Intl.NumberFormat('vi-VN');
  const formatMoney = (v) => `${moneyFmt.format(v)}đ`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  function lockScroll(lock) {
    document.documentElement.classList.toggle('is-locked', lock);
    document.body.classList.toggle('is-locked', lock);
  }

  let toastTimer = null;
  function showToast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2200);
  }

  function renderPlans() {
    const grid = $('#plans-grid');
    if (!grid) return;
    const region = REGIONS[state.activeRegion];
    const regionBandwidth = state.activeRegion === 'vn'
      ? '1 Gbps · nội địa tối ưu'
      : '1 Gbps · quốc tế';

    grid.innerHTML = PACKAGES.map((plan) => {
      const bandwidth = plan.id === 'starter' ? '1 Gbps · shared' : regionBandwidth;
      return `
        <article class="plan-card ${plan.popular ? 'is-featured' : ''}">
          ${plan.popular ? '<span class="popular">PHỔ BIẾN</span>' : ''}
          <p class="plan-tag">${esc(plan.tag)}</p>
          <h3 class="plan-name">VPS ${esc(plan.name)}</h3>
          <p class="plan-subtitle">${esc(plan.subtitle)}</p>
          <p class="plan-price">${formatMoney(plan.price)} <small>/ tháng</small></p>
          <ul class="plan-features">
            <li><span>CPU</span><b>${esc(plan.specs.cpu)}</b></li>
            <li><span>RAM</span><b>${esc(plan.specs.ram)}</b></li>
            <li><span>Ổ cứng</span><b>${esc(plan.specs.disk)}</b></li>
            <li><span>Băng thông</span><b>${esc(bandwidth)}</b></li>
            <li><span>Địa chỉ IP</span><b>${esc(plan.specs.ipv4)}</b></li>
            <li><span>Vị trí</span><b>${esc(region.label)}</b></li>
          </ul>
          <button class="plan-button" type="button" data-package="${esc(plan.id)}">
            ${state.user ? 'Thanh toán ngay' : 'Đăng nhập để thanh toán'} <span>→</span>
          </button>
        </article>`;
    }).join('');
  }

  function renderHeader() {
    const guestActions = $('#guest-actions');
    const accountActions = $('#account-actions');
    const accountEmail = $('#account-email');
    if (!guestActions || !accountActions || !accountEmail) return;

    if (state.user) {
      guestActions.hidden = true;
      accountActions.hidden = false;
      accountEmail.textContent = state.user.email;
    } else {
      guestActions.hidden = false;
      accountActions.hidden = true;
      accountEmail.textContent = '';
    }
  }

  /* ---------- Checkout modal ---------- */
  function openCheckout(packageId) {
    const plan = PACKAGES.find((p) => p.id === packageId);
    if (!plan) return;

    const region = REGIONS[state.activeRegion];
    $('#checkout-plan').textContent = `VPS ${plan.name}`;
    $('#checkout-region').textContent = `${region.label} · ${region.location}`;
    $('#checkout-price').textContent = formatMoney(plan.price);

    const transferNote = `VPSVNDEX ${plan.id.toUpperCase()} ${state.activeRegion.toUpperCase()}`;
    $('#transfer-note').textContent = transferNote;
    $('#copy-note').dataset.copy = transferNote;

    // Reset form mỗi lần mở
    const form = $('#order-form');
    if (form) {
      form.reset();
      if (state.user?.email) $('#order-email').value = state.user.email;
    }

    // Lưu intent để handler biết tạo đơn cho gói nào
    state.pendingOrderPackageId = packageId;

    $('#checkout').classList.add('is-open');
    $('#checkout').setAttribute('aria-hidden', 'false');
    lockScroll(true);
    history.replaceState(null, '', '#thanh-toan');
  }

  function closeCheckout() {
    $('#checkout').classList.remove('is-open');
    $('#checkout').setAttribute('aria-hidden', 'true');
    lockScroll(false);
    if (window.location.hash === '#thanh-toan') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  /* ---------- Auth modal ---------- */
  function openAuth(mode = 'login') {
    setAuthMode(mode);
    $('#auth-modal').classList.add('is-open');
    $('#auth-modal').setAttribute('aria-hidden', 'false');
    lockScroll(true);
    setTimeout(() => $('#auth-email-input')?.focus(), 80);
  }

  function closeAuth() {
    $('#auth-modal').classList.remove('is-open');
    $('#auth-modal').setAttribute('aria-hidden', 'true');
    lockScroll(false);
    setAuthFeedback('', '');
    $('#auth-form')?.reset();
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    $$('.auth-tab').forEach((tab) => {
      const isActive = tab.dataset.authMode === mode;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
    $('#confirm-password-field').hidden = mode !== 'signup';
    $('#auth-confirm-input').required = mode === 'signup';
    $('#auth-password-input').setAttribute(
      'autocomplete',
      mode === 'signup' ? 'new-password' : 'current-password'
    );
    const submitText = $('#auth-submit');
    if (submitText) submitText.firstChild.textContent = mode === 'signup' ? 'Tạo tài khoản ' : 'Đăng nhập ';
    $('#auth-title').innerHTML = mode === 'signup'
      ? 'Tạo tài khoản<br /><em>trong vài giây.</em>'
      : 'Đăng nhập<br /><em>để tiếp tục.</em>';
    setAuthFeedback('', '');
    $('#auth-form')?.reset();
  }

  function setAuthFeedback(message, type = 'info') {
    const el = $('#auth-feedback');
    if (!el) return;
    el.textContent = message;
    el.dataset.type = type;
  }

  /* ===========================================================
   * 5. AUTH — Supabase
   * =========================================================== */
  function validateAuthForm() {
    const email = $('#auth-email-input').value.trim();
    const password = $('#auth-password-input').value;
    const confirm = $('#auth-confirm-input').value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Vui lòng nhập email hợp lệ.';
    if (password.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự.';
    if (state.authMode === 'signup' && password !== confirm) return 'Mật khẩu xác nhận không khớp.';
    return null;
  }

  function translateAuthError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('invalid login credentials')) return 'Email hoặc mật khẩu không đúng.';
    if (msg.includes('user already registered')) return 'Email này đã được đăng ký.';
    if (msg.includes('email not confirmed')) return 'Vui lòng xác nhận email trước khi đăng nhập.';
    if (msg.includes('password should be')) return 'Mật khẩu phải có ít nhất 8 ký tự.';
    if (msg.includes('rate limit')) return 'Thao tác quá nhanh, vui lòng thử lại sau ít phút.';
    if (msg.includes('network') || msg.includes('fetch')) return 'Mất kết nối mạng, vui lòng thử lại.';
    return err?.message || 'Đã có lỗi xảy ra, vui lòng thử lại.';
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    if (!supabase) {
      setAuthFeedback('Chưa cấu hình Supabase. Mở supabase-config.js để điền URL + anon key.', 'error');
      return;
    }
    const validationError = validateAuthForm();
    if (validationError) { setAuthFeedback(validationError, 'error'); return; }

    const email = $('#auth-email-input').value.trim();
    const password = $('#auth-password-input').value;
    const submit = $('#auth-submit');
    submit.disabled = true;
    setAuthFeedback('Đang xử lý…', 'info');

    try {
      if (state.authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data?.session) {
          applySession(data.session);
          closeAuth();
          showToast('Đăng ký thành công');
        } else {
          setAuthFeedback(
            'Đăng ký thành công. Kiểm tra email để xác nhận tài khoản trước khi đăng nhập.',
            'success'
          );
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        applySession(data.session);
        closeAuth();
        showToast('Đăng nhập thành công');
      }
    } catch (err) {
      setAuthFeedback(translateAuthError(err), 'error');
    } finally {
      submit.disabled = false;
    }
  }

  function applySession(session) {
    if (!session?.user) return;
    state.user = session.user;
    renderHeader();
    renderPlans();
    // Nếu user vừa login xong trong khi đang chọn plan → mở lại checkout
    if (state.pendingPackageId) {
      const pkgId = state.pendingPackageId;
      state.pendingPackageId = null;
      openCheckout(pkgId);
    }
    loadMyOrders();
  }

  function clearSession() {
    state.user = null;
    state.orders = [];
    renderHeader();
    renderPlans();
    renderMyOrders();
  }

  async function handleLogout() {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
      clearSession();
      showToast('Đã đăng xuất');
    } catch (err) {
      console.warn('[logout]', err);
      showToast('Không thể đăng xuất, vui lòng thử lại');
    }
  }

  async function bootstrapAuth() {
    if (!supabase) return;
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session) applySession(data.session);

      const subWrap = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) applySession(session);
        else clearSession();
      });
      const sub = subWrap?.data?.subscription || subWrap?.subscription;
      if (sub && typeof sub.unsubscribe === 'function') {
        window.addEventListener('beforeunload', () => sub.unsubscribe());
      }
    } catch (err) {
      console.warn('[bootstrapAuth]', err?.message || err);
    }
  }

  /* ===========================================================
   * 6. ORDERS — tạo + lịch sử
   * =========================================================== */
  function validateOrderForm() {
    const name = $('#order-name').value.trim();
    const phone = $('#order-phone').value.trim();
    const email = $('#order-email').value.trim();
    if (name.length < 2) return 'Vui lòng nhập họ tên.';
    if (!/^[0-9+\-\s]{8,15}$/.test(phone)) return 'Số điện thoại chưa hợp lệ.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email chưa hợp lệ.';
    return null;
  }

  async function handleOrderSubmit(e) {
    e.preventDefault();
    if (!state.user) { showToast('Phiên đăng nhập đã hết, vui lòng đăng nhập lại.'); return; }
    if (!supabase) { showToast('Hệ thống chưa sẵn sàng.'); return; }

    const plan = PACKAGES.find((p) => p.id === state.pendingOrderPackageId);
    if (!plan) return;

    const validationError = validateOrderForm();
    if (validationError) { showToast(validationError); return; }

    const submit = $('#order-submit');
    submit.disabled = true;
    const originalText = submit.textContent;
    submit.textContent = 'Đang gửi…';

    try {
      const payload = {
        user_id: state.user.id,
        package_id: plan.id,
        region: state.activeRegion,
        amount_vnd: plan.price,
        customer_name: $('#order-name').value.trim(),
        customer_phone: $('#order-phone').value.trim(),
        customer_email: $('#order-email').value.trim(),
        notes: $('#order-notes').value.trim() || null,
        status: 'pending',
      };
      const { error } = await supabase.from('orders').insert(payload);
      if (error) throw error;

      showToast('Đã ghi nhận đơn hàng. Admin sẽ liên hệ bạn sớm nhất.');
      await loadMyOrders();
      // Reset form, KHÔNG đóng modal để user xem lại QR
      $('#order-form').reset();
    } catch (err) {
      console.error('[createOrder]', err);
      showToast('Không thể tạo đơn: ' + (err?.message || 'lỗi không xác định'));
    } finally {
      submit.disabled = false;
      submit.textContent = originalText;
    }
  }

  async function loadMyOrders() {
    if (!supabase || !state.user) { renderMyOrders(); return; }
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', state.user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      state.orders = data || [];
    } catch (err) {
      console.warn('[loadOrders]', err?.message || err);
      state.orders = [];
    }
    renderMyOrders();
  }

  function renderMyOrders() {
    const wrap = $('#my-orders');
    const list = $('#my-orders-list');
    if (!wrap || !list) return;
    if (!state.user) { wrap.hidden = true; return; }
    wrap.hidden = false;
    if (state.orders.length === 0) {
      list.innerHTML = '<p class="empty-state">Bạn chưa có đơn hàng nào.</p>';
      return;
    }
    list.innerHTML = state.orders.map((o) => {
      const plan = PACKAGES.find((p) => p.id === o.package_id);
      const region = REGIONS[o.region];
      const date = new Date(o.created_at).toLocaleString('vi-VN');
      const statusLabel = { pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', cancelled: 'Đã hủy' }[o.status] || o.status;
      return `
        <article class="order-card">
          <header>
            <strong>VPS ${esc(plan?.name || o.package_id)}</strong>
            <span class="order-status order-status-${esc(o.status)}">${esc(statusLabel)}</span>
          </header>
          <p>${esc(region?.label || o.region)} · ${formatMoney(o.amount_vnd)}</p>
          <p class="order-meta">${esc(date)}</p>
        </article>`;
    }).join('');
  }

  /* ===========================================================
   * 7. INTENT HANDLER — xử lý click "Thanh toán"
   *    Auth gate: nếu chưa login → mở auth modal + lưu intent
   * =========================================================== */
  function handlePlanSelect(packageId) {
    if (!state.user) {
      state.pendingPackageId = packageId;
      openAuth('login');
      setAuthFeedback('Vui lòng đăng nhập để tiếp tục thanh toán.', 'info');
      return;
    }
    openCheckout(packageId);
  }

  /* ===========================================================
   * 8. EVENT WIRING
   * =========================================================== */
  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      showToast('Đã sao chép thông tin');
    } catch {
      showToast('Không thể sao chép, vui lòng chép thủ công');
    }
  }

  function wireEvents() {
    // Region switcher
    $$('.region-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        state.activeRegion = tab.dataset.region;
        $$('.region-tab').forEach((button) => {
          const isActive = button === tab;
          button.classList.toggle('is-active', isActive);
          button.setAttribute('aria-selected', String(isActive));
        });
        renderPlans();
      });
    });

    // Plans grid (event delegation)
    $('#plans-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-package]');
      if (btn) handlePlanSelect(btn.dataset.package);
    });

    // Checkout open/close
    $$('[data-close-checkout]').forEach((el) => el.addEventListener('click', closeCheckout));

    // Order form submit
    $('#order-form')?.addEventListener('submit', handleOrderSubmit);

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if ($('#auth-modal').classList.contains('is-open')) closeAuth();
      else if ($('#checkout').classList.contains('is-open')) closeCheckout();
    });

    // Copy buttons
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-copy]');
      if (btn) copyText(btn.dataset.copy);
    });

    // Auth tabs
    $$('.auth-tab').forEach((tab) => {
      tab.addEventListener('click', () => setAuthMode(tab.dataset.authMode));
    });

    // Auth form
    $('#auth-form')?.addEventListener('submit', handleAuthSubmit);

    // Auth open/close
    $$('[data-open-auth]').forEach((el) =>
      el.addEventListener('click', () => openAuth(el.dataset.openAuth))
    );
    $$('[data-close-auth]').forEach((el) => el.addEventListener('click', closeAuth));
    $('#logout-button')?.addEventListener('click', handleLogout);

    // Header CTA — nếu click "Chọn VPS" cũng phải qua gate
    document.querySelectorAll('a[href="#goi-vps"]').forEach((a) => {
      a.addEventListener('click', () => { /* scroll only — không gate vì chỉ xem giá */ });
    });
  }

  /* ===========================================================
   * 9. BOOT
   * =========================================================== */
  function init() {
    try { $('#year').textContent = new Date().getFullYear(); } catch (_) {}
    supabase = initSupabase();
    renderPlans();
    renderHeader();
    wireEvents();
    bootstrapAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
