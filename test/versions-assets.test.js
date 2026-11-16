// test/versions-assets.test.js — 规程's presentation coverage from data/assets.json + the committed local-client manifest
// (data/local-assets.committed.json, public/assets/local): every visible operator has an avatar and a battle Spine, every
// non-boss enemy an icon and a model, every battlefield its extracted scene, and the season theme its key visual. This is
// the P4 asset-union check; the files themselves are committed (or local-client extracted).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const load = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const loadAt = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const assets = load('data/assets.json');
const local = load('data/local-assets.committed.json');
const chess = loadAt(path.join(DIR, 'chess.json'));
const enemies = loadAt(path.join(DIR, 'enemies.json'));
const stages = loadAt(path.join(DIR, 'stages.json'));
const theme = loadAt(path.join(DIR, 'config.json'));
const exists = (url) => typeof url === 'string' && url && fs.existsSync(path.join(ROOT, 'public', url));
const localFile = (group, name) => exists(local.groups?.[group]?.[name]?.path);
const localGroup = (group) => !!local.groups?.[group];

test('规程 operators: every visible char has an avatar and a battle Spine (mirror or local client)', () => {
  const chars = new Set(Object.values(chess).filter((c) => c.visible && c.charId).map((c) => c.charId));
  assert.ok(chars.size >= 140);
  const missing = [];
  for (const id of chars) {
    const rec = assets.chars?.[id];
    const avatar = (rec && (exists(rec.avatar) || exists(rec.avatarE2))) || localGroup(`char/avatar/${id}`);
    const spine = (rec?.spine?.front?.skel && exists(rec.spine.front.skel)) || localGroup(`spine/char/${id}/front`) || localGroup(`spine/char/${id}/back`);
    if (!avatar || !spine) missing.push(`${id}${avatar ? '' : ' avatar'}${spine ? '' : ' spine'}`);
  }
  assert.deepEqual(missing, []);
});

test('规程 enemies: every non-boss enemy has an icon and a model; bosses have a model', () => {
  // projectile / marker records with no battle Spine (drawn by their effect instead)
  const NO_MODEL = new Set(['enemy_9016_acstmr', 'enemy_9036_acweb']);
  const NO_ICON = new Set(['enemy_9036_acweb']);
  const missingIcon = [];
  const missingModel = [];
  for (const [id, e] of Object.entries(enemies)) {
    const rec = assets.enemies?.[id];
    const icon = (rec?.icon && exists(rec.icon)) || localFile('enemy/icon', id);
    const model = (rec?.spine?.skel && exists(rec.spine.skel)) || localGroup(`spine/enemy/${id}`);
    if (!model && !NO_MODEL.has(id)) missingModel.push(id);
    if (!icon && e.rank !== 'BOSS' && id !== 'enemy_9038_achest' && !NO_ICON.has(id)) missingIcon.push(id);
  }
  assert.deepEqual(missingModel, []);
  // the hot-updated client's spritepack/icon_enemies_6 carries every act3 enemy/Boss icon; enemy_9036_acweb is a
  // projectile marker with no icon by design (NO_ICON in tools/assets/versions.mjs)
  assert.deepEqual(missingIcon, []);
  assert.ok(Object.keys(local.groups?.['enemy/icon'] || {}).length >= 95, 'the local-client enemy icons are in the manifest');
});

test('规程 enemies: the models only the local client has are wired into data/assets.json as spineLocal', () => {
  // The manifest is one file for every version; a model the seasonal tables alone name is planned by
  // tools/fetch-assets.mjs (presentationUnion) and carries the overlay the client draws instead of the web alias.
  const ids = Object.keys(local.groups || {})
    .map((g) => /^spine\/enemy\/(.+)$/.exec(g)?.[1])
    .filter(Boolean);
  assert.ok(ids.length >= 90, `${ids.length} local enemy models`);
  const missing = ids.filter((id) => assets.enemies?.[id]?.spineLocal?.group !== `spine/enemy/${id}`);
  assert.deepEqual(missing, []);
});

test('规程 skill icons: every selectable skill has an icon (mirror or local client)', () => {
  const backups = loadAt(path.join(DIR, 'backups.json'));
  const ids = new Set();
  const add = (rec) => { for (const s of [...(rec?.skills || []), ...(rec?.skill ? [rec.skill] : [])]) if (s?.iconId) ids.add(s.iconId); };
  for (const rec of Object.values(chess)) add(rec);
  for (const rec of Object.values(backups.units || {})) for (const form of Object.values(rec.forms || {})) add(form);
  assert.ok(ids.size >= 300);
  const missing = [...ids].filter((id) => !(assets.skills?.[id] && exists(assets.skills[id])) && !localGroup(`skill/${id}`));
  assert.deepEqual(missing, []);
});

test('规程 bands, bonds and items: every icon is in the manifest or the local client', () => {
  const bands = loadAt(path.join(DIR, 'bands.json'));
  const bonds = loadAt(path.join(DIR, 'bonds.json'));
  const items = loadAt(path.join(DIR, 'items.json'));
  const missing = [];
  for (const id of Object.keys(bands)) if (!(assets.bands?.[id] && exists(assets.bands[id])) && !localGroup(`band/${id}`)) missing.push(`band ${id}`);
  for (const id of Object.keys(bonds)) if (!(assets.bonds?.[id] && exists(assets.bonds[id])) && !localGroup(`bond/${id}`)) missing.push(`bond ${id}`);
  for (const [id, it] of Object.entries(items)) {
    const key = it.iconId || it.trapId || it.id || id;
    if (!(assets.items?.[key] && exists(assets.items[key])) && !localGroup(`item/${key}`)) missing.push(`item ${id}`);
  }
  assert.deepEqual(missing, []);
});

test('规程 battlefields and theme: the 10 scenes are committed and listed, and the key visual is present', () => {
  const battlefield = Object.values(stages).filter((s) => typeof s.id === 'string' && s.id.startsWith('act3autochess_m'));
  assert.equal(battlefield.length, 10);
  for (const s of battlefield) {
    const g = local.groups?.[`scene/${s.id}`];
    assert.ok(g?.scene?.path && g?.bin?.path, `${s.id}: scene/binary listed (committed-manifest.mjs)`);
    for (const k of ['scene', 'bin']) assert.ok(exists(g[k].path), `${s.id}/${k}`);
    assert.equal(g.scene.path, `/assets/local/scene/${s.id}/scene.json`);
    assert.equal(g.bin.path, `/assets/local/scene/${s.id}/scene.bin`);
  }
  const art = '/assets/local/theme/act3autochess/act3autochess.png';
  assert.ok(exists(art));
  assert.ok(theme.version?.family === 'regulation');
});
