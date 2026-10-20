// i18n-ignore-file: standalone market upload page (Chinese-first; a language pack can wrap it later)
// Standalone upload form for the plugin market (keeps the list page free of the upload UI).
const $ = (id) => document.getElementById(id);
const say = (text, bad = false) => {
  $('msg').textContent = text;
  $('msg').classList.toggle('is-bad', bad);
};
const progress = $('uploadProgress');

function upload(file, kind) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/market/api/upload?kind=${encodeURIComponent(kind)}`);
    xhr.setRequestHeader('Content-Type', 'application/zip');
    xhr.setRequestHeader('X-Plugin-Filename', file.name);
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      progress.hidden = false;
      progress.value = Math.round((e.loaded / e.total) * 100);
      say(`上传中… ${progress.value}%`);
    };
    xhr.onload = () => {
      let j = {};
      try { j = xhr.responseText ? JSON.parse(xhr.responseText) : {}; } catch { /* readable error below */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(j);
      else reject(new Error(j.error || `HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('网络错误'));
    xhr.onabort = () => reject(new Error('已取消'));
    xhr.send(file);
  });
}

$('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = $('zip').files?.[0];
  if (!file) { say('请选择 zip 文件', true); return; }
  const kind = $('kind').value;
  $('submit').disabled = true;
  progress.hidden = false;
  progress.value = 0;
  say('上传中…');
  try {
    const j = await upload(file, kind);
    progress.value = 100;
    say(`已提交：${j.plugin.name || j.plugin.id} v${j.plugin.version}，等待管理员审核。`);
    $('zip').value = '';
  } catch (err) {
    say(`上传失败：${err.message}`, true);
  } finally {
    $('submit').disabled = false;
  }
});
