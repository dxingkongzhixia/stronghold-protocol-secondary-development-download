#!/usr/bin/env node
// tools/local-extract/committed-manifest.mjs — write the COMMITTED local-art manifest (data/local-assets.committed.json)
// from the art actually tracked under public/assets/local.
//
// tools/local-extract/extract.py writes data/local-assets.json, a per-machine manifest: it lists everything that
// machine's client was asked to extract and is git-ignored (its root path / extra groups are machine-specific). The
// public/assets/local/** art itself IS committed (see .gitignore), so a fresh clone has the pictures but no manifest —
// every consumer (the fx official-art tier, the 3D board, the local enemy/token spines, the UI icons) fell back to
// procedural / the web mirror.
//
// This script closes that gap: it walks public/assets/local and emits a manifest covering exactly the committed art,
// with the same `{ groups: { group: { name: { path, kind, w?, h? } } } }` shape the clients read (assets.js
// localAssetUrl). The server (server/http/static.js) serves it in place of an absent per-machine data/local-assets.json,
// so a clone gets the official tier with no extraction step. Re-run it after changing the committed art
// (`node tools/local-extract/committed-manifest.mjs`); the nightly/per-machine extraction only needs the ignored file.
//
// Two batches under public/assets/local are deliberately NOT in this file (they ARE committed, but they are served
// through another list):
//   * `scene/**` — the extracted battlefield scenes are per-machine by design: the served manifest is the UNION of this
//     file and a machine's own data/local-assets.json, and the scene groups are exactly what that extraction adds
//     (docs/ASSETS.md "The served manifest is the UNION of the two"). Their scene.json / scene.bin would also fold
//     onto one key here.
//   * `fx/tex/**` — the official battle-effect FORMAT batch (DESIGN §33: prefabs / textures / meshes) is listed by
//     data/local-fx.json, which has its own vocabulary; `fx/<operator>` piles stay in this file (the local-art tier
//     resolves them by name), but the format batch must not (test/render/vfx-*.test.js read the other list).
//
// Usage: node tools/local-extract/committed-manifest.mjs [--out data/local-assets.committed.json] [--local public/assets/local]

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const localDir = path.resolve(ROOT, arg('--local', 'public/assets/local'));
const outFile = path.resolve(ROOT, arg('--out', 'data/local-assets.committed.json'));

/** PNG pixel size from the IHDR chunk (no dependency); null for anything else. */
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** Manifest `kind` of a file (mirrors tools/local-extract/extract.py's names where it has one). */
function kindOf(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.png') return 'Texture2D';
  if (ext === '.webp') return 'webp';
  if (ext === '.skel') return 'TextAsset';
  if (ext === '.atlas') return 'TextAsset';
  if (ext === '.obj') return 'Mesh';
  if (ext === '.json') return path.basename(name).replace(/\.json$/, '');
  return ext ? ext.slice(1) : 'file';
}

/** Every file under `dir`, recursively (relative posix paths, sorted). */
function walk(dir, base = '') {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(p).isDirectory()) out.push(...walk(p, rel));
    else out.push(rel);
  }
  return out;
}

/**
 * Manifest key of a file, matching tools/local-extract/extract.py: a Sprite/Texture2D/Mesh/Derived/JSON entry is keyed
 * by its name without the final extension (the client looks the picture up by `TX_board` / `flow_1_2`, not `.png`),
 * while a Spine skeleton / atlas / page is keyed by its **full file name** (`localSpineEntry` asks for `x.skel`,
 * `x.atlas`, `<page>.png`). `.webp` copies replace their `.png` under the same key (the board textures ship webp).
 */
function keyOf(group, name) {
  // a Spine model (skeleton, atlas AND its page textures) is keyed by its full file name — localSpineEntry asks for
  // `x.skel` / `x.atlas` / `<page>.png` (extract.py write_spine); a skeleton / atlas elsewhere is too (ui/battle).
  const ext = path.extname(name).toLowerCase();
  if (group === 'spine' || group.startsWith('spine/') || ext === '.skel' || ext === '.atlas') return name;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

const files = walk(localDir);

/**
 * Groups this file must not carry (see the header): `scene/**` is per-machine, `fx/tex/**` is the vfx FORMAT batch
 * (data/local-fx.json). Everything else is covered, including the `fx/<operator>` piles.
 * @param {string} group
 */
const skipped = (group) => group === 'scene' || group.startsWith('scene/')
  || group === 'fx/tex' || group.startsWith('fx/tex/');

const groups = {};
let count = 0;
for (const rel of [...files].sort((a, b) => {
  // png before webp so a webp copy wins the key (extract.py lists the copy); everything else already sorts
  const w = (p) => (p.toLowerCase().endsWith('.webp') ? 1 : 0);
  return w(a) - w(b) || (a < b ? -1 : 1);
})) {
  const slash = rel.lastIndexOf('/');
  const group = slash < 0 ? '' : rel.slice(0, slash);
  const name = slash < 0 ? rel : rel.slice(slash + 1);
  if (!group) continue; // a file loose in local/ is not part of any client group
  if (skipped(group)) continue; // per-machine scenes / the vfx format batch (see the header)
  const entry = { path: `/assets/local/${rel}`, kind: kindOf(name) };
  if (name.toLowerCase().endsWith('.png')) {
    try {
      const size = pngSize(readFileSync(path.join(localDir, rel)));
      if (size) { entry.w = size.w; entry.h = size.h; }
    } catch { /* a broken PNG only loses its size */ }
  }
  // only the extract jobs' materials.json / prefab.json are manifest entries; a hand-added table (map/autochess/
  // tiles.json, read through its own URL by render/boardArt.js) is not a `localUrl` name and stays out.
  if (name.toLowerCase().endsWith('.json') && name !== 'materials.json' && name !== 'prefab.json') continue;
  const key = keyOf(group, name);
  const g = groups[group] || (groups[group] = {});
  if (!g[key]) count++;
  g[key] = entry;
}

const sorted = {};
for (const g of Object.keys(groups).sort()) sorted[g] = Object.fromEntries(Object.entries(groups[g]).sort(([a], [b]) => (a < b ? -1 : 1)));
const doc = { version: 1, source: 'committed', count, groups: sorted };
writeFileSync(outFile, JSON.stringify(doc), 'utf8');
console.log(`wrote ${path.relative(ROOT, outFile)}: ${count} files in ${Object.keys(sorted).length} groups`);
