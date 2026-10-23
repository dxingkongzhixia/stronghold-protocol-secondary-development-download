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

/** Rewrite one skin's art paths; returns a new record (the source record is never mutated). */
function rewriteSkin(set, skin) {
  const out = { ...skin };
  for (const field of IMAGE_FIELDS) {
    const p = assetPath(set, skin[field]);
    if (p) out[field] = p; else delete out[field];
  }
  if (isObj(skin.spine)) {
    const spine = {};
    for (const side of ['front', 'back']) {
      const model = skin.spine[side];
      if (!isObj(model)) continue;
      const next = {};
      for (const field of MODEL_FIELDS) {
        const p = assetPath(set, model[field]);
        if (p) next[field] = p;
      }
      if (Array.isArray(model.textures)) {
        const textures = model.textures.map((t) => assetPath(set, t)).filter(Boolean);
        if (textures.length) next.textures = textures;
      }
      if (next.skel && next.atlas) spine[side] = next;
    }
    if (Object.keys(spine).length) out.spine = spine; else delete out.spine;
  }
  return out;
}

function readSet(set) {
  const file = join(SETS, set, 'overlay.json');
  if (!existsSync(file)) return null;
  let raw;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { fail(`${set}/overlay.json: ${e.message}`); return null; }
  if (!isObj(raw?.chars)) { fail(`${set}/overlay.json: no chars object`); return null; }
  const chars = {};
  for (const [charId, rec] of Object.entries(raw.chars)) {
    if (!isObj(rec)) continue;
    const next = { ...rec };
    if (isObj(rec.skins)) {
      next.skins = {};
      for (const [skinKey, skin] of Object.entries(rec.skins)) {
        if (isObj(skin)) next.skins[skinKey] = rewriteSkin(set, skin);
      }
    }
    for (const field of IMAGE_FIELDS) {
      const p = assetPath(set, rec[field]);
      if (p) next[field] = p; else delete next[field];
    }
    chars[charId] = next;
  }
  return chars;
}

function build() {
  if (!existsSync(SETS)) { fail(`no ${SETS} (import a set first)`); return; }
  const names = readdirSync(SETS).filter((n) => { try { return statSync(join(SETS, n)).isDirectory(); } catch { return false; } }).sort();
  const chars = {};
  const sets = [];
  for (const set of names) {
    const next = readSet(set);
    if (!next) continue;
    sets.push(set);
    for (const [charId, rec] of Object.entries(next)) {
      const prev = chars[charId] || {};
      chars[charId] = { ...prev, ...rec, skins: { ...(prev.skins || {}), ...(rec.skins || {}) } };
    }
  }
  const doc = { version: 1, source: 'local-extraction', sets, chars };
  mkdirSync(SKINS, { recursive: true });
  writeFileSync(CATALOGUE, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  const skins = Object.values(chars).reduce((n, c) => n + Object.keys(c.skins || {}).length, 0);
  console.log(`[skins] ${sets.length} set(s), ${Object.keys(chars).length} operator(s), ${skins} skin(s) -> skins/catalogue.json`);
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
else if (command === 'import') {
  const dir = args[1];
  const idAt = args.indexOf('--id');
  importSet(dir, { id: idAt > 0 ? args[idAt + 1] : null, move: args.includes('--move') });
} else {
  console.log('usage: node tools/skins.mjs import <plugin-dir> [--id <name>] [--move] | build');
  process.exitCode = command ? 1 : 0;
}
