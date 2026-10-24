// tools/illust.mjs — download the operator full-body illustrations the seat card shows (the default 立绘), crop them to
// the card's head-and-torso 3:5 window, convert them to WebP and leave them under public/assets/char/illust/. The
// manifest is generated from the plan (tools/assets/plan.mjs), so run `node tools/fetch-assets.mjs --offline`
// afterwards to add the `chars[id].illust` entries. Skins use the core skin catalogue's own `illust` files
// (skins/catalogue.json, docs/SKINS.md).
//
// Usage: node tools/illust.mjs [--force] [--only=char_003_kalts,…] [--concurrency=6] [--max-height=1100] [--dry-run]
//
// The source is Aceship/Arknight-Images (E0/E1 first — the E2 art often has a huge effect that a card crop cannot use —
// then E2); a missing dump file is a miss the card falls back from (portraitE2 / portrait), never an error. Pillow is
// required to encode WebP (same optional dependency as tools/local-extract).
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertIllust, ILLUST_MAX_HEIGHT, isWebp } from './assets/illust.mjs';
import { contentHash } from './assets/manifest.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'assets', 'char', 'illust');
const MANIFEST = join(ROOT, 'data', 'assets.json');
// jsDelivr first: this project's machines cannot always verify raw.githubusercontent.com's certificate through their
// proxy; the GitHub proxy and direct raw stay as fallbacks. All three serve the same bytes.
const SOURCES = [
  (id, s) => `https://cdn.jsdelivr.net/gh/Aceship/Arknight-Images@main/characters/${id}${s}.png`,
  (id, s) => `https://gh-proxy.com/https://raw.githubusercontent.com/Aceship/Arknight-Images/main/characters/${id}${s}.png`,
  (id, s) => `https://raw.githubusercontent.com/Aceship/Arknight-Images/main/characters/${id}${s}.png`,
];

function parseArgs(argv) {
  const o = { force: false, only: null, concurrency: 6, maxHeight: ILLUST_MAX_HEIGHT, dryRun: false };
  for (const a of argv) {
    if (a === '--force') o.force = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a.startsWith('--only=')) o.only = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--concurrency=')) o.concurrency = Math.max(1, Number(a.slice(14)) || 6);
    else if (a.startsWith('--max-height=')) o.maxHeight = Math.max(200, Number(a.slice(13)) || ILLUST_MAX_HEIGHT);
    else if (a === '--help' || a === '-h') { console.log('node tools/illust.mjs [--force] [--only=id,…] [--concurrency=6] [--max-height=1100] [--dry-run]'); process.exit(0); }
  }
  return o;
}

async function fetchOne(id) {
  for (const suffix of ['_1', '_2']) {
    for (const source of SOURCES) {
      const url = source(id, suffix);
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(90_000) });
          if (r.status === 404) break; // this source lacks it; try the next source / suffix
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const bytes = Buffer.from(await r.arrayBuffer());
          if (bytes.length > 20 && bytes[0] === 0x89 && bytes.toString('latin1', 1, 4) === 'PNG') return bytes;
          throw new Error('not a PNG');
        } catch {
          if (attempt === 2) break;
          await new Promise((r2) => setTimeout(r2, 600 * attempt));
        }
      }
    }
  }
  return null;
}

async function pool(items, size, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const n = items[i++]; await fn(n); }
  });
  await Promise.all(workers);
}

function updateManifest() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  let files = 0;
  let bytes = 0;
  for (const id of Object.keys(manifest.chars || {})) {
    const dst = join(OUT, `${id}.webp`);
    if (!existsSync(dst) || !isWebp(dst)) continue;
    const rel = `/assets/char/illust/${id}.webp`;
    if (manifest.chars[id].illust === rel) continue;
    manifest.chars[id].illust = rel;
    files++;
    try { bytes += statSync(dst).size; } catch { /* raced */ }
  }
  if (!files) return 0;
  manifest.stats = { ...(manifest.stats || {}), files: (manifest.stats?.files || 0) + files, bytes: (manifest.stats?.bytes || 0) + bytes };
  const body = { ...manifest };
  delete body.version; delete body.hash; delete body.generator; delete body.stats;
  manifest.hash = contentHash(body);
  writeFileSync(MANIFEST, `${JSON.stringify(manifest)}\n`);
  return files;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(join(ROOT, 'data', 'assets.json'), 'utf8'));
  const ids = (opts.only || Object.keys(manifest.chars || {})).filter((id) => manifest.chars?.[id]);
  mkdirSync(OUT, { recursive: true });
  const jobs = [];
  const missing = [];
  const skipped = [];
  let done = 0;
  await pool(ids, opts.concurrency, async (id) => {
    const dst = join(OUT, `${id}.webp`);
    if (!opts.force && existsSync(dst) && isWebp(dst)) { skipped.push(id); return; }
    if (opts.dryRun) { console.log('would fetch', id); return; }
    const bytes = await fetchOne(id);
    if (!bytes) { missing.push(id); return; }
    const src = join(OUT, `${id}.src.png`);
    writeFileSync(src, bytes);
    jobs.push({ src, dst });
    if (++done % 20 === 0) console.log(`[illust] ${done} downloaded …`);
  });
  if (!opts.dryRun && jobs.length) {
    const r = convertIllust(jobs, { maxHeight: opts.maxHeight, log: (l) => console.warn(l) });
    for (const j of jobs) { try { unlinkSync(j.src); } catch { /* converted in place or deleted */ } }
    console.log(`[illust] converted ${r.converted.length} to WebP${r.failed.length ? `, ${r.failed.length} failed` : ''}`);
  }
  console.log(`[illust] ${ids.length} operators: ${skipped.length} existing, ${jobs.length} fetched, ${missing.length} missing`);
  if (missing.length) console.log(`[illust] no full art in the dump (portrait fallback): ${missing.join(', ')}`);
  if (!opts.dryRun) {
    const added = updateManifest();
    console.log(added ? `[illust] data/assets.json: +${added} illust entries (hash updated)` : '[illust] data/assets.json already lists every downloaded illust');
  } else {
    console.log('[illust] dry run: the manifest was not changed');
  }
  console.log('[illust] a full asset run (node tools/fetch-assets.mjs) plans the same entries and keeps them');
}

await main();
