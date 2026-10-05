/* =============================================================
 * VPSVNDEX Admin — Production v2.0
 * Security: Role-based auth với Supabase RLS
 * Features: Stats dashboard, order management, audit logs
 * ============================================================= */
(function () {
  'use strict';

  // ========== CONFIG ==========
  const SESSION_KEY = 'vpsvndex_admin_session';

  // ========== UTILS ==========
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const moneyFmt = new Intl.NumberFormat('vi-VN');
  const formatMoney = (v) => `${moneyFmt.format(v)}đ`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const shortId = (id) => id ? id.slice(0, 8).toUpperCase() : '—';
  const formatDate = (iso) => iso ? new Date(iso).toLocaleString('vi-VN') : '—';

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
  let currentUser = null;
  let isAdmin = false;

  function initSupabase() {
    try {
      const cfg = window.SUPABASE_CONFIG || {};
      if (!cfg.url || !cfg.anonKey || typeof window.supabase === 'undefined') {
        console.warn('[admin] Supabase chưa sẵn sàng');
        return null;
      }
      return window.supabase.createClient(cfg.url, cfg.anonKey, cfg.options || {});
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

  // Check if user has admin role
  async function checkAdminRole() {
    if (!supabase || !currentUser) return false;
    
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', currentUser.id)
        .single();
      
      if (error) {
        console.warn('[checkAdminRole]', error);
        return false;
      }
      
      return data?.role === 'admin' || data?.role === 'superadmin';
    } catch (err) {
      console.warn('[checkAdminRole]', err);
      return false;
    }
  }

  // ========== STATE ==========
  const state = {
    orders: [],
    filter: 'all',
    search: '',
    currentOrder: null,
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
    
    // Stats mới
    if (stats.today !== undefined) {
      const todayEl = document.createElement('article');
      todayEl.innerHTML = `<span>Hôm nay</span><strong>${stats.today}</strong>`;
      $('#admin-stats').appendChild(todayEl);
    }
  }

  function matchesFilter(o) {
    if (state.filter !== 'all' && o.status !== state.filter) return false;
    if (!state.search) return true;
    const q = state.search.toLowerCase();
    return [o.id, o.user_email, o.package_id, o.instance_id]
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
    if (o.status === 'provisioned' && o.instance_id) {
      return `
        <div class="vps-creds">
          <span><small>Instance:</small> ${esc(o.instance_id)}</span>
          <span><small>Host:</small> ${esc(o.hostname || '—')}</span>
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
        <td class="cell-customer" data-label="Email">
          <strong>${esc(o.user_email)}</strong>
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
      if (e?.message?.includes('Access denied')) {
        toast('⚠️ Không có quyền admin. Vui lòng liên hệ support.');
        setTimeout(() => {
          logout();
          showLogin();
        }, 2000);
      }
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
      const msg = e?.message || 'lỗi';
      if (msg.includes('Access denied')) {
        toast('⚠️ Không có quyền admin');
        setTimeout(() => {
          logout();
          showLogin();
        }, 2000);
      } else {
        toast('Không tải được danh sách đơn: ' + msg);
      }
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

  async function provisionOrder(id, instanceId, hostname, username, notes) {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc('admin_provision_order', {
        p_order_id: id,
        p_instance_id: instanceId,
        p_hostname: hostname,
        p_vps_username: username || 'root',
        p_admin_notes: notes || null,
      });
      if (error) throw error;
      toast('✓ Đã cấp VPS cho đơn #' + shortId(id));
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
      <div><span>Khách hàng</span><strong>${esc(order.user_email)}</strong></div>
      <div><span>Gói</span><strong>${esc(order.package_id)} · ${esc(order.region)}</strong></div>
      <div><span>Số tiền</span><strong>${formatMoney(order.amount_vnd)}</strong></div>
      <div><span>Trạng thái</span>${statusBadge(order.status)}</div>
    `;
    $('#prov-username').value = order.vps_username || 'root';
    $('#prov-ip').value       = order.instance_id || '';
    $('#prov-password').value = order.hostname || '';
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
    $('#admin-login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('#admin-username').value.trim();
      const password = $('#admin-password').value;
      const submit = $('#admin-login-submit');
      
      submit.disabled = true;
      setLoginFeedback('Đang kiểm tra...', 'info');
      
      try {
        if (!supabase) throw new Error('Supabase chưa được cấu hình');
        
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        currentUser = data.user;
        
        // Check admin role
        const hasAdminAccess = await checkAdminRole();
        if (!hasAdminAccess) {
          await supabase.auth.signOut();
          setLoginFeedback('⚠️ Tài khoản này không có quyền admin. Vui lòng liên hệ support.', 'error');
          submit.disabled = false;
          return;
        }
        
        isAdmin = true;
        login();
        setLoginFeedback('✓ Đăng nhập thành công', 'success');
        showShell();
        await refreshAll();
      } catch (error) {
        setLoginFeedback(error?.message || 'Sai tài khoản hoặc mật khẩu', 'error');
      } finally {
        submit.disabled = false;
      }
    });

    // Logout
    $('#admin-logout')?.addEventListener('click', async () => {
      if (supabase) await supabase.auth.signOut();
      logout();
      currentUser = null;
      isAdmin = false;
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

    // Table actions
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

    // Provision form submit
    $('#provision-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.currentOrder) return;
      
      const instanceId = $('#prov-ip').value.trim();
      const hostname = $('#prov-password').value.trim();
      const username = $('#prov-username').value.trim() || 'root';
      const notes = $('#prov-notes').value.trim();
      
      if (!instanceId || !hostname) {
        toast('Vui lòng điền đầy đủ Instance ID và Hostname');
        return;
      }
      
      await provisionOrder(state.currentOrder.id, instanceId, hostname, username, notes);
    });
  }

  // ========== BOOT ==========
  async function init() {
    supabase = initSupabase();
    wireEvents();
    
    if (isLoggedIn()) {
      // Verify session still valid
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) {
          currentUser = data.session.user;
          const hasAccess = await checkAdminRole();
          if (hasAccess) {
            isAdmin = true;
            showShell();
            await refreshAll();
            return;
          }
        }
      }
      // Session invalid or not admin
      logout();
    }
    
    showLogin();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
