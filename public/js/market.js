// Plugin store: themed list/search/download for ordinary, Forge and live installed plugins.
// i18n-ignore-file: standalone market page (Chinese-first; a language pack can wrap it later)
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const token = new URLSearchParams(location.search).get('token') || '';
const KIND = { ordinary: '普通插件', forge: 'Forge 包', installed: '本机插件' };
const CLASS = { cosmetic: '外观', content: '玩法', ui: '界面', script: '脚本', trusted: '信任', lang: '语言', forge: 'Forge 转换' };
const STATUS = { active: '使用中', pending: '未审核', rejected: '已拒绝', installed: '使用中' };
let tab = 'ordinary';
let data = { plugins: [], installed: [] };
let adminRows = [];

const bytes = (n) => {
  const v = Number(n) || 0;
  if (v >= 1 << 30) return `${(v / (1 << 30)).toFixed(2)} GB`;
  if (v >= 1 << 20) return `${(v / (1 << 20)).toFixed(1)} MB`;
  if (v >= 1 << 10) return `${Math.round(v / (1 << 10))} KB`;
  return `${v} B`;
};
const row = (p, admin = false) => {
  const kindLabel = KIND[p.kind] || p.kind || '插件';
  const clsLabel = CLASS[p.class] || p.class || '未声明';
  const status = STATUS[p.status] || p.status || '';
  const description = p.installed ? '本机已安装，未上架商城。' : (p.description || '没有填写描述。');
  const actions = admin
    ? `<button class="mc-btn" data-act="test" data-kind="${esc(p.kind)}" data-id="${esc(p.id)}">测试</button>
       <button class="mc-btn mc-btn--primary" data-act="approve" data-kind="${esc(p.kind)}" data-id="${esc(p.id)}">通过</button>
       <button class="mc-btn mc-btn--danger" data-act="reject" data-kind="${esc(p.kind)}" data-id="${esc(p.id)}">拒绝</button>`
    : p.download ? `<button class="mc-btn mc-btn--primary" data-download="${esc(p.download)}" data-id="${esc(p.id)}">下载</button>` : '';
  return `<article class="market-row">
    <div>
      <div class="market-row__name"><b>${esc(p.name || p.id)}</b><span class="market-row__version">v${esc(p.version || '—')}</span></div>
      <div class="market-row__badges">
        <span class="mc-badge mc-badge--kind">${esc(kindLabel)}</span>
        <span class="mc-badge mc-badge--class">${esc(clsLabel)}</span>
        <span class="mc-badge mc-badge--${esc(p.status)}">${esc(status)}</span>
      </div>
    </div>
    <div>
      <p class="market-row__desc">${esc(description)}</p>
      <div class="market-row__meta">${esc(p.author ? `作者：${p.author}` : '作者：未填写')} · ${bytes(p.bytes)} · 下载 ${esc(p.downloads || 0)}</div>
    </div>
    <div class="market-row__action">${actions}</div>
  </article>`;
};

function currentRows() {
  if (tab === 'installed') return data.installed || [];
  return (data.plugins || []).filter((p) => p.kind === tab);
}

function render() {
  const q = $('search').value.trim().toLowerCase();
  const rows = currentRows().filter((p) => !q || [p.id, p.name, p.author, p.description, p.class, p.kind]
    .some((x) => String(x || '').toLowerCase().includes(q)));
  $('list').innerHTML = rows.length ? rows.map((p) => row(p)).join('') : '<div class="market-empty">没有符合条件的插件。</div>';
  $('count-ordinary').textContent = data.plugins.filter((p) => p.kind === 'ordinary').length;
  $('count-forge').textContent = data.plugins.filter((p) => p.kind === 'forge').length;
  $('count-installed').textContent = data.installed.length;
  $('listMsg').textContent = '';
}

async function load() {
  $('listMsg').textContent = '加载中…';
  try {
    const r = await fetch('/market/api/list', { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    data = { plugins: Array.isArray(j.plugins) ? j.plugins : [], installed: Array.isArray(j.installed) ? j.installed : [] };
    render();
  } catch (e) {
    $('listMsg').textContent = `加载失败：${e.message}`;
    $('listMsg').classList.add('is-bad');
  }
}

async function download(url, id) {
  try {
    const entry = [...(data.plugins || []), ...(data.installed || [])].find((p) => p.id === id);
    let urls = [url];
    if (entry && Array.isArray(entry.sources) && entry.sources.length) {
      const mod = await import('/js/assetCache.js');
      urls = mod.candidatesFor(url, entry.sources);
    }
    for (const u of urls) {
      const r = await fetch(u);
      if (!r.ok) continue;
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${id}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      return;
    }
    throw new Error('所有下载源都失败');
  } catch (e) {
    $('listMsg').textContent = `下载失败：${e.message}`;
    $('listMsg').classList.add('is-bad');
  }
}

$('list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-download]');
  if (b) download(b.dataset.download, b.dataset.id);
});
document.querySelectorAll('.market-tab').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.market-tab').forEach((x) => x.classList.remove('is-on'));
  b.classList.add('is-on');
  tab = b.dataset.tab;
  render();
}));
$('search').addEventListener('input', render);
$('back').addEventListener('click', () => {
  if (window.opener && !window.opener.closed) { window.close(); return; }
  try {
    if (history.length > 1 && document.referrer && new URL(document.referrer).origin === location.origin) { history.back(); return; }
  } catch { /* ignore */ }
  location.assign('/');
});

async function loadAdmin() {
  if (!token) return;
  $('admin').hidden = false;
  try {
    const r = await fetch(`/admin/api/market?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    adminRows = Array.isArray(j.plugins) ? j.plugins : [];
    $('adminList').innerHTML = adminRows.map((p) => row(p, true)).join('') || '<div class="market-empty">没有插件。</div>';
  } catch (e) {
    $('adminMsg').textContent = `审核列表加载失败：${e.message}`;
    $('adminMsg').classList.add('is-bad');
  }
}

$('adminList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  b.disabled = true;
  $('adminMsg').textContent = `${b.dataset.act} 处理中…`;
  try {
    const r = await fetch(`/admin/api/market?token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: b.dataset.act, kind: b.dataset.kind, id: b.dataset.id }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    $('adminMsg').textContent = `完成：${j.entry?.status || ''}`;
    await Promise.all([load(), loadAdmin()]);
  } catch (err) {
    $('adminMsg').textContent = `处理失败：${err.message}`;
    $('adminMsg').classList.add('is-bad');
  } finally {
    b.disabled = false;
  }
});

await load();
await loadAdmin();
