// i18n-ignore-file: standalone market upload page (Chinese-first; a language pack can wrap it later)
// Standalone upload form for the plugin market (keeps the list page free of the upload UI).
const $ = (id) => document.getElementById(id);
const say = (text, bad = false) => {
  $('msg').textContent = text;
  $('msg').classList.toggle('is-bad', bad);
};

$('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = $('zip').files?.[0];
  if (!file) { say('请选择 zip 文件', true); return; }
  const kind = $('kind').value;
  $('submit').disabled = true;
  say('上传中…');
  try {
    const r = await fetch(`/market/api/upload?kind=${encodeURIComponent(kind)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip', 'X-Plugin-Filename': file.name },
      body: file,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    say(`已提交：${j.plugin.name || j.plugin.id} v${j.plugin.version}，等待管理员审核。`);
    $('zip').value = '';
  } catch (err) {
    say(`上传失败：${err.message}`, true);
  } finally {
    $('submit').disabled = false;
  }
});
