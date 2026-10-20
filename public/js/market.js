// i18n-ignore-file: standalone market page (Chinese-only first version; a language pack can wrap it later)
// Public plugin marketplace. Raw zip uploads go to /market/api/upload; only approved entries are listed/downloaded.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const token = new URLSearchParams(location.search).get('token') || '';
let kind = 'ordinary';
let plugins = [];

function pill(status) {
  const label = status === 'active' ? '使用中' : status === 'pending' ? '未审核' : status === 'rejected' ? '已拒绝' : status;
  return `<span class="pill ${esc(status)}">${esc(label)}</span>`;
}

function card(p, admin = false) {
  const actions = admin
    ? `<div class="actions">
         <button class="act alt" data-act="test" data-kind="${esc(p.kind)}" data-id="${esc(p.id)}">测试</button>
         <button class="act" data-act="approve" data-kind="${esc(p.kind)}" data-id="${esc(p.id)}">通过</button>
         <button class="act bad" data-act="reject" data-kind="${esc(p.kind)}" data-id="${esc(p.id)}">拒绝</button>
       </div>`
    : p.download ? `<div class="actions"><button class="act" data-download="${esc(p.download)}" data-id="${esc(p.id)}">下载</button></div>` : '';
  return `<article class="card">
    <h3>${esc(p.name || p.id)} <span class="meta">v${esc(p.version)}</span></h3>
    <div>${pill(p.status)} <span class="meta">${esc(p.kind === 'forge' ? 'Forge' : '普通')}</span></div>
    <p class="meta">${esc(p.description || '')}</p>
    <div class="meta">作者：${esc(p.author || '未填写')} · ${Math.round(Number(p.bytes || 0) / 1024)} KB · 下载 ${esc(p.downloads || 0)}</div>
    ${p.uploadedBy ? `<div class="meta">上传者：${esc(p.uploadedBy)}</div>` : ''}
    ${p.reviewNote ? `<div class="meta">审核备注：${esc(p.reviewNote)}</div>` : ''}
    ${actions}
  </article>`;
}

async function load() {
  $('listMsg').textContent = '加载中…';
  try {
    const r = await fetch('/market/api/list', { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    plugins = (j.plugins || []).filter((p) => p.kind === kind);
    $('list').innerHTML = plugins.map((p) => card(p)).join('') || '<p class="msg">这一分类还没有使用中的插件。</p>';
    $('listMsg').textContent = '';
  } catch (e) {
    $('listMsg').textContent = `加载失败：${e.message}`;
    $('listMsg').className = 'msg bad';
  }
}

async function download(url, id) {
  try {
    const mod = await import('/js/assetCache.js');
    const entry = plugins.find((p) => p.id === id);
    const sources = Array.isArray(entry?.sources) ? entry.sources : [];
    const urls = mod.candidatesFor(url, sources);
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
    $('listMsg').className = 'msg bad';
  }
}

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.remove('on'));
  b.classList.add('on');
  kind = b.dataset.kind;
  load();
}));

$('list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-download]');
  if (b) download(b.dataset.download, b.dataset.id);
});

$('upload').addEventListener('click', async () => {
  const file = $('zip').files?.[0];
  const k = $('kind').value;
  if (!file) { $('uploadMsg').textContent = '请选择 zip 文件'; return; }
  const btn = $('upload');
  btn.disabled = true;
  $('uploadMsg').textContent = '上传中…';
  try {
    const r = await fetch(`/market/api/upload?kind=${encodeURIComponent(k)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip', 'X-Plugin-Filename': file.name },
      body: file,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    $('uploadMsg').textContent = `已上传：${j.plugin.name || j.plugin.id} v${j.plugin.version}，等待管理员审核。`;
    $('zip').value = '';
    kind = k;
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.kind === k));
    await load();
  } catch (e) {
    $('uploadMsg').textContent = `上传失败：${e.message}`;
    $('uploadMsg').className = 'msg bad';
  } finally {
    btn.disabled = false;
  }
});

async function loadAdmin() {
  if (!token) return;
  $('admin').classList.remove('hidden');
  try {
    const r = await fetch(`/admin/api/market?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    $('adminList').innerHTML = (j.plugins || []).map((p) => card(p, true)).join('') || '<p class="msg">没有待审核插件。</p>';
  } catch (e) {
    $('adminMsg').textContent = `审核列表加载失败：${e.message}`;
    $('adminMsg').className = 'msg bad';
  }
}

$('adminList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  b.disabled = true;
  $('adminMsg').textContent = '处理中…';
  try {
    const r = await fetch(`/admin/api/market?token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: b.dataset.act, kind: b.dataset.kind, id: b.dataset.id }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    $('adminMsg').textContent = `${b.dataset.act} 完成：${j.entry?.status || ''}`;
    await Promise.all([load(), loadAdmin()]);
  } catch (err) {
    $('adminMsg').textContent = `处理失败：${err.message}`;
    $('adminMsg').className = 'msg bad';
  } finally {
    b.disabled = false;
  }
});

await load();
await loadAdmin();
