// tools/first-paint.mjs — the cold first-paint payload of the web client, by category and compressed size.
//
// A page opens `public/index.html`; before the first useful frame the browser also parses every stylesheet it links,
// the two classic scripts + the module entry (`/js/main.js`, its STATIC import graph — dynamic imports are lazy), the
// boot manifests (`/data/assets.json`, `/data/local-assets.committed.json`), the self-hosted fonts the CSS names and
// the linked icons. This is an estimate, not a Lighthouse trace: no HTTP overhead, no service worker, gzip at the
// server (textures/fonts stay raw).
//
// Usage:
//   node tools/first-paint.mjs            human summary
//   node tools/first-paint.mjs --json     machine-readable { groups, total, estimates }
//   options: --root <dir> (default: public), --kbps <n> (default: 400, a weak mobile link; 1600 = "4G")
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, d) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d;
};
const PUBLIC = resolve(opt('--root', join(ROOT, 'public')));
const KBPS = Math.max(0, Number(opt('--kbps', 400)) || 0);
const AS_JSON = argv.includes('--json');
const TEXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg']);

const seen = new Set();
const groups = {};
const addAbs = (group, abs, served) => {
  if (!existsSync(abs) || !statSync(abs).isFile()) return;
  const key = normalize(abs);
  if (seen.has(key)) return;
  seen.add(key);
  const buf = readFileSync(abs);
  const text = TEXT.has(extname(abs).toLowerCase());
  const gz = text ? gzipSync(buf).length : buf.length;
  (groups[group] ??= { files: [], raw: 0, gzip: 0 });
  groups[group].files.push({ path: served, raw: buf.length, gzip: gz });
  groups[group].raw += buf.length;
  groups[group].gzip += gz;
};
const add = (group, rel) => addAbs(group, join(PUBLIC, rel.replace(/^\//, '')), rel);
/** A file served from the repository root (`/data/…` lives outside public/). */
const addData = (group, rel) => addAbs(group, join(ROOT, rel), `/${rel.split('\\').join('/')}`);

/** Local references of a stylesheet: @import and url(...) under /fonts or /assets. */
function cssRefs(rel) {
  const abs = join(PUBLIC, rel.replace(/^\//, ''));
  if (!existsSync(abs)) return [];
  const src = readFileSync(abs, 'utf8');
  const out = [];
  for (const m of src.matchAll(/@import\s+(?:url\()?['"]?([^'")]+)['"]?\)?/g)) out.push({ kind: 'css', path: m[1] });
  for (const m of src.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) out.push({ kind: 'asset', path: m[1] });
  return out.filter((r) => r.path.startsWith('/'));
}

/** Static import graph of a module under /js (relative specifiers only). */
function jsImports(rel) {
  const abs = join(PUBLIC, rel.replace(/^\//, ''));
  if (!existsSync(abs)) return [];
  const src = readFileSync(abs, 'utf8');
  const out = [];
  for (const m of src.matchAll(/^\s*(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
  return out.filter((s) => s.startsWith('./') || s.startsWith('../'));
}

function walkJs(rel) {
  const stack = [rel];
  while (stack.length) {
    const at = stack.pop();
    if (!at) continue;
    const before = seen.size;
    add('js', at);
    if (seen.size === before) continue; // already counted (or missing)
    const dir = dirname(at.replace(/^\//, ''));
    for (const spec of jsImports(at)) {
      let next = normalize(join(dir, spec)).split('\\').join('/');
      const tries = [next, `${next}.js`, `${next}/index.js`];
      const hit = tries.find((p) => existsSync(join(PUBLIC, p)));
      if (hit) stack.push(`/${hit}`);
    }
  }
}

function walkCss(rel) {
  const stack = [rel];
  while (stack.length) {
    const at = stack.pop();
    if (!at) continue;
    const before = seen.size;
    add('css', at);
    if (seen.size === before) continue;
    for (const r of cssRefs(at)) {
      if (r.kind === 'css') walkCss(r.path);
      else if (/^\/(fonts|assets)\//.test(r.path)) add(/^\/fonts\//.test(r.path) ? 'fonts' : 'images', r.path);
    }
  }
}

// --- index.html: its linked stylesheets, classic scripts, module entry, icons -------------------------------------
const html = readFileSync(join(PUBLIC, 'index.html'), 'utf8');
add('html', '/index.html');
for (const m of html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/g)) {
  if (!m[1].startsWith('/')) continue;
  if (/^\/fonts\//.test(m[1])) add('fonts', m[1]);
  else walkCss(m[1]);
}
for (const m of html.matchAll(/<link[^>]+href=["']([^"']+)["']/g)) {
  if (m[1].startsWith('/') && /\.(ico|png|svg)$/.test(m[1])) add('images', m[1]);
}
for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) {
  if (m[1].startsWith('/js/')) walkJs(m[1]);
  else if (m[1].startsWith('/')) add('js', m[1]);
}
add('html', '/manifest.json');

// --- boot manifests the client reads before its first screen ------------------------------------------------------
for (const f of ['data/assets.json', 'data/local-assets.committed.json']) addData('data', f);

// --- fonts: the faces fonts.css names ----------------------------------------------------------------------------
const fontCss = join(PUBLIC, 'fonts', 'fonts.css');
if (existsSync(fontCss)) {
  const src = readFileSync(fontCss, 'utf8');
  for (const m of src.matchAll(/url\(\s*['"]?([^'")]+\.woff2?)['"]?\s*\)/g)) add('fonts', m[1].startsWith('/') ? m[1] : `/fonts/${m[1]}`);
}

// --- report ------------------------------------------------------------------------------------------------------
const total = Object.values(groups).reduce((n, g) => ({ raw: n.raw + g.raw, gzip: n.gzip + g.gzip }), { raw: 0, gzip: 0 });
const seconds = (bytes, kbps) => (kbps > 0 ? bytes * 8 / (kbps * 1000) : null);
const result = {
  root: PUBLIC,
  groups,
  total,
  estimates: {
    kbps: KBPS,
    seconds: seconds(total.gzip, KBPS),
    // a second reference point: a good mobile link
    seconds4g: seconds(total.gzip, 1600),
  },
};

if (AS_JSON) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  const order = ['html', 'css', 'js', 'data', 'fonts', 'images'];
  console.log(`first paint (cold, ${PUBLIC})`);
  for (const k of order) {
    const g = groups[k];
    if (g) console.log(`  ${k.padEnd(7)} ${kb(g.raw).padStart(10)} raw  ${kb(g.gzip).padStart(10)} gzip  (${g.files.length} files)`);
  }
  console.log(`  ${'TOTAL'.padEnd(7)} ${kb(total.raw).padStart(10)} raw  ${kb(total.gzip).padStart(10)} gzip`);
  if (result.estimates.seconds != null) {
    console.log(`  at ${KBPS} kbit/s ≈ ${result.estimates.seconds.toFixed(1)} s; at 1600 kbit/s ≈ ${result.estimates.seconds4g.toFixed(1)} s`);
  }
}
