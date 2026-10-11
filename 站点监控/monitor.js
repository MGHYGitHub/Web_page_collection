(() => {
  'use strict';
  const STORE = 'mghyUptimeMonitors';
  const defaultSites = [['主站', 'mghy.top'], ['WWW', 'www.mghy.top'], ['AI 服务', 'ai.mghy.top'], ['文档库', 'docs.mghy.top'], ['个人主页', 'zy.mghy.top'], ['图床', 'tu.mghy.top']];
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  function validUrl(raw, type = 'https') {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) throw new Error('只支持 HTTP / HTTPS 地址。');
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `${type}://${raw}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('请填写有效的 HTTP / HTTPS 地址，不包含用户名和密码。');
    url.hash = '';
    return url;
  }
  function clean(item) {
    if (!item || typeof item.name !== 'string' || typeof item.url !== 'string') return null;
    try {
      const url = validUrl(item.url);
      const history = Array.isArray(item.history) ? item.history.filter(x => x && Number.isFinite(x.at)).slice(-60).map(x => ({
        status: ['up', 'down', 'unknown'].includes(x.status) ? x.status : x.msg === '可连接' || x.ok ? 'unknown' : 'down',
        ms: Number.isFinite(x.ms) && x.ms >= 0 ? x.ms : null,
        at: x.at, msg: String(x.msg || '').slice(0, 200)
      })) : [];
      return {id: String(item.id || `custom-${url.href}`), name: item.name.trim().slice(0, 40) || url.hostname, url: url.href, type: url.protocol.slice(0, -1), paused: !!item.paused, history};
    } catch { return null; }
  }
  const saved = read(STORE, {});
  const savedItems = (Array.isArray(saved) ? saved : Array.isArray(saved?.monitors) ? saved.monitors : []).map(clean).filter(Boolean);
  const monitors = defaultSites.map(([name, host]) => {
    const id = `default-${host}`, url = `https://${host}/`, previous = savedItems.find(item => item.id === id || item.url === url);
    return {...(previous || {name, type: 'https', url, history: [], paused: false}), id, default: true};
  });
  savedItems.forEach(item => { if (!monitors.some(m => m.url === item.url || m.id === item.id)) monitors.push(item); });
  const rawSettings = read('mghyMonitorSettings', {});
  let settings = {interval: 60, timeout: 10};
  if (Number.isFinite(rawSettings?.interval)) settings.interval = Math.min(3600, Math.max(30, rawSettings.interval));
  if (Number.isFinite(rawSettings?.timeout)) settings.timeout = Math.min(30, Math.max(3, rawSettings.timeout));
  let selected = 0, timer, inFlight = false, refreshPending = false, overview = false, returnFocus;
  const controllers = new Map();
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({version: 2, monitors}));
      localStorage.setItem('mghyMonitorSettings', JSON.stringify(settings));
    } catch { $('storageNote').textContent = '本地保存不可用，可在设置中导出备份。'; }
  }
  const latest = m => m.history.at(-1);
  const status = m => m.paused ? 'paused' : latest(m)?.status || 'waiting';
  const labels = {up: 'HTTP 正常', down: '检测失败', unknown: '状态受限', paused: '已暂停', waiting: '待检测'};
  const statusClass = s => s === 'down' ? 'down' : s === 'up' ? 'up' : s === 'unknown' ? 'unknown' : 'wait';
  function percent(m) {
    const known = m.history.slice(-20).filter(x => x.status !== 'unknown');
    return known.length ? Math.round(known.filter(x => x.status === 'up').length / known.length * 100) : null;
  }
  function beats(history, length) {
    const padding = Math.max(0, length - history.length);
    return Array.from({length}, (_, i) => {
      const point = history[i - padding];
      const title = point ? `${new Date(point.at).toLocaleString('zh-CN')} · ${point.msg}` : '暂无数据';
      return `<i class="beat ${point ? statusClass(point.status) : 'wait'}" title="${esc(title)}"></i>`;
    }).join('');
  }
  function renderList() {
    const q = $('search').value.trim().toLowerCase();
    $('monitorList').innerHTML = '';
    monitors.forEach((m, i) => {
      if (!`${m.name} ${m.url}`.toLowerCase().includes(q)) return;
      const s = status(m), p = percent(m);
      const row = document.createElement('button');
      row.type = 'button'; row.className = `monitor-row ${i === selected && !overview ? 'selected' : ''}`;
      row.setAttribute('aria-pressed', String(i === selected && !overview));
      row.setAttribute('aria-label', `${m.name}，${labels[s]}`);
      row.innerHTML = `<span class="percent ${statusClass(s)}">${s === 'paused' ? 'Ⅱ' : p === null ? '--' : p + '%'}</span><div><div class="monitor-name">${esc(m.name)}<small class="monitor-type">${m.type.toUpperCase()}</small></div><span class="monitor-host">${esc(m.url.replace(/^https?:\/\//i, ''))}</span><div class="heartbeats">${beats(m.history.slice(-20), 20)}</div></div>`;
      row.onclick = () => { selected = i; overview = false; render(); };
      $('monitorList').appendChild(row);
    });
    if (!$('monitorList').children.length) $('monitorList').innerHTML = '<p class="empty-search">没有匹配的监控</p>';
  }
  function render() {
    $('statusPageBtn').classList.toggle('active', overview);
    $('dashboardBtn').classList.toggle('active', !overview);
    $('intervalNote').textContent = `页面打开时每 ${settings.interval} 秒检测 · 本机历史最多保存 60 次`;
    renderList();
    if (overview) {
      $('detail').innerHTML = `<section class="monitor-title"><div><h1>站点状态概览</h1><p class="interval-note">本机浏览器检测 · ${inFlight ? '检测中…' : '点击站点查看详情'}</p></div></section><div class="overview-grid">${monitors.map((m, i) => `<button class="overview-item" data-index="${i}"><strong>${esc(m.name)}</strong><span class="status-text ${statusClass(status(m))}">${labels[status(m)]}</span><small>${esc(latest(m)?.msg || '等待首次检测')}</small></button>`).join('')}</div>`;
      $('detail').querySelectorAll('[data-index]').forEach(button => button.onclick = () => { selected = Number(button.dataset.index); overview = false; render(); });
      return;
    }
    selected = Math.max(0, Math.min(selected, monitors.length - 1));
    const m = monitors[selected];
    if (!m) { $('detail').innerHTML = '<div class="empty">暂无监控项目</div>'; return; }
    const last = latest(m), s = status(m), history = m.history.slice(-30), p = percent(m);
    const samples = history.filter(x => x.ms !== null && x.status !== 'down');
    const avg = samples.length ? Math.round(samples.reduce((sum, x) => sum + x.ms, 0) / samples.length) : null;
    $('detail').innerHTML = `<section class="monitor-title"><div><h1>${esc(m.name)}</h1><a class="monitor-url" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">${esc(m.url)}</a></div><div class="actions"><button class="action pause" id="pauseBtn">${m.paused ? '▶ 恢复' : 'Ⅱ 暂停'}</button>${m.default ? '' : '<button class="action danger" id="deleteBtn">删除</button>'}</div></section>
      <section class="status-card"><div><div class="big-heartbeats">${beats(history, 30)}</div><div class="interval-note">每 ${settings.interval} 秒检测 · ${m.paused ? '已暂停' : inFlight ? '正在检测' : '浏览器监控中'}</div><p class="result-note">${esc(last?.msg || '等待首次检测')}<br><small>最近检测：${last ? new Date(last.at).toLocaleString('zh-CN') : '暂无'} </small></p></div><div class="status-badge ${statusClass(s)}">${labels[s]}</div></section>
      <section class="metrics"><div class="metric"><b>${last?.ms != null ? last.ms + ' ms' : '--'}</b><small>本机请求耗时</small></div><div class="metric"><b>${avg !== null ? avg + ' ms' : '--'}</b><small>平均请求耗时</small></div><div class="metric"><b>${p === null ? '--' : p + '%'}</b><small>HTTP 正常率（状态可读时）</small></div><div class="metric"><b>${m.history.length}</b><small>已记录检测</small></div><div class="metric"><b>${m.type.toUpperCase()}</b><small>协议</small></div></section>
      <section class="chart-card"><div class="chart-head"><span>请求耗时趋势</span><small>最近 30 次 · 蓝色表示 HTTP 状态不可读</small></div><canvas id="chart" role="img" aria-label="最近请求耗时趋势"></canvas></section>`;
    $('pauseBtn').onclick = () => {
      m.paused = !m.paused;
      if (m.paused) controllers.get(m.id)?.abort('paused');
      save(); render(); if (!m.paused) requestCheck();
    };
    if ($('deleteBtn')) $('deleteBtn').onclick = () => {
      if (!confirm(`删除“${m.name}”及其本机检测历史？`)) return;
      controllers.get(m.id)?.abort('deleted'); monitors.splice(selected, 1); selected = 0; save(); render();
    };
    drawChart(history);
  }
  function drawChart(history) {
    const canvas = $('chart'); if (!canvas) return;
    const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    const c = canvas.getContext('2d'); if (!c) return;
    c.scale(dpr, dpr);
    const w = rect.width, h = rect.height, p = 36, max = Math.max(300, ...history.map(x => x.ms || 0)) * 1.15;
    c.strokeStyle = '#25333e'; c.lineWidth = 1;
    for (let i = 0; i < 5; i++) { const y = p + i * (h - p * 2) / 4; c.beginPath(); c.moveTo(p, y); c.lineTo(w - p, y); c.stroke(); }
    c.font = '11px sans-serif'; c.fillStyle = '#a1b3c1';
    if (!history.some(x => x.ms !== null)) { c.fillText('等待首个请求数据…', p, h / 2); return; }
    c.fillText(`${Math.round(max)} ms`, 4, p - 10); c.fillText('0 ms', 4, h - p + 15);
    let previous = null;
    history.forEach((point, i) => {
      if (point.ms === null || point.status === 'down') { previous = null; return; }
      const x = p + i * (w - p * 2) / Math.max(1, history.length - 1), y = h - p - point.ms / max * (h - p * 2);
      c.strokeStyle = c.fillStyle = point.status === 'unknown' ? '#62a7ff' : '#55df91'; c.lineWidth = 2;
      if (previous) { c.beginPath(); c.moveTo(previous.x, previous.y); c.lineTo(x, y); c.stroke(); }
      c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill(); previous = {x, y};
    });
  }
  async function check(m) {
    if (m.paused) return;
    const started = performance.now(), controller = new AbortController();
    controllers.set(m.id, controller);
    let result = {status: 'down', ms: null, at: Date.now(), msg: '无法获取响应（可能为网络、浏览器策略或站点故障）'};
    const timeout = setTimeout(() => controller.abort('timeout'), settings.timeout * 1000);
    try {
      if (m.type === 'http' && location.protocol === 'https:') throw new Error('HTTPS 页面不能检测 HTTP 混合内容，请使用 HTTPS 地址。');
      // Keep endpoint query strings and signed URLs intact; bypass cache through fetch options.
      const response = await fetch(m.url, {mode: 'no-cors', cache: 'no-store', credentials: 'omit', signal: controller.signal});
      result.ms = Math.round(performance.now() - started);
      if (response.type === 'opaque') { result.status = 'unknown'; result.msg = '已收到跨域响应，浏览器未公开 HTTP 状态，无法确认服务是否正常。'; }
      else { result.status = response.ok ? 'up' : 'down'; result.msg = `HTTP ${response.status} ${response.statusText}`.trim(); }
    } catch (error) {
      if (controller.signal.reason === 'timeout' || error?.name === 'AbortError') result.msg = `请求超时（${settings.timeout} 秒）`;
      else if (m.type === 'http' && location.protocol === 'https:') result.msg = error.message;
    } finally { clearTimeout(timeout); controllers.delete(m.id); }
    if (m.paused || !monitors.includes(m) || (controller.signal.aborted && controller.signal.reason !== 'timeout')) return;
    m.history.push(result); m.history = m.history.slice(-60);
  }
  async function checkAll() {
    if (inFlight) return;
    inFlight = true; $('refreshBtn').disabled = true; $('refreshBtn').textContent = '…';
    try { await Promise.allSettled(monitors.map(check)); }
    finally {
      inFlight = false; $('refreshBtn').disabled = false; $('refreshBtn').textContent = '⟳'; save(); render();
      if (refreshPending) { refreshPending = false; checkAll(); }
    }
  }
  function requestCheck() { if (inFlight) refreshPending = true; else checkAll(); }
  function startTimer() { clearInterval(timer); timer = setInterval(checkAll, settings.interval * 1000); }
  function openModal(id) {
    if (id === 'modal') $('formError').textContent = '';
    returnFocus = document.activeElement; $(id).classList.add('show'); $(id).setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    $(id).querySelector('input, button').focus();
  }
  function closeModal(id) { $(id).classList.remove('show'); $(id).setAttribute('aria-hidden', 'true'); document.body.classList.remove('modal-open'); returnFocus?.focus(); }
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal.id); });
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeModal(modal.id); }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(modal.querySelectorAll('input, select, button, a[href]')).filter(el => !el.disabled);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  });
  $('refreshBtn').onclick = checkAll; $('search').oninput = renderList;
  $('addBtn').onclick = () => openModal('modal');
  $('cancelBtn').onclick = () => { closeModal('modal'); $('monitorForm').reset(); };
  $('monitorForm').onsubmit = event => {
    event.preventDefault();
    try {
      const type = $('typeInput').value, url = validUrl($('urlInput').value.trim(), type);
      if (url.protocol !== `${type}:`) throw new Error(`请选择 ${url.protocol.slice(0, -1).toUpperCase()} 类型，或填写相同协议的地址。`);
      if (monitors.some(m => m.url === url.href)) throw new Error('该地址已在监控中。');
      const name = $('nameInput').value.trim(); if (!name) throw new Error('请填写监控名称。');
      const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      monitors.push({id: `custom-${id}`, name, type, url: url.href, history: [], paused: false});
      selected = monitors.length - 1; overview = false; $('cancelBtn').click(); save(); render(); requestCheck();
    } catch (error) { $('formError').textContent = error.message; }
  };
  $('statusPageBtn').onclick = () => { overview = true; render(); };
  $('dashboardBtn').onclick = () => { overview = false; render(); };
  $('settingsBtn').onclick = () => { $('intervalInput').value = settings.interval; $('timeoutInput').value = settings.timeout; openModal('settingsModal'); };
  $('settingsCancel').onclick = () => closeModal('settingsModal');
  $('settingsForm').onsubmit = event => {
    event.preventDefault();
    if (!$('settingsForm').reportValidity()) return;
    const interval = Number($('intervalInput').value), timeout = Number($('timeoutInput').value);
    if (!Number.isInteger(interval) || interval < 30 || interval > 3600 || !Number.isInteger(timeout) || timeout < 3 || timeout > 30) return;
    settings = {interval, timeout};
    save(); startTimer(); closeModal('settingsModal'); render();
  };
  $('backupBtn').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({version: 2, settings, monitors}, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = `站点监控备份_${new Date().toLocaleDateString('sv-SE')}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  window.addEventListener('resize', () => drawChart(monitors[selected]?.history.slice(-30) || []));
  window.addEventListener('pagehide', () => { refreshPending = false; save(); controllers.forEach(controller => controller.abort('page-hidden')); });
  render(); startTimer(); checkAll();
})();
