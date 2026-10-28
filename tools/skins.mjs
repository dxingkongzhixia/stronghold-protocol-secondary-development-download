#!/usr/bin/env node
// 皮肤资源导入 / 目录生成 (docs/SKINS.md).
//
// The skin system is a core feature: its catalogue is skins/catalogue.json and its art lives under skins/sets/. This
// tool turns a local Arknights extraction in the old cosmetic-plugin layout into that core layout:
//
//   node tools/skins.mjs import <plugin-dir> [--id <name>] [--move]
//       copy (or move) <plugin-dir>/overlay.json + media/ + spine/ into skins/sets/<name>/, then rebuild.
//   node tools/skins.mjs build
//       scan skins/sets/*/overlay.json (in name order), rewrite every relative art path to /skins/sets/<name>/…, merge
//       the chars maps and write skins/catalogue.json.
//   node tools/skins.mjs check
//       verify the catalogue against skins/sets/: every /skins/… URL present on disk, sets present, wear-able models.
//       Exit 1 with the first missing files — the diagnostic for “the room shows no skins”.
//
// The art is NOT tracked by git (skins/sets/ is ignored): official outfits are extracted locally and must not be
// redistributed. Only the catalogue (names / groups / paths) is tracked, so the server and the client share one schema.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKINS = join(ROOT, 'skins');
const SETS = join(SKINS, 'sets');
const CATALOGUE = join(SKINS, 'catalogue.json');
const IMAGE_FIELDS = ['avatar', 'avatarE2', 'portrait', 'portraitE2', 'illust'];
const MODEL_FIELDS = ['skel', 'atlas'];
const args = process.argv.slice(2);
const command = args[0];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' && v ? v : null);
const fail = (msg) => { console.error(`[skins] ${msg}`); process.exitCode = 1; };

/** Prefix a path inside a set: absolute URLs and /paths are kept. */
function assetPath(set, value) {
  const rel = str(value);
  if (!rel) return null;
  if (rel.startsWith('/') || /^[a-z]+:/i.test(rel)) return rel;
  return `/skins/sets/${set}/${rel.replace(/^\.\//, '')}`;
}

/** One skin's model metadata the client needs besides the files (`anims` etc.): from the set's plugin.lock.json. */
const CLIP_FIELDS = ['sha256', 'anims', 'animations', 'events', 'hits', 'bounds'];

/** One model's art paths and clip metadata; null when the skeleton/atlas pair is incomplete. */
function rewriteModel(set, model, lock = null) {
  if (!isObj(model)) return null;
  const next = {};
  for (const field of MODEL_FIELDS) {
    const p = assetPath(set, model[field]);
    if (p) next[field] = p;
  }
  if (Array.isArray(model.textures)) {
    const textures = model.textures.map((t) => assetPath(set, t)).filter(Boolean);
    if (textures.length) next.textures = textures;
  }
  // Clip roles / durations / events / hits / bounds come from the old plugin's lock (the Spine parser's output).
  // validSpine (public/js/assets.js) requires `anims`, so a catalogue without it draws the default model.
  const meta = isObj(lock?.spine) ? lock.spine[model.skel] : null;
  if (isObj(meta)) for (const field of CLIP_FIELDS) if (meta[field] !== undefined) next[field] = meta[field];
  return next.skel && next.atlas ? next : null;
}

/** A `spine` field: an operator's Front/Back pair, or a summon's single model (docs/SKINS.md). */
function rewriteSpine(set, spine, lock = null) {
  if (!isObj(spine)) return null;
  if (isObj(spine.front) || isObj(spine.back)) {
    const out = {};
    for (const side of ['front', 'back']) {
      const m = rewriteModel(set, spine[side], lock);
      if (m) out[side] = m;
    }
    return Object.keys(out).length ? out : null;
  }
  return rewriteModel(set, spine, lock);
}

/** Rewrite one skin's art paths; returns a new record (the source record is never mutated). */
function rewriteSkin(set, skin, lock = null) {
  const out = { ...skin };
  for (const field of IMAGE_FIELDS) {
    const p = assetPath(set, skin[field]);
    if (p) out[field] = p; else delete out[field];
  }
  const spine = rewriteSpine(set, skin.spine, lock);
  if (spine) out.spine = spine; else delete out.spine;
  return out;
}

/** One overlay record (an operator or a summon): its pictures, model, and the skins/outfits it carries. */
function rewriteRecord(set, rec, lock = null) {
  const next = { ...rec };
  if (isObj(rec.skins)) {
    next.skins = {};
    for (const [key, skin] of Object.entries(rec.skins)) {
      if (isObj(skin)) next.skins[key] = rewriteSkin(set, skin, lock);
    }
  }
  for (const field of IMAGE_FIELDS) {
    const p = assetPath(set, rec[field]);
    if (p) next[field] = p; else delete next[field];
  }
  const spine = rewriteSpine(set, rec.spine, lock);
  if (spine) next.spine = spine; else delete next.spine;
  return next;
}

