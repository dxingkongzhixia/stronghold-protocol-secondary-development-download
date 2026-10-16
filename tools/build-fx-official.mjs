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
// The layer choice is deterministic and best-effort (the largest SOFT in-place effect textures of the bundle, a
// flow/glow/ring/smoke/aura/halo/light field and a star/ray spark) with three exclusions that keep a bad pick off the
// board: skin/cutscene variants (VARIANT), animation grids (SHEET — a flipbook / sprite-sheet / atlas / sequence image
// packs many small frames, so drawing it as one layer shows a whole sheet of images, not one effect) and anything that
// is not a soft in-place effect texture (EFFECT_TEX — walls, decals, patterns and object/prop/icon-looking textures are
// what read as "a big picture pasted on the board"). An operator whose usable textures are all sheets, or which has no
// qualifying effect texture at all, gets no entry (its procedural tier stays — never a blank frame). The kinds are then
// restricted to legitimate AREA / SELF effects (KIND_ARCH): the per-target / per-hit / instant / unit-attached kinds
// (IMPACT_KINDS plus the beam / bolt / blink / move / mark / reticle / volley / shell / wall / chill / flame archetypes)
// are dropped, because they are drawn procedurally (render/fx/projectiles.js _impact, render/fx/numbers.js damage) and
// a ground field on them just litters the board during combat; an operator whose kit emits only such kinds is absent.
// Every layer set is also size-capped at draw time (render/fx/simfx.js `_fxLocal` scales the set down so the largest
// drawn radius `r × layer.scale` is ≤ LOCAL_FX_MAX_R ≈ one body) so one picture can never cover the board. Re-run
// after an extraction or a roster change.
// Entries can be pinned by hand through tools/local-extract/fx-official-overrides.json. `--check` fails when the
// committed file is stale.
//
// Usage: node tools/build-fx-official.mjs [--check] [--out public/js/render/fx/official.js]
//        node tools/build-fx-official.mjs --print        (the table as JSON, writes nothing)

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fxSpec } from '../public/js/render/fx/kinds.js';

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
 * A bundle texture name that is an animation grid — a flipbook / sprite-sheet / atlas / sequence image holds many small
 * frames laid out in a matrix, so drawing it as one layer shows the whole sheet of images rather than one effect. Such a
 * texture is never a single-frame effect and is never picked as a layer.
 */
const SHEET = /(^|[^a-z0-9])(flipbook|sprite|sheet|atlas|sequence|filmstrip)([^a-z0-9]|$)/i;

/**
 * A bundle texture name whose family is a soft, in-place effect picture: a flow / ray / glow / ring / star / light /
 * smoke / aura / halo field. Only these read as an effect AT the anchor; walls, decals, patterns and object / prop /
 * icon-looking textures (a `char_*`, `special_object_*`, `bg_*`, `pattern_*`, `water_*`, … picture) read as "a big
 * picture pasted on the board" and are never a layer. A bundle with no qualifying picture gets no entry.
 */
const EFFECT_TEX = /(?:^|[^a-z0-9])(flow|ray|glow|ring|star|light|smoke|aura|halo)(?:[^a-z0-9]|$)/i;

/** The soft half of a bundle's effect pictures (the base field); the sharp star/ray half is the spark drawn on top. */
const SOFT_TEX = /flow|glow|ring|smoke|aura|halo|light/i;
const SPARK_TEX = /star|ray/i;

/** The drawn scale of the two chosen layers: small, so an official picture reads as ~one body (simfx.js also caps it). */
const FIELD_SCALE = 0.9;
const SPARK_SCALE = 0.6;

/**
 * The per-attack / impact fx kinds: drawn at the moment of a normal attack or on a single hit (a hit flare, a crit
 * flash, a melee slash, an instant ranged line). The normal-attack impact is drawn procedurally and never from this
 * table (render/fx/projectiles.js `_impact`, render/fx/numbers.js `damage`; docs/ASSETS.md "Battle effects"), so these
 * kinds are excluded even when an operator's kit emits them: a big field texture on an ordinary attack is the defect.
 * 'hit' is not an FX_KINDS entry (the sim never emits it), 'bolt' shares 'beam', and the rest are the emitters' own
 * attack-time flashes; keeping them here is defensive (the table must never carry one).
 */
const IMPACT_KINDS = new Set(['hit', 'crit', 'strike', 'slash', 'beam', 'bolt']);

