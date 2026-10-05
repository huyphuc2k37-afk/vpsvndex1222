(() => {
  const terminal = document.querySelector('#terminal');
  const input = document.querySelector('#command-input');
  const form = document.querySelector('#command-form');
  const prompt = document.querySelector('#prompt');
  const host = document.querySelector('#console-host');
  const instanceId = new URLSearchParams(location.search).get('instance');
  const apiBase = window.VPS_API_BASE || (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://127.0.0.1:8787' : 'https://api.vpsvndex.click');
  let socket;
  let history = [];
  let historyIndex = 0;
  const add = (text, className = 'output') => { const line = document.createElement('div'); line.className = `console-line ${className}`; line.textContent = text; terminal.append(line); terminal.scrollTop = terminal.scrollHeight; };
  const api = async (path, options = {}) => { const { data } = await window.supabase.auth.getSession(); const response = await fetch(`${apiBase}${path}`, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${data.session?.access_token || ''}` } }); if (!response.ok) throw new Error('Không được phép truy cập console'); return response.json(); };
  const boot = async () => {
    if (!window.supabase) throw new Error('Supabase chưa sẵn sàng');
    const { data } = await window.supabase.auth.getSession();
    if (!data.session || !instanceId) throw new Error('Vui lòng đăng nhập và chọn VPS từ dashboard');
    const ticket = await api(`/v1/instances/${encodeURIComponent(instanceId)}/terminal-token`, { method: 'POST' });
    const wsUrl = `${ticket.terminalUrl}?token=${encodeURIComponent(ticket.token)}`;
    socket = new WebSocket(wsUrl);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'login', terminalToken: ticket.token })));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'auth' && message.ok) { host.textContent = message.session.profile.hostname; prompt.textContent = `root@${message.session.profile.hostname}:~#`; add(`Ubuntu 24.04 LTS · ${message.session.profile.hostname}`); input.focus(); }
      if (message.type === 'result') { if (message.output) add(message.output, message.exitCode ? 'error' : 'output'); prompt.textContent = `root@${message.session.profile.hostname}:${message.cwd === '/root' ? '~' : message.cwd}#`; }
      if (message.type === 'error') add(message.error, 'error');
    });
    socket.addEventListener('close', () => add('Console connection closed.', 'error'));
  };
  form.addEventListener('submit', (event) => { event.preventDefault(); const command = input.value.trim(); if (!command || !socket || socket.readyState !== WebSocket.OPEN) return; history = [command, ...history.filter((item) => item !== command)].slice(0, 50); historyIndex = 0; add(`${prompt.textContent} ${command}`, 'command'); input.value = ''; socket.send(JSON.stringify({ type: 'command', command })); });
  input.addEventListener('keydown', (event) => { if (event.key === 'ArrowUp') { event.preventDefault(); input.value = history[historyIndex++] || ''; } if (event.key === 'ArrowDown') { event.preventDefault(); input.value = history[Math.max(0, --historyIndex)] || ''; } if (event.key === 'c' && event.ctrlKey) { input.value = ''; add('^C'); } });
  boot().catch((error) => add(error.message, 'error'));
})();
