// tools/local-extract/dynillust-posters.mjs — render one still frame per extracted dynamic outfit for the hub picker.
//
// The picker (ui/hub/backdrop.js) shows a 16:9 thumbnail per outfit. Rendering it from the Spine set itself keeps the
// framing identical to the real backdrop; the local-skins illustration is only a fallback for entries without one.
// Dev-only: needs a local Chrome and puppeteer-core (a devDependency). The generated `poster.webp` sits next to the
// art and is written into index.json (`poster`), so the client only fetches ~50 KB per card.
//
//   node tools/local-extract/dynillust-posters.mjs [--root public/assets/dynillust] [--force] [--size 640x360]
//
// The art folder is git-ignored, like the rest of the extracted outfits.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = path.join(ROOT, 'public');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DYN_ROOT = path.resolve(ROOT, arg('--root', 'public/assets/dynillust'));
const INDEX = path.join(DYN_ROOT, 'index.json');
const FORCE = args.includes('--force');
const [W, H] = arg('--size', '640x360').split('x').map(Number);
const CHROME = process.env.SP_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.atlas': 'text/plain; charset=utf-8', '.skel': 'application/octet-stream',
  '.webp': 'image/webp', '.png': 'image/png', '.css': 'text/css; charset=utf-8',
};

function posterPage() {
  return `<!doctype html><html><body style="margin:0;background:transparent">
<script type="module">
import { ensurePixi } from '/js/render/app/pixi.js';
const skel = new URLSearchParams(location.search).get('skel');
try {
  const PIXI = await ensurePixi();
  const W = ${W}, H = ${H};
  const app = new PIXI.Application({ width: W, height: H, backgroundAlpha: 0, antialias: true, autoDensity: false });
  document.body.appendChild(app.view);
  const res = await PIXI.Assets.load(skel);
  const data = res && (res.spineData || res);
  const sp = new PIXI.spine.Spine(data);
  sp.autoUpdate = false;
  app.stage.addChild(sp);
  const list = (data.animations || []).filter((a) => a && a.name);
  const idle = list.find((a) => /^idle$/i.test(a.name)) || list.find((a) => /idle|default|loop/i.test(a.name))
    || list.reduce((b, a) => ((a.duration || 0) > (b.duration || 0) ? a : b), list[0]);
  if (idle) sp.state.setAnimation(0, idle.name, true);
  // a mid-idle pose reads better than the setup pose (the wine glass up, the cloak settled)
  sp.update(Math.min(6, Math.max(2.5, (idle?.duration || 4) * 0.5)));
  const b = sp.getLocalBounds();
  const s = Math.max(W / Math.max(1, b.width), H / Math.max(1, b.height));
  sp.scale.set(s);
  sp.position.set(W / 2 - (b.x + b.width / 2) * s, H / 2 - (b.y + b.height / 2) * s);
  app.renderer.render(app.stage);
  window.__png = app.view.toDataURL('image/webp', 0.86);
  window.__ready = true;
} catch (e) { window.__error = String((e && e.stack) || e); }
</script></body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/__poster') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(posterPage(url.searchParams.get('skel')));
    return;
  }
  const file = path.join(PUBLIC, decodeURIComponent(url.pathname));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const entries = Array.isArray(index.entries) ? index.entries : [];
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'],
});
let done = 0, failed = [];
for (const [i, entry] of entries.entries()) {
  const part = entry.parts?.find((p) => p.part === 'main') || entry.parts?.[0];
  if (!part) continue;
  const dir = path.join(DYN_ROOT, entry.id.replace(/[^A-Za-z0-9_.-]+/g, '_'));
  const out = path.join(dir, 'poster.webp');
  if (!FORCE && fs.existsSync(out) && entry.poster === `/assets/dynillust/${path.basename(dir)}/poster.webp`) {
    console.log(`[${i + 1}/${entries.length}] kept ${entry.id}`);
    continue;
  }
  const tab = await browser.newPage();
  try {
    await tab.goto(`${base}/__poster?skel=${encodeURIComponent(`/assets/dynillust/${part.skel}`)}`, { waitUntil: 'load', timeout: 60000 });
    await tab.waitForFunction('window.__ready === true || window.__error', { timeout: 60000 });
    const info = await tab.evaluate(() => ({ ready: globalThis.__ready || false, error: globalThis.__error || null, png: globalThis.__png || null }));
    if (!info.ready) throw new Error(info.error || 'render failed');
    const bytes = Buffer.from(info.png.split(',')[1], 'base64');
    fs.writeFileSync(out, bytes);
    entry.poster = `/assets/dynillust/${path.basename(dir)}/poster.webp`;
    // keep entry.json in step, so rebuilding index.json from the per-outfit files keeps the posters
    const entryFile = path.join(dir, 'entry.json');
    if (fs.existsSync(entryFile)) {
      try {
        const e = JSON.parse(fs.readFileSync(entryFile, 'utf8'));
        e.poster = entry.poster;
        fs.writeFileSync(entryFile, JSON.stringify(e, null, 1) + '\n');
      } catch { /* leave the entry as it is */ }
    }
    done++;
    console.log(`[${i + 1}/${entries.length}] ${entry.id} -> ${bytes.length} bytes`);
  } catch (err) {
    failed.push([entry.id, String(err.message || err)]);
    console.log(`[${i + 1}/${entries.length}] ! ${entry.id}: ${err.message || err}`);
  } finally {
    await tab.close();
  }
  if ((i + 1) % 10 === 0) fs.writeFileSync(INDEX, JSON.stringify({ version: index.version || 1, entries }, null, 1) + '\n');
}
fs.writeFileSync(INDEX, JSON.stringify({ version: index.version || 1, entries }, null, 1) + '\n');
await browser.close();
server.close();
console.log(`posters: ${done} rendered, ${failed.length} failed`);
if (failed.length) { console.log(failed.map(([id, e]) => `${id}: ${e}`).join('\n')); process.exitCode = 1; }