/**
 * Our own custom operators (tools/build-data.mjs `CUSTOM_CHESS`) are never listed here: their fx use the official
 * battle effects (render/vfx) like every operator, and without them they fall back to the PLAIN procedural archetype —
 * the fork's per-operator signed picture was dropped by the owner (2026-10-16). `CUSTOM_CHESS` gives each of them an
 * `identifier` ≥ 900 (the official roster's run 0–132), so the data itself marks them.
 */
const CUSTOM_IDENTIFIER = 900;

/**
 * The visual archetypes an official ground-field picture is the right read for — an in-place effect AT the anchor:
 *   • AREA: a blast / zone / healAoe / wave happens at a spot and a field picture reads there;
 *   • SELF: a buff / shield / shatter / summon / vanish / lift / sleep / heal / down / counter / dodge / dp / coin / sp
 *     happens ON the unit and a small (size-capped) picture reads as its burst.
 * Everything else is denied: a per-target / per-hit / instant / unit-attached kind (beam, bolt, strike, crit, slash,
 * volley, shell, move, blink, mark, reticle, flame, wall, chill, telegraph, …) is drawn procedurally, and a ground
 * field on it only litters the board during combat. Unknown kinds guess to 'generic' and are denied.
 */
const KIND_ARCH = new Set(['blast', 'zone', 'healAoe', 'wave',
  'buff', 'shield', 'shatter', 'summon', 'vanish', 'lift', 'sleep', 'heal', 'down', 'counter', 'dodge', 'dp', 'coin', 'sp']);

/**
 * The fx kinds a kit source emits: `fx(battle, '<kind>'`, `battle.fx('<kind>'`) with a literal first argument.
 */
