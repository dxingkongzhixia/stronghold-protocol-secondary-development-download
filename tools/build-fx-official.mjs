#!/usr/bin/env node
// tools/build-fx-official.mjs — generate the data-driven official battle-effect art table for the season's roster.
//
// public/js/render/fx/official.js (`FX_OFFICIAL`) is the per-operator default of the fx local-art tier
// (docs/ASSETS.md "Battle effects"): for every visible chess of data/chess.json whose official operator has an
// extracted effect bundle (`data/local-assets.committed.json` group `fx/<stem>`, tools/local-extract/extract.py), it
// lists the bundle's signature Texture2D layers and the fx kinds that operator's kit actually emits. At render time
// render/fx/localart.js's fxLocalFor consults it when a kind carries no layers of its own, so the operator's official
// art supersedes the procedural archetype for the effects their kit draws — and a client without the art (or an
// operator not listed) keeps the procedural tier, unchanged. No kit is edited: the table is the data.
//
// The layer choice is deterministic and best-effort (largest base-skin effect textures, a flow/field one and a
// star/ray one, skin/cutscene variants excluded); re-run after an extraction or a roster change. Entries can be pinned
// by hand through tools/local-extract/fx-official-overrides.json. `--check` fails when the committed file is stale.
//
// Usage: node tools/build-fx-official.mjs [--check] [--out public/js/render/fx/official.js]
//        node tools/build-fx-official.mjs --print        (the table as JSON, writes nothing)

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const CHECK = has('--check');
const PRINT = has('--print');
const OUT = path.resolve(ROOT, valOf('--out', 'public/js/render/fx/official.js'));

/** A bundle texture name that belongs to a skin / cutscene variant, not the operator's base battle effect. */
const VARIANT = /(^|_)(summer|snow|sanrio|winter|newyear|new_year|halloween|xmas|christmas|valentine|swimsuit|bikini|beach|swim|anniv|anniversary|gift|sale|skin\d*)(_|$)/i;

/**
 * The shared normal-attack / hit-flare kind (render/fx/projectiles.js `_impact` and render/fx/numbers.js `damage`).
 * Every operator draws it, so the generated table lists it for every operator whose bundle is extractable — even one
 * whose kit emits no skill fx of its own — and the resolver attributes their official art to a normal attack's hit
 * (render/fx/localart.js fxLocalFor). A kind the sim never emits: the client draws the impact itself.
 */
const ATTACK_KIND = 'hit';

