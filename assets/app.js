(() => {
  const OWNER = 'Elliot-Wang';
  const REPO = 'daily-tech-brief';
  const BRANCH = 'main';
  const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
  const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`;
  const WEB = `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}`;
  const CACHE_KEY = 'daily-tech-brief:archive:v1';
  const CACHE_TTL = 5 * 60 * 1000;

  const $ = (id) => document.getElementById(id);
  const article = $('article');
  const status = $('status');
  const archiveEl = $('archive');
  const archiveCount = $('archiveCount');
  const searchInput = $('archiveSearch');
  const sourceLink = $('sourceLink');
  const pager = $('pager');
  const newerButton = $('newerButton');
  const olderButton = $('olderButton');

  let briefs = [];
  let currentDate = null;

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('daily-tech-brief:theme', theme);
  }

  function initTheme() {
    const saved = localStorage.getItem('daily-tech-brief:theme');
    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    setTheme(saved || (systemDark ? 'dark' : 'light'));
  }

  function toggleTheme() {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  }

  async function fetchJson(url) {
    const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw new Error(`GitHub API ${response.status}`);
    return response.json();
  }

  function readCachedArchive() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!cached?.briefs?.length) return null;
      return cached;
    } catch { return null; }
  }

  async function discoverBriefs() {
    const cached = readCachedArchive();
    if (cached && Date.now() - cached.savedAt < CACHE_TTL) return cached.briefs;

    try {
      const branch = await fetchJson(`${API}/branches/${BRANCH}`);
      const treeSha = branch.commit.commit.tree.sha;
      const tree = await fetchJson(`${API}/git/trees/${treeSha}?recursive=1`);
      const found = tree.tree
        .filter((item) => item.type === 'blob' && /^briefs\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.md$/.test(item.path))
        .map((item) => ({
          date: item.path.slice(-13, -3),
          path: item.path,
          sha: item.sha
        }))
        .sort((a, b) => b.date.localeCompare(a.date));

      if (!found.length) throw new Error('没有找到简报文件');
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), briefs: found }));
      return found;
    } catch (error) {
      if (cached?.briefs?.length) return cached.briefs;
      throw error;
    }
  }

  function weekday(date) {
    const [y, m, d] = date.split('-').map(Number);
    return ['周日','周一','周二','周三','周四','周五','周六'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  }

  function prettyDate(date) {
    const [, m, d] = date.split('-');
    return `${Number(m)} 月 ${Number(d)} 日`;
  }

  function renderArchive(filter = '') {
    const q = filter.trim().toLowerCase();
    archiveEl.innerHTML = '';
    const visible = briefs.filter((b) => b.date.toLowerCase().includes(q));
    archiveCount.textContent = `${briefs.length} 篇`;

    visible.forEach((brief) => {
      const button = document.createElement('button');
      button.className = `archive-button${brief.date === currentDate ? ' active' : ''}`;
      button.dataset.date = brief.date;
      button.innerHTML = `<span>${prettyDate(brief.date)}</span><span class="weekday">${weekday(brief.date)}</span>`;
      button.addEventListener('click', () => navigate(brief.date));
      archiveEl.appendChild(button);
    });
  }

  function showStatus(message) {
    status.textContent = message;
    status.hidden = false;
    article.hidden = true;
    pager.hidden = true;
  }

  function configureMarkdown() {
    marked.setOptions({ gfm: true, breaks: false });
  }

  async function loadBrief(date) {
    const brief = briefs.find((b) => b.date === date) || briefs[0];
    if (!brief) return;

    currentDate = brief.date;
    renderArchive(searchInput.value);
    showStatus(`正在载入 ${brief.date}…`);
    sourceLink.href = `${WEB}/${brief.path}`;

    try {
      const response = await fetch(`${RAW}/${brief.path}?v=${brief.sha}`);
      if (!response.ok) throw new Error(`Raw file ${response.status}`);
      const markdown = await response.text();
      const html = DOMPurify.sanitize(marked.parse(markdown), { USE_PROFILES: { html: true } });
      article.innerHTML = html;
      article.querySelectorAll('a').forEach((link) => {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      });

      document.title = `${brief.date} · Daily Tech Brief`;
      status.hidden = true;
      article.hidden = false;
      configurePager(brief.date);
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (window.innerWidth <= 900) document.body.classList.remove('sidebar-open');
    } catch (error) {
      showStatus(`载入失败：${error.message}。可点击右上角“查看 Markdown”直接阅读。`);
    }
  }

  function configurePager(date) {
    const index = briefs.findIndex((b) => b.date === date);
    const newer = index > 0 ? briefs[index - 1] : null;
    const older = index >= 0 && index < briefs.length - 1 ? briefs[index + 1] : null;

    newerButton.disabled = !newer;
    newerButton.textContent = newer ? `← 较新 · ${newer.date}` : '';
    newerButton.onclick = newer ? () => navigate(newer.date) : null;

    olderButton.disabled = !older;
    olderButton.textContent = older ? `较旧 · ${older.date} →` : '';
    olderButton.onclick = older ? () => navigate(older.date) : null;
    pager.hidden = false;
  }

  function navigate(date) {
    if (!briefs.some((b) => b.date === date)) date = briefs[0]?.date;
    const nextHash = `#${date}`;
    if (location.hash === nextHash) loadBrief(date);
    else location.hash = nextHash;
  }

  function route() {
    const requested = location.hash.replace(/^#\/?/, '');
    const date = briefs.some((b) => b.date === requested) ? requested : briefs[0]?.date;
    if (date) loadBrief(date);
  }

  function updateProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const value = max > 0 ? Math.min(100, Math.max(0, window.scrollY / max * 100)) : 0;
    $('progress').style.width = `${value}%`;
  }

  async function boot() {
    initTheme();
    configureMarkdown();
    $('themeButton').addEventListener('click', toggleTheme);
    $('latestButton').addEventListener('click', () => navigate(briefs[0]?.date));
    $('menuButton').addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
    $('backdrop').addEventListener('click', () => document.body.classList.remove('sidebar-open'));
    searchInput.addEventListener('input', (e) => renderArchive(e.target.value));
    window.addEventListener('hashchange', route);
    window.addEventListener('scroll', updateProgress, { passive: true });

    try {
      briefs = await discoverBriefs();
      renderArchive();
      route();
    } catch (error) {
      showStatus(`无法读取简报归档：${error.message}`);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
