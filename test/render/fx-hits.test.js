// test/render/fx-hits.test.js — the normal-attack impact of OUR seven custom operators (render/fx/hits.js).
//
// The client's official per-attack hit is a particle-system effect prefab each projectile prefab names in
// `_effectsWhenHit` (battle/prefabs/[uc]projectiles.ab) — a cluster of ParticleSystems + materials + transforms, not one
// texture. The season roster therefore keeps the procedural hit; ONLY our seven custom operators get a hand-authored,
// correctly-anchored (body / impact, NOT a ground decal) effect read from their own official `_*_hit_*` prefab. A
// same-bundle official flash texture may ride along as a `local` layer (body-anchored additive), with the procedural
// composition always drawn and the fallback offline (docs/ASSETS.md "Battle effects").
//
// Against the headless fake PIXI (test/render/fakepixi.js), like fx-local.test.js.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let fake, FX, HITS, LA;
before(async () => {
  fake = installFakePixi();
  FX = await import('../../public/js/render/fx.js');
  HITS = await import('../../public/js/render/fx/hits.js');
  LA = await import('../../public/js/render/fx/localart.js');
});
after(() => fake.restore());

const cam = presetCamera('normal', { width: 1600, height: 900 });

/** Our seven custom operators (tools/build-data.mjs CUSTOM_CHESS) and a ranged/melee sample of each. */
const OURS = ['char_4132_ascln', 'char_4217_makoto', 'char_1015_aglna2', 'char_2027_wang', 'char_377_gdglow', 'char_4138_narant', 'char_1052_kalts2'];
const MELEE = ['char_4132_ascln', 'char_4217_makoto', 'char_1015_aglna2', 'char_2027_wang'];
const RANGED = ['char_377_gdglow', 'char_4138_narant', 'char_1052_kalts2'];

function fakeAssets(groups, loaded = {}) {
  const called = [];
  return {
    called,
    localUrl: (g, n) => (groups && groups[g] && groups[g][n]) || null,
    imageNow: (u) => loaded[u] || null,
    image: (u) => { called.push(u); return Promise.resolve(loaded[u] || null); },
  };
}

function makeFx(assets, settings = { quality: 'high', damageNumbers: true }, views = new Map()) {
  const P = fake.P;
  const ctx = fakeViewCtx(P);
  return new FX.FxSystem({
    P, layers: ctx.layers, cam: () => cam, assets, settings, heightAt: () => 0,
    timeScale: () => 2, loadLevel: () => 0, subProfOf: () => null, view: (id) => views.get(id) || null,
    screenSize: () => ({ width: 1600, height: 900 }), fieldTop: () => 120,
  });
}

/** A hit-path unit view: `damage`/`_impact` read id / maxHp / onHit / info.spine||defId. */
const hitView = (id, x, y, defId) => ({ id, x, y, z: 0, hover: 0, _headTiles: 1.2, alive: true, destroyed: false, maxHp: 3000, info: { defId, spine: defId }, onHit() {} });

describe('fx custom-operator hits: the table (render/fx/hits.js)', () => {
  test('exactly our seven custom operators carry a hit spec; no one else does', () => {
    for (const op of OURS) assert.ok(HITS.fxHitFor(op), `${op} has a hit spec`);
    for (const other of ['char_1040_blaze2', 'char_103_angel', 'enemy_1001_slime', null, '']) {
      assert.equal(HITS.fxHitFor(other), null, `${other} stays procedural`);
    }
    assert.equal(Object.keys(HITS.FX_HITS).length, OURS.length);
  });

  test('every spec has a procedural composition (c + c2 + glow + shape): never a local-only hit', () => {
    const shapes = new Set(['void', 'slash', 'bloom', 'seal', 'bolt', 'sand', 'heal']);
    for (const [op, h] of Object.entries(HITS.FX_HITS)) {
      assert.ok(shapes.has(h.shape), `${op}: a known shape`);
      for (const k of ['c', 'c2', 'glow']) assert.equal(typeof h[k], 'number', `${op}.${k} is a colour`);
    }
  });

  test('each local layer the specs name is a committed fx group picture on disk', { skip: !existsSync(path.join(ROOT, 'data/local-assets.committed.json')) && 'no committed manifest' }, () => {
    const groups = JSON.parse(readFileSync(path.join(ROOT, 'data/local-assets.committed.json'), 'utf8')).groups || {};
    let n = 0;
    for (const [op, h] of Object.entries(HITS.FX_HITS)) {
      if (!h.local) continue;
      for (const ly of LA.fxLocalLayers(h.local)) {
        assert.ok(groups[ly.group] && groups[ly.group][ly.name], `${op}: ${ly.group}/${ly.name} committed`);
        assert.ok(existsSync(path.join(ROOT, 'public', groups[ly.group][ly.name].path)), `${op}: ${ly.name} on disk`);
        n++;
      }
    }
    assert.ok(n >= 3, 'several official hit-flash layers wired');
  });
});

