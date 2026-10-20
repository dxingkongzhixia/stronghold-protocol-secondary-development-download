// Plugin store: themed list/search/download for ordinary, Forge and live installed plugins.
// i18n-ignore-file: standalone market page (Chinese-first; a language pack can wrap it later)
import { initMarketTheme } from './market-theme.js';
initMarketTheme();
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const token = new URLSearchParams(location.search).get('token') || '';
const KIND = { ordinary: '普通插件', forge: 'Forge 包', installed: '本机插件' };
const CLASS = { cosmetic: '外观', content: '玩法', ui: '界面', script: '脚本', trusted: '信任', lang: '语言', forge: 'Forge 转换' };
const STATUS = { active: '已上架', pending: '未审核', rejected: '已拒绝', installed: '使用中' };
const TYPE_IDS = { '': 'type-all', cosmetic: 'type-cosmetic', content: 'type-content', ui: 'type-ui', script: 'type-script', trusted: 'type-trusted', lang: 'type-lang', forge: 'type-forge' };
let tab = 'ordinary';
let classFilter = '';
let data = { plugins: [], installed: [] };
let adminRows = [];

const bytes = (n) => {
  const v = Number(n) || 0;
  if (v >= 1 << 30) return `${(v / (1 << 30)).toFixed(2)} GB`;
  if (v >= 1 << 20) return `${(v / (1 << 20)).toFixed(1)} MB`;
  if (v >= 1 << 10) return `${Math.round(v / (1 << 10))} KB`;
  return `${v} B`;
};
const classLabel = (key) => CLASS[key] || key || '未声明';
const versionDetail = (c) => `app ${c.app || '未声明'} · API ${c.api ?? '未声明'}`;
const strictClass = (cls) => cls === 'content' || cls === 'script' || cls === 'trusted';
function compatibilityLine(p, c = p.compat || {}) {
  if (p.kind === 'forge') {
    return {
      ownTone: p.status === 'active' ? 'ok' : 'maybe',
      own: p.status === 'active' ? '已通过导入测试' : '待导入测试',
      mainTone: 'neutral',
      main: '以导入结果为准',
      detail: `${versionDetail(c)} · Forge 包不直接按 app 范围判定`,
      note: '',
    };
  }
  const unrestricted = c.unrestricted || !c.app;
  const own = unrestricted ? '未限制' : c.own ? '兼容' : '不兼容';
  const main = unrestricted ? '未限制' : c.mainline ? '兼容' : '不兼容';
  const note = c.mainline && !c.auto && strictClass(p.class)
    ? '本服 0.4.0 仍严格；需 owner 在 allowIncompatible 放行'
    : c.mainline && c.auto && !c.own
      ? '外观 / 界面 / 语言按主线 0.3.x 兼容层自动加载'
      : '';
  return {
    ownTone: unrestricted || c.own ? 'ok' : 'no',
    own,
    mainTone: unrestricted || c.mainline ? 'ok' : 'no',
    main,
    detail: versionDetail(c),
    note,
  };
}
const row = (p, admin = false) => {
  const kindLabel = KIND[p.kind] || p.kind || '插件';
  const clsLabel = classLabel(p.class);
  const status = STATUS[p.status] || p.status || '';
  const description = p.installed ? (p.description || '本机已安装，未上架商城。') : (p.description || '没有填写描述。');
  const compat = compatibilityLine(p);
  const direct = p.download && (!Array.isArray(p.sources) || !p.sources.length);
  const actions = admin
    ? `<button class="mc-btn" data-act="test" data-kind="${esc(p.kind)}" data-id="${esc(p.id)}">测试</button>
       <button class="mc-btn mc-btn--primary" data-act="approve" data-kind="${esc(p.kind)}" data-id="${esc(p.id)}">通过</button>
       <button class="mc-btn mc-btn--danger" data-act="reject" data-kind="${esc(p.kind)}" data-id="${esc(p.id)}">拒绝</button>`
    : p.mirror
      ? `<a class="mc-btn mc-btn--primary" href="${esc(p.mirror)}" download="${esc(p.id)}.zip">高速下载</a>
         <a class="mc-btn" href="${esc(p.download)}" download="${esc(p.id)}.zip">服务器</a>`
      : p.download
        ? (direct
          ? `<a class="mc-btn mc-btn--primary" href="${esc(p.download)}" download="${esc(p.id)}.zip">下载</a>`
          : `<button class="mc-btn mc-btn--primary" data-download="${esc(p.download)}" data-id="${esc(p.id)}">下载</button>`)
        : '';
  const detailButton = `<button class="mc-btn" data-detail="${esc(p.id)}">详情</button>`;
  return `<article class="market-row">
    <div>
      <div class="market-row__name"><b>${esc(p.name || p.id)}</b><span class="market-row__version">v${esc(p.version || '—')}</span></div>
      <div class="market-row__badges">
        <span class="mc-badge mc-badge--kind">来源 · ${esc(kindLabel)}</span>
        <span class="mc-badge mc-badge--class">类型 · ${esc(clsLabel)}${p.class ? `（${esc(p.class)}）` : ''}</span>
        <span class="mc-badge mc-badge--${esc(p.status)}">状态 · ${esc(status)}</span>
      </div>
    </div>
    <div>
      <p class="market-row__desc">${esc(description)}</p>
      <div class="market-row__meta">${esc(p.author ? `作者：${p.author}` : '作者：未填写')} · ${bytes(p.bytes)} · 下载 ${esc(p.downloads || 0)}</div>
      <div class="market-row__related">${p.signature ? `签名：<span>${esc(p.signature.keyId)}</span>` : '签名：未签名'}</div>
      ${(p.relatedPlugins || []).length ? `<div class="market-row__related">关联：<span>${esc(p.relatedPlugins.map((r) => r.name).join('、'))}</span></div>` : ''}
      ${(p.relatedBy || []).length ? `<div class="market-row__related">被关联：<span>${esc(p.relatedBy.map((r) => r.name).join('、'))}</span></div>` : ''}
      ${p.dependencyCheck && p.dependencyCheck.ok === false ? `<div class="market-row__related market-row__related--bad">依赖不完整：${esc([...(p.dependencyCheck.missing || []), ...(p.dependencyCheck.mismatched || []), ...(p.dependencyCheck.conflicts || [])].map((r) => r.id).join('、'))}</div>` : ''}
      <div class="market-row__compat">
        <span class="compat-chip is-${compat.ownTone}">本服 0.4.0 · ${esc(compat.own)}</span>
        <span class="compat-chip is-${compat.mainTone}">主线 0.3.x · ${esc(compat.main)}</span>
        <span class="market-row__compat-detail">${esc(compat.detail)}</span>
      </div>
      ${compat.note ? `<div class="market-row__compat-note">${esc(compat.note)}</div>` : ''}
    </div>
    <div class="market-row__action">${detailButton}${actions}</div>
  </article>`;
};

