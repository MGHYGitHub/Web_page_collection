(() => {
  'use strict';

  const CUSTOM_CARDS_KEY = 'mghyPortalCustomCards';
  const cardsContainer = document.getElementById('cardsContainer');
  const categoryFilter = document.getElementById('categoryFilter');
  const searchInput = document.getElementById('quickSearch');
  const cardModal = document.getElementById('cardModal');
  const cardForm = document.getElementById('cardForm');
  const announcementModal = document.getElementById('announcementModal');
  const formError = document.getElementById('cardFormError');
  const portalStatus = document.getElementById('portalStatus');
  const iconCache = new Map();
  const siteIconCache = new Map();
  const baseLinks = typeof linksData !== 'undefined' && Array.isArray(linksData) ? linksData : [];
  let activeCategory = 'all';
  let customCards = loadCustomCards();
  let portalLinks = [];
  let welcomeTimer;

  function readStorage(key, fallback = null) {
    try { return localStorage.getItem(key) ?? fallback; }
    catch { return fallback; }
  }

  function safePageUrl(value) {
    try {
      const raw = String(value || '').trim();
      if (!raw || /^(javascript|data|vbscript|blob):/i.test(raw)) return null;
      const url = new URL(raw, document.baseURI);
      return ['http:', 'https:', 'file:'].includes(url.protocol) ? url : null;
    } catch { return null; }
  }

  function normalizeCard(item, isCustom = false) {
    if (!item || typeof item !== 'object' || !safePageUrl(item.url)) return null;
    const name = String(item.name || '').trim();
    if (!name) return null;
    return {
      category: String(item.category || '自定义').trim() || '自定义',
      name,
      url: String(item.url).trim(),
      mainDesc: String(item.mainDesc || ''),
      subDesc: String(item.subDesc || ''),
      icon: String(item.icon || ''),
      localIcon: String(item.localIcon || ''),
      id: String(item.id || ''),
      isCustom
    };
  }

  function loadCustomCards() {
    try {
      const stored = JSON.parse(readStorage(CUSTOM_CARDS_KEY, '[]'));
      return Array.isArray(stored) ? stored.map(item => normalizeCard(item, true)).filter(Boolean) : [];
    } catch { return []; }
  }

  function persistCustomCards(nextCards) {
    try {
      localStorage.setItem(CUSTOM_CARDS_KEY, JSON.stringify(nextCards));
      customCards = nextCards;
      return true;
    } catch {
      return false;
    }
  }

  function refreshPortal() {
    const seen = new Set();
    portalLinks = [...baseLinks.map(item => normalizeCard(item)), ...customCards].filter(item => {
      if (!item) return false;
      const key = safePageUrl(item.url).href.replace(/\/$/, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (activeCategory !== 'all' && !portalLinks.some(item => item.category === activeCategory)) activeCategory = 'all';
    renderCategories();
    applyFilters();
    document.getElementById('toolSummary').textContent = `${portalLinks.length} 个工具 · ${new Set(portalLinks.map(item => item.category)).size} 个分类`;
    if (!baseLinks.length) setStatus('工具配置尚未加载，请检查 links.js 是否存在。', true);
  }

  function renderCategories() {
    categoryFilter.replaceChildren();
    const categories = [['all', '全部'], ...Array.from(new Set(portalLinks.map(item => item.category)), value => [value, value])];
    categories.forEach(([value, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `category-btn${value === activeCategory ? ' active' : ''}`;
      button.dataset.category = value;
      button.textContent = label;
      button.setAttribute('aria-pressed', String(value === activeCategory));
      button.addEventListener('click', () => {
        activeCategory = value;
        renderCategories();
        applyFilters();
      });
      categoryFilter.appendChild(button);
    });
  }

  function applyFilters() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const data = portalLinks.filter(item => (activeCategory === 'all' || item.category === activeCategory) &&
      [item.name, item.category, item.mainDesc, item.subDesc].some(value => value.toLocaleLowerCase().includes(query)));
    renderCards(data);
    document.getElementById('toolsHeading').textContent = activeCategory === 'all' ? '全部工具' : activeCategory;
    document.getElementById('toolsCount').textContent = query ? `找到 ${data.length} / ${portalLinks.length} 个工具` : `${data.length} 个工具`;
  }

  function renderCards(data) {
    const fragment = document.createDocumentFragment();
    if (!data.length) {
      const empty = document.createElement('p');
      empty.className = 'cards-empty';
      empty.textContent = '没有找到匹配的工具，试试其他关键词或分类。';
      fragment.appendChild(empty);
    }
    data.forEach(item => {
      const card = document.createElement('article');
      card.className = `card${item.isCustom ? ' is-custom' : ''}`;
      card.dataset.category = item.category;
      const content = document.createElement('div');
      content.className = 'card-content';
      const icon = document.createElement('div');
      icon.className = 'icon-container';
      icon.setAttribute('aria-hidden', 'true');
      const title = document.createElement('h3');
      title.className = 'card-title';
      title.textContent = item.name;
      const description = document.createElement('p');
      description.className = 'card-sub-desc';
      description.textContent = item.subDesc || item.mainDesc;
      const link = document.createElement('a');
      link.className = 'card-link';
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '打开工具 ↗';
      link.setAttribute('aria-label', `打开${item.name}（新标签页）`);
      content.append(icon, title, description, link);
      card.appendChild(content);
      if (item.isCustom) {
        const remove = document.createElement('button');
        remove.className = 'custom-remove';
        remove.type = 'button';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `删除${item.name}`);
        remove.addEventListener('click', () => removeCustomCard(item.id));
        card.appendChild(remove);
      }
      fragment.appendChild(card);
      loadIcon(icon, item);
    });
    cardsContainer.replaceChildren(fragment);
  }

  function fallbackIcon(container, item) {
    const fallback = document.createElement('span');
    fallback.className = 'card-icon';
    fallback.textContent = item.icon || '❌';
    container.replaceChildren(fallback);
  }

  function probeIcon(source) {
    return new Promise(resolve => {
      const image = new Image();
      const finish = result => {
        clearTimeout(timer);
        image.onload = image.onerror = null;
        resolve(result);
      };
      const timer = setTimeout(() => finish(null), 3500);
      image.onload = () => finish(image.naturalWidth > 0 ? source : null);
      image.onerror = () => finish(null);
      image.referrerPolicy = 'no-referrer';
      image.src = source;
    });
  }

  function discoverSiteIcons(pageUrl) {
    if (siteIconCache.has(pageUrl.href)) return siteIconCache.get(pageUrl.href);
    const request = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2200);
      try {
        const response = await fetch(pageUrl.href, { signal: controller.signal, credentials: 'omit' });
        if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '')) return [];
        const html = new DOMParser().parseFromString(await response.text(), 'text/html');
        const base = html.querySelector('base[href]');
        const baseUrl = base ? new URL(base.getAttribute('href'), response.url).href : response.url;
        return [...html.querySelectorAll('link[rel]')]
          .filter(link => /(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(link.getAttribute('rel') || ''))
          .map(link => new URL(link.getAttribute('href'), baseUrl))
          .filter(url => ['http:', 'https:'].includes(url.protocol))
          .map(url => url.href);
      } catch { return []; }
      finally { clearTimeout(timer); }
    })();
    siteIconCache.set(pageUrl.href, request);
    return request;
  }

  async function resolveIcon(item) {
    const pageUrl = safePageUrl(item.url);
    const sources = [];
    if (item.localIcon) {
      const explicitIcon = safePageUrl(item.localIcon);
      if (explicitIcon) sources.push(explicitIcon.href);
    }
    const external = pageUrl && ['http:', 'https:'].includes(pageUrl.protocol) && pageUrl.origin !== location.origin;
    const discovered = external ? discoverSiteIcons(pageUrl) : Promise.resolve([]);
    // Local tools keep their own symbol when no icon file has been configured.
    if (!external && !sources.length) return null;
    if (external) sources.push(`${pageUrl.origin}/favicon.ico`);
    for (const source of sources) {
      const found = await probeIcon(source);
      if (found) return found;
    }
    if (!external) return null;
    const fallbacks = [...await discovered, `${pageUrl.origin}/favicon.png`, `${pageUrl.origin}/apple-touch-icon.png`,
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(pageUrl.hostname)}&sz=64`,
      `https://icons.duckduckgo.com/ip3/${pageUrl.hostname}.ico`];
    for (const source of [...new Set(fallbacks)].filter(source => !sources.includes(source))) {
      const found = await probeIcon(source);
      if (found) return found;
    }
    return null;
  }

  async function loadIcon(container, item) {
    const key = `${item.url}|${item.localIcon}`;
    if (!iconCache.has(key)) iconCache.set(key, resolveIcon(item));
    const source = await iconCache.get(key);
    if (!source) { fallbackIcon(container, item); return; }
    const image = document.createElement('img');
    image.className = 'card-icon-img';
    image.alt = '';
    image.width = image.height = 26;
    image.referrerPolicy = 'no-referrer';
    image.onerror = () => fallbackIcon(container, item);
    image.src = source;
    container.replaceChildren(image);
  }

  function setStatus(message, error = false) {
    portalStatus.textContent = message;
    portalStatus.classList.toggle('error', error);
  }

  function removeCustomCard(id) {
    if (!confirm('删除这个自定义卡片吗？')) return;
    if (!persistCustomCards(customCards.filter(item => item.id !== id))) {
      setStatus('浏览器未能保存变更，请检查存储权限后重试。', true);
      return;
    }
    refreshPortal();
    setStatus('自定义卡片已删除。');
  }

  function syncModalState() {
    document.body.classList.toggle('modal-open', cardModal.open || announcementModal.open);
  }

  function openCardModal() {
    if (announcementModal.open) announcementModal.close();
    formError.textContent = '';
    if (!cardModal.open) cardModal.showModal();
    syncModalState();
    document.getElementById('cardName').focus();
  }

  function closeCardModal() { cardModal.close(); }

  [cardModal, announcementModal].forEach(dialog => {
    dialog.addEventListener('close', () => {
      if (dialog === cardModal) cardForm.reset();
      syncModalState();
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  });

  document.getElementById('addCardBtn').addEventListener('click', openCardModal);
  document.getElementById('widgetAddBtn').addEventListener('click', openCardModal);
  document.getElementById('cancelCardBtn').addEventListener('click', closeCardModal);
  document.getElementById('closeCardBtn').addEventListener('click', closeCardModal);
  searchInput.addEventListener('input', applyFilters);
  cardForm.addEventListener('submit', event => {
    event.preventDefault();
    formError.textContent = '';
    const name = document.getElementById('cardName').value.trim();
    const url = document.getElementById('cardUrl').value.trim();
    if (!name) { formError.textContent = '请填写卡片名称。'; document.getElementById('cardName').focus(); return; }
    if (!/^(https?:\/\/|\.\/|\.\.\/|\/)/i.test(url) || !safePageUrl(url)) {
      formError.textContent = '链接请使用 https://、http://、./、../ 或 / 开头。';
      document.getElementById('cardUrl').focus();
      return;
    }
    if (portalLinks.some(item => safePageUrl(item.url).href.replace(/\/$/, '') === safePageUrl(url).href.replace(/\/$/, ''))) {
      formError.textContent = '这个链接已经在工具台中，无需重复添加。';
      return;
    }
    const card = normalizeCard({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name, url,
      category: document.getElementById('cardCategory').value.trim() || '自定义',
      icon: document.getElementById('cardIcon').value.trim(),
      subDesc: document.getElementById('cardDesc').value.trim()
    }, true);
    if (!persistCustomCards([...customCards, card])) {
      formError.textContent = '浏览器未能保存卡片，请检查存储权限后重试。';
      return;
    }
    activeCategory = 'all';
    searchInput.value = '';
    closeCardModal();
    refreshPortal();
    setStatus('卡片已保存到当前浏览器。');
  });

  document.getElementById('exportCardsBtn').addEventListener('click', () => {
    const exported = portalLinks.map(({ id, isCustom, ...item }) => {
      if (!item.localIcon) delete item.localIcon;
      if (!item.icon) delete item.icon;
      return item;
    });
    const content = `// 由 MGHY 本地工具门户导出\n// 上传时替换网站根目录的 links.js\nconst linksData = ${JSON.stringify(exported, null, 2)};\n`;
    const objectUrl = URL.createObjectURL(new Blob([content], { type: 'text/javascript;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'links.js';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    setStatus('links.js 已导出，包含全部现有卡片。');
  });

  function openAnnouncement() {
    if (cardModal.open) return;
    if (!announcementModal.open) announcementModal.showModal();
    syncModalState();
  }
  document.getElementById('openAnnouncementBtn').addEventListener('click', openAnnouncement);
  ['closeAnnouncementBtn', 'confirmAnnouncementBtn'].forEach(id => document.getElementById(id).addEventListener('click', () => announcementModal.close()));
  document.getElementById('dontShowAnnouncementBtn').addEventListener('click', () => {
    try { localStorage.setItem('announcementDontShowUntil', String(Date.now() + 86400000)); }
    catch { setStatus('浏览器未能保存公告偏好。', true); }
    announcementModal.close();
  });

  let widgetTimer;
  function refreshWidgets() {
    const now = new Date();
    document.getElementById('portalClock').textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    document.getElementById('portalDate').textContent = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((Date.UTC(2026, 11, 19) - today) / 86400000);
    document.getElementById('examCountdown').textContent = days > 0 ? `${days} 天` : days === 0 ? '今天考试' : '考试已结束';
  }
  function resumeWidgets() { clearInterval(widgetTimer); refreshWidgets(); widgetTimer = setInterval(refreshWidgets, 15000); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearInterval(widgetTimer); else resumeWidgets(); });
  window.addEventListener('storage', event => {
    if (event.key !== CUSTOM_CARDS_KEY) return;
    customCards = loadCustomCards();
    refreshPortal();
  });
  refreshPortal();
  resumeWidgets();
  // First-visit guidance must not put a modal backdrop over the user's first click.
  if (Number(readStorage('announcementDontShowUntil', '0')) <= Date.now()) {
    welcomeTimer = setTimeout(() => {
      if (!cardModal.open && !announcementModal.open && !portalStatus.textContent) {
        setStatus('可添加自己的快捷卡片，更多说明见页面下方“使用说明”。');
      }
    }, 1000);
    const cancelWelcome = () => clearTimeout(welcomeTimer);
    document.addEventListener('pointerdown', cancelWelcome, { once: true, capture: true });
    document.addEventListener('keydown', cancelWelcome, { once: true, capture: true });
  }
})();