function readSet(set) {
  const file = join(SETS, set, 'overlay.json');
  if (!existsSync(file)) return null;
  let raw;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { fail(`${set}/overlay.json: ${e.message}`); return null; }
  if (!isObj(raw?.chars) && !isObj(raw?.tokens)) { fail(`${set}/overlay.json: no chars or tokens object`); return null; }
  // The old cosmetic plugin's lock: per-skeleton clip roles and durations. Keep it in the core set (import copies the
  // whole folder) — without it every skin falls back to the operator's own model.
  let lock = null;
  const lockFile = join(SETS, set, 'plugin.lock.json');
  if (existsSync(lockFile)) {
    try { lock = JSON.parse(readFileSync(lockFile, 'utf8')); } catch (e) { fail(`${set}/plugin.lock.json: ${e.message}`); }
  } else fail(`${set}/plugin.lock.json is missing: its skins would have no clip roles (run node tools/plugin.mjs pack before importing)`);
  const chars = {};
  for (const [charId, rec] of Object.entries(raw.chars || {})) {
    if (isObj(rec)) chars[charId] = rewriteRecord(set, rec, lock);
  }
  const tokens = {};
  for (const [tokenId, rec] of Object.entries(raw.tokens || {})) {
    if (isObj(rec)) tokens[tokenId] = rewriteRecord(set, rec, lock);
  }
  return { chars, tokens };
}

