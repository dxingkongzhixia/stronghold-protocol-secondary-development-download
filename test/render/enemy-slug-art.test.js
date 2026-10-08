// test/render/enemy-slug-art.test.js — 灼热源石虫 / 炽焰源石虫 (enemy_1305_mhslim / _2, the ELEMENT faction's slugs) draw
// their OWN models. The official prefab carries them: the CN (and JP) client's battle/enm_pfb_12.ab has an
// `enemy_1305_mhslim` / `enemy_1305_mhslim_2` prefab whose Graphic / FaceSwitcher / Spine points at its own
// `enemy_1305_mhslim[_2]_SkeletonData` (C_Body_* / C_Rock_* regions), not the plain 源石虫's. No community dump carries
// their models (Ark-Models indexes them with an empty assetList), so the asset plan aliases them to enemy_1007_slime
// (spineAliasOf) as the WEB fallback and attaches the optional local-client `spineLocal` overlay from
// tools/assets/local-enemy-spines.json; assets.js spineEntry draws the overlay when data/local-assets.json lists its
// files. The extracted models live in public/assets/local/spine/enemy/<id>/ (extract.py's enemy-spine job, committed).
// Pinned here: the data (alias + overlay), spineEntry resolving each slug to ITS OWN skeleton/texture when the local
// manifest lists it (and to the plain slug when it does not), and the UnitView drawing each. Headless fake PIXI.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { createAssets, spineEntry } from '../../public/js/assets.js';
import { LOCAL_ENEMY_SPINES_FILE } from '../../tools/assets/spine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const committed = JSON.parse(readFileSync(path.join(ROOT, LOCAL_ENEMY_SPINES_FILE), 'utf8')).models;
const SLUGS = ['enemy_1305_mhslim', 'enemy_1305_mhslim_2'];   // 灼热源石虫 / 炽焰源石虫
const PLAIN = 'enemy_1007_slime';                             // 源石虫: the alias fallback

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

test('data: each slug aliases to the plain 源石虫 but carries its own spineLocal overlay (extracted, on disk)', () => {
  for (const id of SLUGS) {
    assert.equal(assets.enemies[id].spineAliasOf, PLAIN, `${id}: the web fallback is the plain slug`);
    assert.ok(assets.enemies[id].spineLocal, `${id}: the local overlay is attached`);
    const m = assets.enemies[id].spineLocal;
    assert.equal(m.group, `spine/enemy/${id}`);
    assert.equal(m.skel, `${id}.skel`);
    assert.equal(m.atlas, `${id}.atlas`);
    assert.deepEqual(m.textures, [`${id}.png`]);
    // the extracted files must actually be on disk (committed), or the client can never draw the overlay
    for (const f of [m.skel, m.atlas, ...m.textures]) assert.ok(existsSync(path.join(ROOT, 'public/assets/local/spine/enemy', id, f)), `${id}: ${f} extracted`);
  }
});

test('assets.js spineEntry: the slug\'s OWN model when the local manifest lists it; the plain-slug alias otherwise', () => {
  const local = localManifest(SLUGS);
  const store = createAssets({ manifest: assets, localManifest: local });
  for (const id of SLUGS) {
    const own = spineEntry(assets, id, { local });
    assert.equal(own.skel, `/assets/local/spine/enemy/${id}/${id}.skel`, `${id}: its own skeleton`);
    assert.equal(own.atlas, `/assets/local/spine/enemy/${id}/${id}.atlas`);
    assert.deepEqual(own.textures, [`/assets/local/spine/enemy/${id}/${id}.png`], `${id}: its own texture`);
    assert.ok(own.local, `${id}: the local entry`);
    assert.equal(own.fallback, assets.enemies[id].spine, `${id}: the plain slug is the load-failure fallback`);
    // and the fallback when the art is absent
    assert.equal(spineEntry(assets, id), assets.enemies[id].spine, `${id}: no local manifest → the plain slug`);
    assert.equal(spineEntry(assets, id, { local: localManifest([]) }), assets.enemies[id].spine, `${id}: not extracted → the plain slug`);
    assert.equal(store.spineEntry(id).skel, own.skel, `${id}: the store hands the local entry over`);
  }
  assert.equal(spineEntry(assets, PLAIN, { local }), assets.enemies[PLAIN].spine, 'the plain 源石虫 is untouched');
});

test('UnitView: each slug draws its OWN model (untinted) with the art; the tinted plain slug when it is absent', async () => {
  const cam = () => presetCamera('normal', { width: 1280, height: 720 });
  const tick = () => new Promise((r) => setImmediate(r));
  const local = localManifest(SLUGS);
  const store = (withLocal) => ({
    picture: () => null, image: async () => null,
    spineEntry: (id) => spineEntry(assets, id, withLocal ? { local } : undefined),
    spine: { acquire: async (e) => ({ animations: Object.keys(e.animations).map((name) => ({ name })) }), release() {} },
  });
  const info = (id) => ({ id: 7, side: 'enemy', kind: 'enemy', defId: id, spine: id, tier: 1, x: 8, y: 9, maxHp: 1000, facing: -1, motion: 0 });
  const mk = (id, withLocal) => new UnitView(fakeViewCtx(fake.P, { assets: store(withLocal), cam }), info(id));
  const hot = mk(SLUGS[0], true), blaze = mk(SLUGS[1], true), web = mk(SLUGS[0], false);
  for (let i = 0; i < 4; i++) await tick();
  for (const v of [hot, blaze, web]) v.update(1 / 60, cam(), 0);
  assert.ok(hot.actor.entry.local, '灼热源石虫 draws its own model');
  assert.equal(hot.actor.entry.skel, `/assets/local/spine/enemy/${SLUGS[0]}/${SLUGS[0]}.skel`);
  assert.equal(hot.actor.spine.tint, 0xffffff, 'the own model is drawn as it is');
  assert.ok(blaze.actor.entry.local, '炽焰源石虫 draws its own model');
  assert.equal(blaze.actor.entry.skel, `/assets/local/spine/enemy/${SLUGS[1]}/${SLUGS[1]}.skel`);
  assert.equal(web.actor.entry, assets.enemies[SLUGS[0]].spine, 'without the art: the plain-slug alias');
  assert.equal(web.actor.spine.tint, ALIAS_TINT[SLUGS[0]], 'the fallback is tinted (灼热 orange)');
  for (const v of [hot, blaze, web]) v.destroy?.();
});