/** The fx kinds a kit source emits: `fx(battle, '<kind>'`, `battle.fx('<kind>'`) with a literal first argument. */
function kindsOf(source) {
  const re = /(?:battle\.fx|(?<![.\w])fx)\s*\(\s*(?:battle\s*,\s*)?['"]([A-Za-z0-9_]+)['"]/g;
  const out = new Set();
  for (const m of source.matchAll(re)) out.add(m[1]);
  return [...out].sort();
}

/**
 * Two signature layers for one operator bundle: the largest base-skin effect texture in the field pool (flow / trail /
 * pattern / char / object / …) and, if one exists, the largest in the star / ray / glow pool — the shape the hand-wired
 * kinds use. Null when the bundle carries no usable base texture (an empty / all-skin bundle: procedural stays).
 */
function pickLayers(items) {
  const tex = items.filter((t) => t && typeof t.name === 'string' && !t.name.includes('#') && !VARIANT.test(t.name)
    && Number(t.w) >= 2 && Number(t.h) >= 2);
  if (!tex.length) return null;
  const area = (t) => t.w * t.h;
  const spark = (n) => /star|ray|glow|spark|light/i.test(n);
  const sorted = [...tex].sort((a, b) => area(b) - area(a) || (a.name < b.name ? -1 : 1));
  const field = sorted.find((t) => !spark(t.name)) || sorted[0];
  const second = sorted.find((t) => t !== field && spark(t.name) !== spark(field.name)) || sorted.find((t) => t !== field);
  const layers = [{ name: field.name, scale: 1.5 }];
  if (second) layers.push({ name: second.name, scale: 1.1 });
  return layers;
}

function loadGroups() {
  const manifest = path.join(ROOT, 'data', 'local-assets.committed.json');
  if (existsSync(manifest)) {
    const doc = JSON.parse(readFileSync(manifest, 'utf8'));
    const groups = doc.groups || {};
    const out = {};
    for (const [g, entries] of Object.entries(groups)) {
      if (!g.startsWith('fx/')) continue;
      out[g] = Object.entries(entries)
        .filter(([, e]) => e && e.kind === 'Texture2D' && typeof e.path === 'string')
        .map(([name, e]) => ({ name, w: e.w, h: e.h, path: e.path }));
    }
    return out;
  }
  // no committed manifest: fall back to the art on disk (name + pixel size not needed for the pick if we cannot get it)
  const base = path.join(ROOT, 'public', 'assets', 'local', 'fx');
  const out = {};
  if (!existsSync(base)) return out;
  for (const g of readdirSync(base)) {
    const dir = path.join(base, g);
    const items = [];
    for (const f of readdirSync(dir)) {
      if (!f.toLowerCase().endsWith('.png')) continue;
      items.push({ name: f.replace(/\.png$/, ''), path: `/assets/local/fx/${g}/${f}`, kind: 'Texture2D', w: 2, h: 2, png: true });
    }
    out[`fx/${g}`] = items;
  }
  return out;
}

const chess = JSON.parse(readFileSync(path.join(ROOT, 'data', 'chess.json'), 'utf8'));
const opsDir = path.join(ROOT, 'server', 'sim', 'content', 'kits', 'ops');
const kitFiles = existsSync(opsDir) ? readdirSync(opsDir) : [];
const groups = loadGroups();
const overrides = (() => {
  const p = path.join(ROOT, 'tools', 'local-extract', 'fx-official-overrides.json');
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
})();

const table = {};
const skipped = { noKit: [], noBundle: [], noArt: [] };
for (const [chessId, rec] of Object.entries(chess)) {
  if (!rec || rec.visible === false || rec.isGolden) continue;
  const charId = rec.charId;
  if (typeof charId !== 'string' || !charId) continue;
  const stem = charId.rsplit ? charId.rsplit('_', 1).pop() : charId.split('_').pop();
  const group = `fx/${stem}`;
  const kit = kitFiles.find((f) => f.startsWith(`${chessId.replace(/_a$/, '')}-`));
  const kitKinds = kit ? kindsOf(readFileSync(path.join(opsDir, kit), 'utf8')) : [];
  // a kind the kit emits nothing for still gets the shared attack-impact kind, so its normal attacks use its art too
  if (!kitKinds.length) skipped.noKit.push(charId);
  if (!groups[group] || !groups[group].length) { skipped.noBundle.push(`${charId} (${group})`); continue; }
  const pinned = overrides[charId];
  const layers = (pinned && Array.isArray(pinned.layers) && pinned.layers.length) ? pinned.layers : pickLayers(groups[group]);
  if (!layers) { skipped.noArt.push(charId); continue; }
  // the shared attack-impact kind is added even to a hand-pinned operator: every operator draws a normal attack hit
  const kinds = [...new Set([...((pinned && Array.isArray(pinned.kinds)) ? pinned.kinds : kitKinds), ATTACK_KIND])].sort();
  table[charId] = { group, kinds, layers };
}

const banner = `// public/js/render/fx/official.js — GENERATED by tools/build-fx-official.mjs; do not edit by hand.
//
// The official battle-effect art of the season's roster (docs/ASSETS.md "Battle effects"): opId (a unit's
// UnitInfo.spine — the official charId) -> { group, kinds, layers }. render/fx/localart.js's fxLocalFor consults this
// for an fx kind that carries no layers of its own and that the operator's kit emits, drawing the operator's official
// textures (render/fx/simfx.js) instead of the procedural archetype; a client without the extracted art, or an
// operator not listed, keeps the procedural tier (never a blank frame, no network in the fallback). Every listed
// operator also carries the shared normal-attack / hit-flare kind 'hit' (render/fx/projectiles.js _impact,
// render/fx/numbers.js damage), so their basic attacks use their official art too. Layer names are entries of the
// committed local manifest (data/local-assets.committed.json). Re-run after an extraction / roster change:
// node tools/build-fx-official.mjs. Pin an operator by hand in tools/local-extract/fx-official-overrides.json.
`;
const body = JSON.stringify(table, null, 2).replace(/"([A-Za-z0-9_]+)":/g, (m, k) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? `${k}:` : m));
const src = `${banner}\n/** @type {Record<string, { group: string, kinds: string[], layers: { name: string, scale: number }[] }>} */\nexport const FX_OFFICIAL = Object.freeze(${body});\n`;

if (PRINT) {
  process.stdout.write(src);
} else if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== src) {
    console.error(`[fx-official] ${path.relative(ROOT, OUT)} is stale — run: node tools/build-fx-official.mjs`);
    process.exit(1);
  }
  console.log(`[fx-official] up to date: ${Object.keys(table).length} operators`);
} else {
  writeFileSync(OUT, src, 'utf8');
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${Object.keys(table).length} operators`
    + ` (kit emits no fx: ${skipped.noKit.length}, no bundle: ${skipped.noBundle.length}, no art: ${skipped.noArt.length})`);
  if (skipped.noBundle.length) console.log(`  no bundle: ${skipped.noBundle.join(', ')}`);
  if (skipped.noArt.length) console.log(`  no art: ${skipped.noArt.join(', ')}`);
}
