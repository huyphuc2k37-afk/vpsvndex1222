import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const port = Number(process.env.PORT || 8787);
const simulatorUrl = process.env.SIMULATOR_URL || 'http://127.0.0.1:3000';
const sharedSecret = process.env.API_SHARED_SECRET || '';
const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const corsOrigin = process.env.CORS_ORIGIN || 'https://vpsvndex.click';
const adminEmails = new Set((process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
const cliUsername = process.env.CLI_USERNAME || process.env.VPS_USERNAME || 'root';
const cliPassword = process.env.CLI_PASSWORD || process.env.VPS_PASSWORD || '';

const json = (res, status, payload) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(status === 204 ? '' : JSON.stringify(payload));
};

const readBody = async (req) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
};

const requestJson = (url, options = {}) => new Promise((resolve, reject) => {
  const parsed = new URL(url);
  const requester = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
  const req = requester(parsed, options, (res) => {
    let raw = '';
    res.on('data', (chunk) => { raw += chunk; });
    res.on('end', () => {
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
      resolve({ status: res.statusCode || 500, data });
    });
  });
  req.on('error', reject);
  if (options.body) req.write(options.body);
  req.end();
});

const supabaseRequest = async (path, { method = 'GET', body, token, service = false } = {}) => {
  const key = service ? serviceRoleKey : supabaseAnonKey;
  const headers = { apikey: key, Authorization: `Bearer ${token || key}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, data: await res.json().catch(() => null) }));
};

const currentUser = async (token) => {
  if (!token || !supabaseUrl || !supabaseAnonKey) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  return response.json();
};

const isAdmin = (user) => Boolean(
  user?.app_metadata?.role === 'admin'
  || user?.user_metadata?.role === 'admin'
  || adminEmails.has(String(user?.email || '').toLowerCase()),
);

const authToken = (req) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
const simulatorRequest = (path, method, body, extraHeaders = {}) => requestJson(`${simulatorUrl}${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'x-api-secret': sharedSecret, ...extraHeaders },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const orderWithInstances = async (orders) => {
  const instances = await supabaseRequest('instances?select=*', { service: true });
  const byOrder = new Map((instances.data || []).map((instance) => [instance.order_id, instance]));
  return (orders || []).map((order) => ({ ...order, ...(byOrder.get(order.id) || {}) }));
};

const adminOrders = async () => {
  const result = await supabaseRequest('orders?select=*&order=created_at.desc', { service: true });
  return { status: result.status, data: await orderWithInstances(result.data || []) };
};

const adminStats = async () => {
  const result = await supabaseRequest('orders?select=status,amount_vnd', { service: true });
  if (result.status >= 300) return result;
  const stats = { total: result.data.length, pending: 0, confirmed: 0, provisioned: 0, cancelled: 0, revenue: 0 };
  for (const order of result.data) {
    if (order.status in stats) stats[order.status] += 1;
    if (order.status === 'provisioned') stats.revenue += Number(order.amount_vnd || 0);
  }
  return { status: 200, data: stats };
};

const provisionOrder = async (orderId, username, notes) => {
  const orderResult = await supabaseRequest(`orders?id=eq.${encodeURIComponent(orderId)}&select=*`, { service: true });
  const order = orderResult.data?.[0];
  if (!order) return { status: 404, data: { error: 'Order not found' } };

  const existing = await supabaseRequest(`instances?order_id=eq.${encodeURIComponent(orderId)}&select=*`, { service: true });
  if (existing.data?.[0]) return { status: 200, data: { ...order, ...existing.data[0] } };
  if (!['pending', 'confirmed'].includes(order.status)) return { status: 409, data: { error: 'Order is not provisionable' } };

  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  const simulator = await simulatorRequest('/api/internal/instances', 'POST', {
    userId: order.user_id,
    orderId: order.id,
    planId: order.package_id,
    expiresAt,
  });
  if (simulator.status >= 300) return { status: 502, data: { error: 'Simulator unavailable', details: simulator.data } };

  const instance = simulator.data;
  const instanceRow = {
    instance_id: instance.instanceId,
    user_id: order.user_id,
    order_id: order.id,
    hostname: instance.hostname,
    plan_id: instance.planId,
    status: instance.status,
    created_at: instance.createdAt,
    expires_at: instance.expiresAt,
    terminal_url: instance.terminalUrl,
    username: username || instance.username || 'root',
  };
  const inserted = await supabaseRequest('instances', { method: 'POST', body: instanceRow, service: true });
  if (inserted.status >= 300) return { status: 502, data: { error: 'Could not persist instance', details: inserted.data } };

  const updated = await supabaseRequest(`orders?id=eq.${encodeURIComponent(order.id)}`, {
    method: 'PATCH',
    body: { status: 'provisioned', updated_at: new Date().toISOString() },
    service: true,
  });
  if (updated.status >= 300) return { status: 502, data: { error: 'Could not update order', details: updated.data } };
  return { status: 200, data: { ...order, ...instanceRow, status: 'provisioned', admin_notes: notes || null } };
};

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    if (url.pathname === '/health') return json(res, 200, { ok: true });

    if (req.method === 'POST' && url.pathname === '/v1/cli/terminal-token') {
      const body = await readBody(req);
      if (!cliPassword || body.username !== cliUsername || body.password !== cliPassword) return json(res, 401, { error: 'Invalid credentials' });
      const instance = await simulatorRequest('/api/internal/instances', 'POST', {
        userId: `cli:${cliUsername}`,
        orderId: `cli:${Date.now()}`,
        planId: 'cli',
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      });
      if (instance.status >= 300) return json(res, 502, { error: 'Simulator unavailable' });
      const ticket = await simulatorRequest(`/api/instances/${encodeURIComponent(instance.data.instanceId)}/terminal-token`, 'POST', undefined, { 'x-user-id': `cli:${cliUsername}` });
      return json(res, ticket.status, ticket.data);
    }

    const token = authToken(req);
    const user = await currentUser(token);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    if (req.method === 'POST' && /^\/v1\/instances\/[^/]+\/terminal-token$/.test(url.pathname)) {
      const instanceId = url.pathname.split('/')[3];
      const result = await supabaseRequest(`instances?instance_id=eq.${encodeURIComponent(instanceId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*`, { token });
      const instance = result.data?.[0];
      if (!instance) return json(res, 404, { error: 'Instance not found' });
      await simulatorRequest('/api/internal/instances/hydrate', 'POST', instance);
      const ticket = await simulatorRequest(`/api/instances/${encodeURIComponent(instance.instance_id)}/terminal-token`, 'POST', undefined, { 'x-user-id': user.id });
      return json(res, ticket.status, ticket.data);
    }

    if (!isAdmin(user)) return json(res, 403, { error: 'Admin access required' });

    if (req.method === 'GET' && url.pathname === '/v1/admin/orders') {
      const result = await adminOrders();
      return json(res, result.status, result.data);
    }
    if (req.method === 'GET' && url.pathname === '/v1/admin/stats') {
      const result = await adminStats();
      return json(res, result.status, result.data);
    }
    const statusMatch = url.pathname.match(/^\/v1\/admin\/orders\/([^/]+)\/status$/);
    if (req.method === 'POST' && statusMatch) {
      const body = await readBody(req);
      const result = await supabaseRequest(`orders?id=eq.${encodeURIComponent(statusMatch[1])}`, { method: 'PATCH', body: { status: body.status, updated_at: new Date().toISOString() }, service: true });
      return json(res, result.status >= 300 ? 502 : 200, result.status >= 300 ? { error: 'Could not update order', details: result.data } : { ok: true });
    }
    const provisionMatch = url.pathname.match(/^\/v1\/admin\/orders\/([^/]+)\/provision$/);
    if (req.method === 'POST' && provisionMatch) {
      const body = await readBody(req);
      const result = await provisionOrder(provisionMatch[1], body.username, body.notes);
      return json(res, result.status, result.data);
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'Internal error' });
  }
});

server.listen(port, '127.0.0.1', () => console.log(`VPSVNDEX API listening on 127.0.0.1:${port}`));