function kindsOf(source) {
  const re = /(?:battle\.fx|(?<![.\w])fx)\s*\(\s*(?:battle\s*,\s*)?['"]([A-Za-z0-9_]+)['"]/g;
  const out = new Set();
  for (const m of source.matchAll(re)) out.add(m[1]);
  return [...out].sort();
}

/**
 * Two signature single-frame layers for one operator bundle: the largest soft in-place effect texture (a flow / glow /
 * ring / smoke / aura / halo / light field) and, if one exists, the largest star / ray spark to draw on top of it.
 * Skin/cutscene variants (VARIANT), animation grids (SHEET) and non-effect pictures (EFFECT_TEX — walls, decals,
 * patterns, object / prop / icon-looking textures) are never candidates: a grid is many frames in one image, and the
 * rest are what read as "a big picture". Null when no qualifying base texture is left (an empty / all-skin / all-sheet
 * bundle: procedural stays, never a blank frame).
 */
function pickLayers(items) {
  const tex = items.filter((t) => t && typeof t.name === 'string' && !t.name.includes('#') && !VARIANT.test(t.name)
    && !SHEET.test(t.name) && EFFECT_TEX.test(t.name) && Number(t.w) >= 2 && Number(t.h) >= 2);
  if (!tex.length) return null;
  const area = (t) => t.w * t.h;
  const sorted = [...tex].sort((a, b) => area(b) - area(a) || (a.name < b.name ? -1 : 1));
  const field = sorted.find((t) => SOFT_TEX.test(t.name)) || sorted[0];
  const second = sorted.find((t) => t !== field && SPARK_TEX.test(t.name) !== SPARK_TEX.test(field.name)) || sorted.find((t) => t !== field);
  const layers = [{ name: field.name, scale: FIELD_SCALE }];
  if (second) layers.push({ name: second.name, scale: SPARK_SCALE });
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
const skipped = { noKit: [], noBundle: [], noArt: [], deniedOnly: [], custom: [] };
for (const [chessId, rec] of Object.entries(chess)) {
  if (!rec || rec.visible === false || rec.isGolden) continue;
  const charId = rec.charId;
  if (typeof charId !== 'string' || !charId) continue;
  if (Number(rec.identifier) >= CUSTOM_IDENTIFIER) { skipped.custom.push(charId); continue; }
  const stem = charId.rsplit ? charId.rsplit('_', 1).pop() : charId.split('_').pop();
  const group = `fx/${stem}`;
  const kit = kitFiles.find((f) => f.startsWith(`${chessId.replace(/_a$/, '')}-`));
  const kitKinds = kit ? kindsOf(readFileSync(path.join(opsDir, kit), 'utf8')) : [];
  if (!kitKinds.length) { skipped.noKit.push(charId); continue; }
  if (!groups[group] || !groups[group].length) { skipped.noBundle.push(`${charId} (${group})`); continue; }
  const pinned = overrides[charId];
  // a sheet texture is never a layer, and neither is a non-effect picture — also for a hand-pinned entry, so the
  // committed table can never carry one (a wall / decal / pattern / object texture is the "big picture" defect)
  const layers = ((pinned && Array.isArray(pinned.layers) && pinned.layers.length) ? pinned.layers : pickLayers(groups[group]) || [])
    .filter((ly) => ly && typeof ly.name === 'string' && !SHEET.test(ly.name) && EFFECT_TEX.test(ly.name));
  if (!layers.length) { skipped.noArt.push(charId); continue; }
  // only the in-place area / self kinds the kit actually emits (KIND_ARCH), never an attack / impact / per-target /
  // instant / unit-attached kind: those are procedural and a ground field on them litters the board
  const kinds = [...new Set((pinned && Array.isArray(pinned.kinds)) ? pinned.kinds : kitKinds)]
    .filter((k) => !IMPACT_KINDS.has(k))
    .filter((k) => KIND_ARCH.has(fxSpec(k, {}).a))
    .sort();
  if (!kinds.length) { skipped.deniedOnly.push(charId); continue; }
  table[charId] = { group, kinds, layers };
}

const banner = `// public/js/render/fx/official.js — GENERATED by tools/build-fx-official.mjs; do not edit by hand.
//
// The official battle-effect art of the season's roster (docs/ASSETS.md "Battle effects"): opId (a unit's
// UnitInfo.spine — the official charId) -> { group, kinds, layers }. render/fx/localart.js's fxLocalFor consults this
// for an fx kind that carries no layers of its own and that the operator's kit emits, drawing the operator's official
// textures (render/fx/simfx.js) instead of the procedural archetype; a client without the extracted art, or an
// operator not listed, keeps the procedural tier (never a blank frame, no network in the fallback). Only the kinds a
// kit actually emits are listed, so an operator with no attributable skill fx is absent.
//
// Three restrictions keep a bad pick off the board. (1) Layers are only SOFT in-place effect pictures — a flow / ray /
// glow / ring / star / light / smoke / aura / halo family (tools/build-fx-official.mjs EFFECT_TEX); walls, decals,
// patterns and object / prop / icon-looking textures are never used, and a bundle with no qualifying picture gets no
// entry. (2) No animation grid (a flipbook / sprite-sheet / atlas / sequence image is many frames, so one layer would
// show a whole sheet of images). (3) Only AREA / SELF kinds: a blast / zone / healAoe / wave, or an on-unit buff /
// shield / shatter / summon / vanish / lift / sleep / heal / down / counter / dodge / dp / coin / sp effect. The
// per-attack / impact kinds (crit, strike, slash, beam, bolt, …) and the per-target / instant / unit-attached kinds
// (volley, shell, move, blink, mark, reticle, flame, wall, chill, …) are drawn procedurally — a ground field on them
// only litters the board during combat. An operator whose only art is sheets, or whose kit emits only denied kinds, is
// absent (its procedural tier stays, never a blank frame). The normal-attack impact is NOT here: the official
// per-attack hit is a particle-system effect prefab (the projectile prefabs' _effectsWhenHit), not one texture.
//
// OUR custom operators (tools/build-data.mjs CUSTOM_CHESS) are deliberately absent: they use the official battle
// effects like every operator and fall back to the plain procedural archetype (owner, 2026-10-16).
//
// Every layer set is ALSO size-capped at draw time: render/fx/simfx.js \`_fxLocal\` scales its drawn radii
// (\`r × layer.scale\`) down together so the largest is at most LOCAL_FX_MAX_R (≈ one body), so one official picture is
// an in-place effect at the anchor and never a board-wide field. render/fx/localart.js \`LOCAL_ART_ENABLED\` (default
// true) is a one-line kill switch for the whole local tier.
// Layer names are entries of the committed local manifest (data/local-assets.committed.json). Re-run after an
// extraction / roster change: node tools/build-fx-official.mjs. Pin an operator by hand in
// tools/local-extract/fx-official-overrides.json.
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
    + ` (our custom: ${skipped.custom.length}, kit emits no fx: ${skipped.noKit.length}, no bundle: ${skipped.noBundle.length}, no art: ${skipped.noArt.length},`
    + ` no in-place kind: ${skipped.deniedOnly.length})`);
  if (skipped.noBundle.length) console.log(`  no bundle: ${skipped.noBundle.join(', ')}`);
  if (skipped.noArt.length) console.log(`  no art (no usable effect texture): ${skipped.noArt.join(', ')}`);
  if (skipped.deniedOnly.length) console.log(`  no in-place kind (impact / per-target / instant only): ${skipped.deniedOnly.join(', ')}`);
}
