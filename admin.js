/* =============================================================
 * VPSVNDEX Admin — module IIFE
 * Login: hardcoded admin/Huyphuc123 (client-side gate — đủ cho scope này)
 * Tính năng:
 *   - Login / logout
 *   - Dashboard stats
 *   - Bảng đơn hàng: search, filter, refresh
 *   - Confirm / cancel order
 *   - Provision VPS: random IP + random password
 *   - Modal xem/cấp credentials
 * ============================================================= */
(function () {
  'use strict';

  // ========== CONFIG ==========
  const ADMIN_USER = 'admin';
  const ADMIN_PASS = 'Huyphuc123';
  const SESSION_KEY = 'vpsvndex_admin_session';

  // Mock IP pool (IPv4 random trong dải datacenter VN phổ biến)
  // Bạn có thể thêm dải khác khi có IP thật
  const IP_POOLS = [
    () => `103.${rand(20, 230)}.${rand(0, 255)}.${rand(2, 254)}`,
    () => `45.${rand(120, 252)}.${rand(0, 255)}.${rand(2, 254)}`,
    () => `113.${rand(160, 190)}.${rand(0, 255)}.${rand(2, 254)}`,
    () => `203.${rand(160, 195)}.${rand(0, 255)}.${rand(2, 254)}`,
  ];

  // ========== UTILS ==========
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const moneyFmt = new Intl.NumberFormat('vi-VN');
  const formatMoney = (v) => `${moneyFmt.format(v)}đ`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const shortId = (id) => id ? id.slice(0, 8).toUpperCase() : '—';
  const formatDate = (iso) => iso ? new Date(iso).toLocaleString('vi-VN') : '—';

  // Random password 16 chars: chữ thường + hoa + số + symbol
  function randomPassword(len = 16) {
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const digit = '23456789';
    const sym   = '@#$%&*!?';
    const all = lower + upper + digit + sym;
    let pw = '';
    pw += pick(lower.split(''));
    pw += pick(upper.split(''));
    pw += pick(digit.split(''));
    pw += pick(sym.split(''));
    for (let i = pw.length; i < len; i++) pw += pick(all.split(''));
    return pw.split('').sort(() => Math.random() - 0.5).join('');
  }
  function randomIp() { return pick(IP_POOLS)(); }

  // ========== TOAST ==========
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2200);
  }

  // ========== SUPABASE ==========
  let supabase = null;
  function initSupabase() {
    try {
      const cfg = window.SUPABASE_CONFIG || {};
      if (!cfg.url || !cfg.anonKey || typeof window.supabase === 'undefined') {
        console.warn('[admin] Supabase chưa sẵn sàng');
        return null;
      }
      return window.supabase.createClient(cfg.url, cfg.anonKey);
    } catch (e) {
      console.warn('[admin] initSupabase:', e?.message || e);
      return null;
    }
  }

  // ========== AUTH GATE ==========
  function isLoggedIn() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; }
    catch { return false; }
  }
  function login() { try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {} }
  function logout() { try { sessionStorage.removeItem(SESSION_KEY); } catch {} }

  function showShell() {
    const login = $('#admin-login');
    const shell = $('#admin-shell');
    login.style.setProperty('display', 'none', 'important');
    if (shell) {
      shell.hidden = false;
      shell.style.setProperty('display', 'block', 'important');
    }
    // đảm bảo cuộn lên đầu khi vào shell
    try { window.scrollTo(0, 0); } catch {}
  }
  function showLogin() {
    const login = $('#admin-login');
    const shell = $('#admin-shell');
    login.style.removeProperty('display');
    if (shell) {
      shell.hidden = true;
      shell.style.removeProperty('display');
    }
  }

  function setLoginFeedback(msg, type = 'info') {
    const el = $('#admin-login-feedback');
    if (!el) return;
    el.textContent = msg;
    el.dataset.type = type;
  }

  // ========== STATE ==========
  const state = {
    orders: [],
    filter: 'all',
    search: '',
    currentOrder: null, // đơn đang mở trong modal
  };

  // ========== RENDER ==========
  function renderStats(stats) {
    if (!stats) return;
    $('#stat-total').textContent       = stats.total       ?? 0;
    $('#stat-pending').textContent     = stats.pending     ?? 0;
    $('#stat-confirmed').textContent   = stats.confirmed   ?? 0;
    $('#stat-provisioned').textContent = stats.provisioned ?? 0;
    $('#stat-cancelled').textContent   = stats.cancelled   ?? 0;
    $('#stat-revenue').textContent     = formatMoney(stats.revenue ?? 0);
  }

  function matchesFilter(o) {
    if (state.filter !== 'all' && o.status !== state.filter) return false;
    if (!state.search) return true;
    const q = state.search.toLowerCase();
    return [o.id, o.customer_name, o.customer_email, o.customer_phone, o.package_id]
      .some((v) => String(v ?? '').toLowerCase().includes(q));
  }

  function statusBadge(status) {
    const map = {
      pending: 'Chờ xác nhận',
      confirmed: 'Đã xác nhận',
      provisioned: 'Đã cấp VPS',
      cancelled: 'Đã hủy',
    };
    return `<span class="order-status order-status-${esc(status)}">${esc(map[status] || status)}</span>`;
  }

  function renderVpsCell(o) {
    if (o.vps_ip && o.vps_password) {
      return `
        <div class="vps-creds">
          <span><small>IP:</small> ${esc(o.vps_ip)}</span>
          <span><small>Pass:</small> ${esc(o.vps_password)}</span>
        </div>`;
    }
    return '<span class="vps-empty">Chưa cấp</span>';
  }

  function renderActions(o) {
    const status = o.status;
    const provisionLabel = (status === 'provisioned') ? '✏️ Sửa' : '🔧 Cấp VPS';
    let html = `<button class="button button-ghost" data-action="provision" data-id="${esc(o.id)}">${provisionLabel}</button>`;
    if (status === 'pending') {
      html += `<button class="button button-dark" data-action="confirm" data-id="${esc(o.id)}">✓ Xác nhận</button>`;
      html += `<button class="button button-ghost" data-action="cancel" data-id="${esc(o.id)}">✕</button>`;
    } else if (status === 'confirmed') {
      html += `<button class="button button-ghost" data-action="cancel" data-id="${esc(o.id)}">Hủy</button>`;
    } else if (status === 'cancelled') {
      html += `<button class="button button-dark" data-action="confirm" data-id="${esc(o.id)}">Mở lại</button>`;
    }
    return html;
  }

  function renderTable() {
    const tbody = $('#admin-tbody');
    if (!tbody) return;
    const filtered = state.orders.filter(matchesFilter);
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="admin-empty">Không có đơn nào phù hợp.</td></tr>`;
      return;
    }
    tbody.innerHTML = filtered.map((o) => `
      <tr>
        <td class="cell-id" data-label="Mã">#${esc(shortId(o.id))}</td>
        <td class="cell-customer" data-label="Khách hàng">
          <strong>${esc(o.customer_name)}</strong>
          <span>${esc(o.customer_email)}</span>
          <span>${esc(o.customer_phone)}</span>
        </td>
        <td data-label="Gói">${esc(o.package_id)}</td>
        <td data-label="Khu vực">${esc(o.region)}</td>
        <td class="cell-money" data-label="Số tiền">${formatMoney(o.amount_vnd)}</td>
        <td data-label="Trạng thái">${statusBadge(o.status)}</td>
        <td data-label="Ngày tạo">${esc(formatDate(o.created_at))}</td>
        <td data-label="VPS">${renderVpsCell(o)}</td>
        <td class="cell-actions" data-label="Hành động">${renderActions(o)}</td>
      </tr>
    `).join('');
  }

  // ========== API ==========
  async function loadStats() {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc('admin_stats');
      if (error) throw error;
      renderStats(data);
    } catch (e) {
      console.warn('[stats]', e?.message || e);
    }
  }

  async function loadOrders() {
    if (!supabase) { toast('Chưa cấu hình Supabase'); return; }
    try {
      const { data, error } = await supabase.rpc('admin_list_orders');
      if (error) throw error;
      state.orders = data || [];
      renderTable();
    } catch (e) {
      console.error('[orders]', e);
      toast('Không tải được danh sách đơn: ' + (e?.message || 'lỗi'));
    }
  }

  async function refreshAll() {
    await Promise.all([loadStats(), loadOrders()]);
  }

  async function updateStatus(id, status) {
    if (!supabase) return;
    try {
      const { error } = await supabase.rpc('admin_update_status', {
        p_order_id: id, p_status: status,
      });
      if (error) throw error;
      const map = { confirmed: 'Đã xác nhận đơn', cancelled: 'Đã hủy đơn' };
      toast(map[status] || 'Đã cập nhật');
      await refreshAll();
    } catch (e) {
      console.error('[updateStatus]', e);
      toast('Không cập nhật được: ' + (e?.message || 'lỗi'));
    }
  }

  async function provisionOrder(id, ip, password, username, notes) {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc('admin_provision_order', {
        p_order_id: id,
        p_vps_ip: ip,
        p_vps_password: password,
        p_vps_username: username || 'root',
        p_admin_notes: notes || null,
      });
      if (error) throw error;
      toast('Đã cấp VPS cho đơn #' + shortId(id));
      closeProvisionModal();
      await refreshAll();
    } catch (e) {
      console.error('[provision]', e);
      toast('Không cấp được VPS: ' + (e?.message || 'lỗi'));
    }
  }

  // ========== MODAL ==========
  function openProvisionModal(order) {
    state.currentOrder = order;
    $('#provision-title').textContent = `Cấp VPS · Đơn #${shortId(order.id)}`;
    $('#provision-summary').innerHTML = `
      <div><span>Khách hàng</span><strong>${esc(order.customer_name)}</strong></div>
      <div><span>Liên hệ</span><strong>${esc(order.customer_phone)}</strong></div>
      <div><span>Email</span><strong>${esc(order.customer_email)}</strong></div>
      <div><span>Gói</span><strong>${esc(order.package_id)} · ${esc(order.region)}</strong></div>
      <div><span>Số tiền</span><strong>${formatMoney(order.amount_vnd)}</strong></div>
      <div><span>Trạng thái</span>${statusBadge(order.status)}</div>
    `;
    $('#prov-username').value = order.vps_username || 'root';
    $('#prov-ip').value       = order.vps_ip || '';
    $('#prov-password').value = order.vps_password || '';
    $('#prov-notes').value    = order.admin_notes || '';
    $('#provision-modal').classList.add('is-open');
    $('#provision-modal').setAttribute('aria-hidden', 'false');
  }
  function closeProvisionModal() {
    $('#provision-modal').classList.remove('is-open');
    $('#provision-modal').setAttribute('aria-hidden', 'true');
    state.currentOrder = null;
  }

  // ========== EVENTS ==========
  function wireEvents() {
    // Login form
    $('#admin-login-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const u = $('#admin-username').value.trim();
      const p = $('#admin-password').value;
      const submit = $('#admin-login-submit');
      submit.disabled = true;
      setLoginFeedback('Đang kiểm tra...', 'info');
      // Fake delay để tránh brute force nhanh
      setTimeout(() => {
        if (u === ADMIN_USER && p === ADMIN_PASS) {
          login();
          setLoginFeedback('Đăng nhập thành công', 'success');
          showShell();
          refreshAll();
        } else {
          setLoginFeedback('Sai tài khoản hoặc mật khẩu', 'error');
        }
        submit.disabled = false;
      }, 350);
    });

    // Logout
    $('#admin-logout')?.addEventListener('click', () => {
      logout();
      showLogin();
      $('#admin-username').value = '';
      $('#admin-password').value = '';
      setLoginFeedback('', 'info');
    });

    // Toolbar
    $('#admin-refresh')?.addEventListener('click', refreshAll);
    $('#admin-search')?.addEventListener('input', (e) => {
      state.search = e.target.value.trim();
      renderTable();
    });
    $('#admin-filter')?.addEventListener('change', (e) => {
      state.filter = e.target.value;
      renderTable();
    });

    // Table actions (event delegation)
    $('#admin-tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const order = state.orders.find((o) => o.id === id);
      if (!order) return;

      if (action === 'provision') {
        openProvisionModal(order);
      } else if (action === 'confirm') {
        if (confirm(`Xác nhận đơn #${shortId(id)}?`)) await updateStatus(id, 'confirmed');
      } else if (action === 'cancel') {
        if (confirm(`Hủy đơn #${shortId(id)}?`)) await updateStatus(id, 'cancelled');
      }
    });

    // Modal close
    $$('[data-close-modal]').forEach((el) => el.addEventListener('click', closeProvisionModal));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $('#provision-modal')?.classList.contains('is-open')) {
        closeProvisionModal();
      }
    });

    // Random buttons
    $('#prov-random-ip')?.addEventListener('click', () => { $('#prov-ip').value = randomIp(); });
    $('#prov-random-pw')?.addEventListener('click', () => { $('#prov-password').value = randomPassword(); });

    // Provision form submit
    $('#provision-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.currentOrder) return;
      const ip = $('#prov-ip').value.trim();
      const pw = $('#prov-password').value.trim();
      const user = $('#prov-username').value.trim();
      const notes = $('#prov-notes').value.trim();
      if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
        toast('Địa chỉ IP chưa đúng định dạng'); return;
      }
      if (pw.length < 8) { toast('Mật khẩu phải ≥ 8 ký tự'); return; }
      await provisionOrder(state.currentOrder.id, ip, pw, user, notes);
    });
  }

  // ========== BOOT ==========
  function init() {
    supabase = initSupabase();
    wireEvents();
    if (isLoggedIn()) {
      showShell();
      refreshAll();
    } else {
      showLogin();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