function build() {
  if (!existsSync(SETS)) { fail(`no ${SETS} (import a set first)`); return; }
  const names = readdirSync(SETS).filter((n) => { try { return statSync(join(SETS, n)).isDirectory(); } catch { return false; } }).sort();
  const chars = {};
  const tokens = {};
  const sets = [];
  for (const set of names) {
    const next = readSet(set);
    if (!next) continue;
    sets.push(set);
    for (const [charId, rec] of Object.entries(next.chars)) {
      const prev = chars[charId] || {};
      chars[charId] = { ...prev, ...rec, skins: { ...(prev.skins || {}), ...(rec.skins || {}) } };
    }
    for (const [tokenId, rec] of Object.entries(next.tokens)) {
      const prev = tokens[tokenId] || {};
      tokens[tokenId] = { ...prev, ...rec, skins: { ...(prev.skins || {}), ...(rec.skins || {}) } };
    }
  }
  const doc = { version: 1, source: 'local-extraction', sets, chars };
  if (Object.keys(tokens).length) doc.tokens = tokens;
  mkdirSync(SKINS, { recursive: true });
  writeFileSync(CATALOGUE, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  const skins = Object.values(chars).reduce((n, c) => n + Object.keys(c.skins || {}).length, 0);
  const outfits = Object.values(tokens).reduce((n, t) => n + Object.keys(t.skins || {}).length, 0);
  let withClips = 0;
  for (const c of Object.values(chars)) for (const s of Object.values(c.skins || {})) {
    if (isObj(s.spine?.front) && isObj(s.spine.front.anims)) withClips++;
  }
  for (const t of Object.values(tokens)) for (const s of Object.values(t.skins || {})) {
    if (isObj(s.spine?.front) && isObj(s.spine.front.anims)) withClips++;
  }
  const total = skins + outfits;
  const out = outfits ? `${skins} skin(s) + ${outfits} summon outfit(s)` : `${skins} skin(s)`;
  console.log(`[skins] ${sets.length} set(s), ${Object.keys(chars).length} operator(s)${Object.keys(tokens).length ? `, ${Object.keys(tokens).length} summon(s)` : ''}, ${out} -> skins/catalogue.json (${withClips} with clip roles)`);
  if (withClips < total) console.log(`[skins] ${total - withClips} skin(s) have no clip roles (missing plugin.lock.json entries); they will fall back to the default model`);
}

function check() {
  if (!existsSync(CATALOGUE)) { fail(`no ${CATALOGUE} (run build)`); return; }
  let doc;
  try { doc = JSON.parse(readFileSync(CATALOGUE, 'utf8')); } catch (e) { fail(`${CATALOGUE}: ${e.message}`); return; }
  const chars = isObj(doc?.chars) ? doc.chars : {};
  const tokens = isObj(doc?.tokens) ? doc.tokens : {};
  const urls = new Set();
  let skins = 0, outfits = 0, wear = 0, artOnly = 0, noClips = 0, bucket = 0;
  const addModel = (m) => {
    for (const field of MODEL_FIELDS) if (str(m[field])) urls.add(m[field]);
    for (const t of Array.isArray(m.textures) ? m.textures : []) if (str(t)) urls.add(t);
  };
  const countSkin = (skin) => {
    if (!isObj(skin)) return;
    if (bucket) outfits++; else skins++;
    const model = isObj(skin.spine) && isObj(skin.spine.front) ? skin.spine.front : null;
    const hasFiles = !!model && str(model.skel) && str(model.atlas);
    // validSpine (public/js/assets.js) requires the clip roles: a model without them is not wear-able.
    const hasClips = hasFiles && isObj(model.anims);
    if (hasClips) wear++; else if (hasFiles) noClips++; else artOnly++;
    for (const field of IMAGE_FIELDS) if (str(skin[field])) urls.add(skin[field]);
    for (const side of ['front', 'back']) {
      const m = isObj(skin.spine) ? skin.spine[side] : null;
      if (isObj(m)) addModel(m);
    }
  };
  for (const rec of Object.values(chars)) {
    if (!isObj(rec)) continue;
    for (const field of IMAGE_FIELDS) if (str(rec[field])) urls.add(rec[field]);
    for (const skin of Object.values(isObj(rec.skins) ? rec.skins : {})) countSkin(skin);
  }
  bucket = 1;
  for (const rec of Object.values(tokens)) {
    if (!isObj(rec)) continue;
    for (const field of IMAGE_FIELDS) if (str(rec[field])) urls.add(rec[field]);
    for (const skin of Object.values(isObj(rec.skins) ? rec.skins : {})) countSkin(skin);
  }
  const local = [...urls].filter((u) => u.startsWith('/skins/'));
  const missing = local.filter((u) => {
    const rel = u.slice('/skins/'.length).split(/[?#]/)[0];
    return !existsSync(join(SKINS, decodeURIComponent(rel)));
  });
  const sets = Array.isArray(doc.sets) ? doc.sets : [];
  const setDirs = existsSync(SETS)
    ? readdirSync(SETS).filter((n) => { try { return statSync(join(SETS, n)).isDirectory(); } catch { return false; } })
    : [];
  const noOverlay = setDirs.filter((n) => !existsSync(join(SETS, n, 'overlay.json')));
  const summons = Object.keys(tokens).length ? `, ${Object.keys(tokens).length} summon(s), ${outfits} summon outfit(s)` : '';
  console.log(`[skins] catalogue: ${sets.length} set(s) [${sets.join(', ')}], ${Object.keys(chars).length} operator(s)${summons}, ${skins} skin(s) (${wear} wear-able, ${artOnly} art-only${noClips ? `, ${noClips} without clip roles` : ''})`);
  console.log(`[skins] art: ${local.length} file(s) under /skins/, ${local.length - missing.length} present, ${missing.length} missing`);
  if (missing.length) {
    console.log('[skins] first missing:');
    for (const u of missing.slice(0, 8)) console.log(`  ${u}`);
  }
  if (sets.length && !setDirs.length) console.log(`[skins] skins/sets/ is missing: the catalogue has ${sets.length} set(s) but no art is installed`);
  else if (sets.some((s) => !setDirs.includes(s))) console.log(`[skins] sets without a directory: ${sets.filter((s) => !setDirs.includes(s)).join(', ')}`);
  if (noOverlay.length) console.log(`[skins] directories without overlay.json: ${noOverlay.join(', ')}`);
  if (noClips) {
    console.log(`[skins] ${noClips} skin(s) have a model but no clip roles: plugin.lock.json is missing or has no entry for it; the client draws the default model`);
    console.log('[skins] run `node tools/plugin.mjs pack skins/sets/<set>` (or import the old plugin folder with its lock), then `node tools/skins.mjs build`');
    process.exitCode = 1;
  }
  if (!skins && !outfits) console.log('[skins] the catalogue has no skins: the picker shows nothing');
  if (missing.length) {
    console.log('[skins] run `node tools/skins.mjs import <plugin-dir> --id <name> --move` (or the local extractor), then `node tools/skins.mjs build`');
    process.exitCode = 1;
  }
}

function importSet(dirArg, { id, move }) {
  if (!dirArg) { fail('usage: node tools/skins.mjs import <plugin-dir> [--id <name>] [--move]'); return; }
  const src = resolve(dirArg);
  if (!existsSync(join(src, 'overlay.json'))) { fail(`${src} has no overlay.json`); return; }
  const name = id || src.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  if (!/^[a-z0-9][a-z0-9._-]{0,48}$/i.test(name)) { fail(`invalid set id: ${name}`); return; }
  const dst = join(SETS, name);
  mkdirSync(SETS, { recursive: true });
  if (existsSync(dst)) { fail(`${dst} already exists (remove it first)`); return; }
  if (move) renameSync(src, dst);
  else cpSync(src, dst, { recursive: true });
  console.log(`[skins] ${move ? 'moved' : 'copied'} ${src} -> ${dst}`);
  build();
}

if (command === 'build') build();
else if (command === 'check') check();
else if (command === 'import') {
  const dir = args[1];
  const idAt = args.indexOf('--id');
  importSet(dir, { id: idAt > 0 ? args[idAt + 1] : null, move: args.includes('--move') });
} else {
  console.log('usage: node tools/skins.mjs import <plugin-dir> [--id <name>] [--move] | build | check');
  process.exitCode = command ? 1 : 0;
}
