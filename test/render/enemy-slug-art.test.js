// test/render/enemy-slug-art.test.js — 灼热源石虫 / 炽焰源石虫 (enemy_1305_mhslim / _2, the ELEMENT faction's slugs)
// are drawn with the plain 源石虫's skeleton/texture, tinted toward their own colours (render/units.js ALIAS_TINT).
// Owner report after 0.2.0: in the game these two are the ordinary 源石虫 — only their colour tells them apart — but
// the asset pipeline also attached the optional local-client `spineLocal` overlay (their own molten model), so a server
// with the extraction drew that. tools/assets/plan.mjs ENEMY_SPINE_NO_LOCAL now keeps the plain-alias look for them
// (data/assets.json rebuilt offline: only their two `spineLocal` objects went away). Pinned here: the data (alias +
// no overlay), assets.js spineEntry resolving the plain slug whatever a local manifest lists, and the UnitView drawing
// it with the tint. Headless fake PIXI (test/render/fakepixi.js).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { createAssets, spineEntry } from '../../public/js/assets.js';
import { LOCAL_ENEMY_SPINES_FILE } from '../../tools/assets/spine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const enemies = JSON.parse(readFileSync(path.join(ROOT, 'data/enemies.json'), 'utf8'));
const committed = JSON.parse(readFileSync(path.join(ROOT, LOCAL_ENEMY_SPINES_FILE), 'utf8')).models;

const SLUG = 'enemy_1007_slime';                    // 源石虫: the plain one
const MH = 'enemy_1305_mhslim', MH2 = 'enemy_1305_mhslim_2';   // 灼热 / 炽焰

let fake, UnitView, ALIAS_TINT;
before(async () => {
  fake = installFakePixi();
  ({ UnitView, ALIAS_TINT } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

/** A data/local-assets.json listing the extracted files of `ids` (extract.py's group layout). */
function localManifest(ids) {
  const groups = {};
  for (const id of ids) {
    const g = groups[`spine/enemy/${id}`] = {};
    const m = committed[id];
    for (const f of [m.skel, m.atlas, ...m.textures]) g[f] = { path: `/assets/local/spine/enemy/${id}/${f}`, kind: f.endsWith('.png') ? 'Texture2D' : 'TextAsset' };
  }
  return { version: 1, source: 'local-client', groups };
}

test('data: 灼热 / 炽焰源石虫 map to the plain 源石虫 (spineAliasOf), with no spineLocal overlay', () => {
  for (const [id, name] of [[MH, '灼热源石虫'], [MH2, '炽焰源石虫']]) {
    assert.equal(enemies[id].name, name);
    assert.equal(enemies[id].spine, id, 'the enemy asks for its own prefab id');
    assert.equal(assets.enemies[id].spineAliasOf, SLUG, `${id}: the alias is the plain slug`);
    assert.equal(assets.enemies[id].spineLocal, undefined, `${id}: no local overlay`);
    assert.deepEqual(spineEntry(assets, id), assets.enemies[SLUG].spine, `${id}: the plain slug model`);
  }
  assert.ok(!Object.values(assets.enemies).some((e) => e.spineLocal), 'no enemy carries a spineLocal overlay');
});

test('assets.js spineEntry: the plain slug even when a local manifest lists the slugs\' own files', () => {
  const local = localManifest([MH, MH2]);
  const store = createAssets({ manifest: assets, localManifest: local });
  for (const id of [MH, MH2]) {
    assert.equal(spineEntry(assets, id, { local }), assets.enemies[id].spine, `${id}: listing ignored`);
    assert.equal(store.spineEntry(id), assets.enemies[id].spine, `${id}: the store too`);
  }
  assert.equal(store.spineEntry(SLUG), assets.enemies[SLUG].spine, 'the plain slug is untouched');
});

test('UnitView: the slugs draw the plain slug tinted (灼热 orange / 炽焰 red-orange), the plain one untinted', async () => {
  const cam = () => presetCamera('normal', { width: 1280, height: 720 });
  const tick = () => new Promise((r) => setImmediate(r));
  const local = localManifest([MH, MH2]);
  const store = {
    picture: () => null, image: async () => null,
    spineEntry: (id) => spineEntry(assets, id, { local }),
    spine: { acquire: async (e) => ({ animations: Object.keys(e.animations).map((name) => ({ name })) }), release() {} },
  };
  const info = (id) => ({ id: 7, side: 'enemy', kind: 'enemy', defId: id, spine: id, tier: 1, x: 8, y: 9, maxHp: 1000, facing: -1, motion: enemies[id].stats.motion });
  const mk = (id) => new UnitView(fakeViewCtx(fake.P, { assets: store, cam }), info(id));
  const hot = mk(MH), blaze = mk(MH2), plain = mk(SLUG);
  for (let i = 0; i < 4; i++) await tick();
  for (const v of [hot, blaze, plain]) v.update(1 / 60, cam(), 0);
  assert.equal(hot.actor.entry, assets.enemies[MH].spine, '灼热源石虫 draws the plain slug');
  assert.equal(hot.actor.spine.tint, ALIAS_TINT[MH], '灼热源石虫: orange');
  assert.equal(blaze.actor.spine.tint, ALIAS_TINT[MH2], '炽焰源石虫: red-orange');
  assert.notEqual(ALIAS_TINT[MH], ALIAS_TINT[MH2], 'the two read apart');
  assert.equal(plain.actor.spine.tint, 0xffffff, 'the plain 源石虫 itself is untinted');
  for (const v of [hot, blaze, plain]) v.destroy?.();
});