function currentRows() {
  if (tab === 'installed') return data.installed || [];
  return (data.plugins || []).filter((p) => p.kind === tab);
}

function render() {
  const q = $('search').value.trim().toLowerCase();
  const base = currentRows();
  const typed = base.filter((p) => !classFilter || (p.class || '') === classFilter);
  const rows = typed.filter((p) => !q || [p.id, p.name, p.author, p.description, p.class, classLabel(p.class), KIND[p.kind], p.app]
    .some((x) => String(x || '').toLowerCase().includes(q)));
  $('list').innerHTML = rows.length ? rows.map((p) => row(p)).join('') : '<div class="market-empty">没有符合条件的插件。</div>';
  $('count-ordinary').textContent = data.plugins.filter((p) => p.kind === 'ordinary').length;
  $('count-forge').textContent = data.plugins.filter((p) => p.kind === 'forge').length;
  $('count-installed').textContent = data.installed.length;
  const counts = new Map();
  for (const p of base) counts.set(p.class || '', (counts.get(p.class || '') || 0) + 1);
  for (const [key, id] of Object.entries(TYPE_IDS)) $(id).textContent = key ? (counts.get(key) || 0) : base.length;
  document.querySelectorAll('.market-type').forEach((b) => b.classList.toggle('is-on', (b.dataset.type || '') === classFilter));
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

function showDetail(id) {
  const p = [...(data.plugins || []), ...(data.installed || [])].find((x) => x.id === id);
  if (!p) return;
  const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
  const related = (p.relatedPlugins || []).map((r) => r.name).join('、') || '—';
  const relatedBy = (p.relatedBy || []).map((r) => r.name).join('、') || '—';
  const deps = p.dependencyCheck;
  const depText = !deps ? '未检查' : deps.ok ? '依赖完整' : `依赖不完整：${[...(deps.missing || []), ...(deps.mismatched || []), ...(deps.conflicts || [])].map((x) => x.id).join('、')}`;
  const history = (p.history || []).length
    ? p.history.map((h) => `<div class="market-detail__history-row"><span>v${esc(h.version)}</span><span>${esc(h.uploadedAt ? new Date(h.uploadedAt).toLocaleDateString() : '')}</span></div>`).join('')
    : '<span class="market-detail__muted">无历史版本</span>';
  const home = safeUrl(p.homepage);
  const box = document.createElement('div');
  box.className = 'market-detail';
  box.innerHTML = `<div class="market-detail__backdrop" data-detail-close></div>
    <section class="market-detail__card" role="dialog" aria-modal="true" aria-label="插件详情">
      <header class="market-detail__head"><div><div class="market-kicker">PLUGIN DETAIL</div><h2>${esc(p.name || p.id)}</h2><div class="market-detail__id">${esc(p.id)} · v${esc(p.version || '—')}</div></div><button class="market-detail__close" data-detail-close aria-label="关闭">×</button></header>
      <div class="market-detail__badges"><span class="mc-badge">${esc(KIND[p.kind] || p.kind || '插件')}</span><span class="mc-badge">${esc(classLabel(p.class))}</span><span class="mc-badge">${esc(STATUS[p.status] || p.status || '')}</span>${p.signature ? `<span class="mc-badge mc-badge--active">签名 · ${esc(p.signature.keyId)}</span>` : '<span class="mc-badge">未签名</span>'}</div>
      <p class="market-detail__desc">${esc(p.installed ? (p.description || '本机已安装，未上架商城。') : (p.description || '没有填写描述。'))}</p>
      <dl class="market-detail__kv">
        <dt>作者</dt><dd>${esc(p.author || '未填写')}</dd>
        <dt>大小</dt><dd>${bytes(p.bytes)}</dd>
        <dt>兼容性</dt><dd>本服 0.4.0 ${esc(compatibilityLine(p).own)} · 主线 0.3.x ${esc(compatibilityLine(p).main)}</dd>
        <dt>app / API</dt><dd>${esc(p.app || '未声明')} / ${esc(p.api ?? '未声明')}</dd>
        <dt>依赖</dt><dd class="${deps && !deps.ok ? 'market-detail__bad' : ''}">${esc(depText)}</dd>
        <dt>关联</dt><dd>${esc(related)}</dd>
        <dt>被关联</dt><dd>${esc(relatedBy)}</dd>
        <dt>许可证</dt><dd>${esc(p.license || '未填写')}</dd>
        <dt>主页</dt><dd>${home ? `<a href="${esc(home)}" target="_blank" rel="noopener">${esc(home)}</a>` : '未填写'}</dd>
        <dt>SHA-256</dt><dd class="market-detail__sha">${esc(p.sha256 || '—')}</dd>
      </dl>
      <h3>历史版本</h3><div class="market-detail__history">${history}</div>
      <footer class="market-detail__foot"><button class="mc-btn" data-detail-close>关闭</button></footer>
    </section>`;
  box.addEventListener('click', (e) => { if (e.target.closest('[data-detail-close]')) box.remove(); });
  document.body.appendChild(box);
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
  const detail = e.target.closest('[data-detail]');
  if (detail) { showDetail(detail.dataset.detail); return; }
  const b = e.target.closest('[data-download]');
  if (b) download(b.dataset.download, b.dataset.id);
});
document.querySelectorAll('.market-tab').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.market-tab').forEach((x) => x.classList.remove('is-on'));
  b.classList.add('is-on');
  tab = b.dataset.tab;
  classFilter = '';
  render();
}));
document.querySelectorAll('.market-type').forEach((b) => b.addEventListener('click', () => {
  classFilter = b.dataset.type || '';
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