describe('fx custom-operator hits: melee blows (render/fx/numbers.js damage)', () => {
  for (const op of MELEE) {
    test(`${op}: the melee blow is a custom, body-anchored hit — no ground decal, no fetch`, () => {
      const a = fakeAssets({});
      const fx = makeFx(a);
      const atk = hitView(1, 3, 4, op);
      fx._slashAt = atk.id;
      fx.damage(hitView(2, 5, 10, 'enemy_1001'), 100, 'phys', atk);
      assert.ok(fx.parts.length > 0, 'the hand-authored impact particles');
      assert.equal(fx.rings.length, 0, 'anchored at the body, never a ground field');
      assert.equal(fx.localTex.size, 0, 'no local texture without the art');
      assert.deepEqual(a.called, [], 'the fallback never touches the network');
    });
  }

  test('a melee blow marks the slash consumed (the next ranged dmg is generic)', () => {
    const fx = makeFx(fakeAssets({}));
    const atk = hitView(1, 3, 4, 'char_4217_makoto');
    fx._slashAt = atk.id;
    fx.damage(hitView(2, 5, 10, 'enemy_1001'), 100, 'phys', atk);
    assert.equal(fx._slashAt, null, 'the pending melee flag is cleared');
  });

  test('an official operator stays procedural (blaze2)', () => {
    const fx = makeFx(fakeAssets({}));
    const atk = hitView(1, 3, 4, 'char_1040_blaze2');
    fx._slashAt = atk.id;
    fx.damage(hitView(2, 5, 10, 'enemy_1001'), 100, 'phys', atk);
    assert.ok(fx.parts.length > 0, 'the procedural blow');
    assert.equal(fx.rings.length, 0);
  });
});

describe('fx custom-operator hits: ranged impacts (render/fx/projectiles.js _impact)', () => {
  for (const op of RANGED) {
    test(`${op}: the arrival is a custom impact — no ground field, no fetch`, () => {
      const a = fakeAssets({});
      const atk = hitView(1, 3, 10, op);
      const tgt = hitView(2, 6, 10, 'enemy_1001');
      const fx = makeFx(a, undefined, new Map([[1, atk], [2, tgt]]));
      fx.attack(atk, tgt, 'arrow');
      for (let t = 0; t < 0.2; t += 1 / 120) fx.update(1 / 120);
      assert.ok(fx.parts.length > 0, 'the hand-authored impact particles');
      assert.equal(fx.rings.length, 0, 'no ground field at the impact');
      assert.equal(fx.localTex.size, 0);
      assert.deepEqual(a.called, [], 'the impact never consults the manifest');
    });
  }
});

describe('fx custom-operator hits: the optional local official flash (per client)', () => {
  const GROUP = 'fx/gdglow';
  const URL = (n) => `/assets/local/${GROUP}/${n}.png`;
  const GROUPS = { [GROUP]: { star_05: URL('star_05') } };
  const PICTURE = { width: 128, height: 128 };
  const LOADED = { [URL('star_05')]: PICTURE };

  function rangedHit(assets) {
    const atk = hitView(1, 3, 10, 'char_377_gdglow');
    const tgt = hitView(2, 6, 10, 'enemy_1001');
    const fx = makeFx(assets, undefined, new Map([[1, atk], [2, tgt]]));
    fx.attack(atk, tgt, 'drone');
    for (let t = 0; t < 0.2; t += 1 / 120) fx.update(1 / 120);
    return fx;
  }

  test('loaded: the official hit-flash texture is drawn as a body-anchored core, plus the composition', () => {
    const a = fakeAssets(GROUPS, LOADED);
    const fx = rangedHit(a);
    assert.equal(fx.localTex.size, 1, 'the official flash texture is used');
    assert.ok(fx.parts.length > 1, 'the procedural composition still reads the impact');
    assert.equal(fx.rings.length, 0, 'the official flash is body-anchored, not a ground field');
    assert.deepEqual(a.called, [], 'an already-loaded layer is not fetched again');
  });

  test('listed but not loaded: procedural now, prefetched for the next event (never blank)', () => {
    const a = fakeAssets(GROUPS);
    const fx = rangedHit(a);
    assert.equal(fx.localTex.size, 0);
    assert.ok(fx.parts.length > 0, 'the procedural composition');
    assert.deepEqual(a.called, [URL('star_05')], 'the layer is prefetched, the fallback stays offline');
  });

  test('a spec without a local layer never consults the manifest (narant)', () => {
    const a = fakeAssets(GROUPS, LOADED);
    const atk = hitView(1, 3, 10, 'char_4138_narant');
    const tgt = hitView(2, 6, 10, 'enemy_1001');
    const fx = makeFx(a, undefined, new Map([[1, atk], [2, tgt]]));
    fx.attack(atk, tgt, 'boomerang');
    for (let t = 0; t < 0.2; t += 1 / 120) fx.update(1 / 120);
    assert.equal(fx.localTex.size, 0);
    assert.deepEqual(a.called, []);
  });

  test('settings.localFx === false opts the official flash off (procedural only)', () => {
    const a = fakeAssets(GROUPS, LOADED);
    const atk = hitView(1, 3, 10, 'char_377_gdglow');
    const tgt = hitView(2, 6, 10, 'enemy_1001');
    const fx = makeFx(a, { quality: 'high', damageNumbers: true, localFx: false }, new Map([[1, atk], [2, tgt]]));
    fx.attack(atk, tgt, 'drone');
    for (let t = 0; t < 0.2; t += 1 / 120) fx.update(1 / 120);
    assert.equal(fx.localTex.size, 0);
    assert.ok(fx.parts.length > 0, 'the procedural composition');
  });
});
