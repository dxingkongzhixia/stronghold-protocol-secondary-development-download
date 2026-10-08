// test/render/fx-local.test.js — the optional local-art tier of an fx kind (docs/ASSETS.md "Battle effects").
//
// A kind's `local` spec (render/fx/kinds.js) names official pictures of the local-client manifest
// (data/local-assets.json): render/fx/localart.js resolves them (per client), and render/fx/simfx.js draws them as
// ground fields INSTEAD of the procedural archetype only when the client has every layer listed AND loaded; else the
// procedural drawing is used. So a connected client without the art sees the procedural version — the same effect,
// bytes neither blank nor fetched for the fallback (owner's Minecraft-shader-style graceful degradation). This file
// pins (a) the fallback, (b) the local tier, (c) the kalts2 S2 kinds' official textures when the extraction is there.
//
// Against the headless fake PIXI (test/render/fakepixi.js), like fxflame.test.js / fx-kalts2.test.js.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let fake, FX, LA;
before(async () => {
  fake = installFakePixi();
  FX = await import('../../public/js/render/fx.js');
  LA = await import('../../public/js/render/fx/localart.js');
});
after(() => fake.restore());

const cam = presetCamera('normal', { width: 1600, height: 900 });

/** A fake assets.js store: a manifest { group: { name: url } } plus the pictures that have actually loaded. */
function fakeAssets(groups, loaded = {}) {
  const called = [];
  return {
    called,
    localUrl: (g, n) => (groups && groups[g] && groups[g][n]) || null,
    imageNow: (u) => loaded[u] || null,
    image: (u) => { called.push(u); return Promise.resolve(loaded[u] || null); },
  };
}

/** A real FxSystem over the fake PIXI (assets is the fake store); view1/view2 record nothing. */
function makeFx(assets, settings = { quality: 'high', damageNumbers: true }) {
  const P = fake.P;
  const ctx = fakeViewCtx(P);
  return new FX.FxSystem({
    P, layers: ctx.layers, cam: () => cam, assets, settings, heightAt: () => 0,
    timeScale: () => 2, loadLevel: () => 0, subProfOf: () => null, view: () => null,
    screenSize: () => ({ width: 1600, height: 900 }), fieldTop: () => 120,
  });
}

const GROUP = 'fx/kalts2';
const URL = (n) => `/assets/local/${GROUP}/${n}.png`;
const GROUPS = { [GROUP]: { flow_332_3: URL('flow_332_3'), flow_331_2: URL('flow_331_2'), star_118_7: URL('star_118_7') } };
const PICTURE = { width: 256, height: 256 };
const LOADED = { [URL('flow_332_3')]: PICTURE, [URL('flow_331_2')]: PICTURE, [URL('star_118_7')]: PICTURE };

describe('fx local-art resolver (render/fx/localart.js)', () => {
  test('the layers of a spec.local are normalised: a single { group, name } or a layers list', () => {
    assert.deepEqual(LA.fxLocalLayers(null), []);
    assert.deepEqual(LA.fxLocalLayers({}), []);
    assert.deepEqual(LA.fxLocalLayers({ layers: [{ name: 'x' }] }), [], 'a group is required');
    assert.deepEqual(LA.fxLocalLayers({ group: 'g', name: 'n' }), [{ group: 'g', name: 'n', scale: 1, tint: null }]);
    assert.deepEqual(LA.fxLocalLayers({ group: 'g', layers: [{ name: 'a', scale: 2 }, { name: 'b', tint: 0xff0000 }] }),
      [{ group: 'g', name: 'a', scale: 2, tint: null }, { group: 'g', name: 'b', scale: 1, tint: 0xff0000 }]);
  });

  test('not listed → null and no fetch (the fallback stays offline)', () => {
    const a = fakeAssets({});
    assert.equal(LA.fxLocalSource(a, { group: GROUP, layers: [{ name: 'flow_332_3' }] }), null);
    assert.deepEqual(a.called, [], 'a kind the manifest does not list never touches the network');
  });

  test('listed but not loaded → null and a prefetch, so a later event finds it', () => {
    const a = fakeAssets(GROUPS);
    assert.equal(LA.fxLocalSource(a, { group: GROUP, layers: [{ name: 'flow_332_3' }] }), null);
    assert.deepEqual(a.called, [URL('flow_332_3')]);
  });

  test('every layer listed and loaded → the layers with their URL and picture', () => {
    const a = fakeAssets(GROUPS, LOADED);
    const src = LA.fxLocalSource(a, FX.FX_KINDS.kalts2Heal.local);
    assert.deepEqual(src.map((l) => l.url), [URL('flow_332_3'), URL('star_118_7')]);
    assert.equal(src[0].image, PICTURE);
    assert.deepEqual(a.called, [], 'an already-loaded layer is not fetched again');
  });
});

describe('fx kinds: the procedural fallback and the local tier (per client)', () => {
  test('without the local art the kalts2 kinds draw their procedural effect (no crash, no local texture)', () => {
    const fx = makeFx(fakeAssets({}));
    fx.simFx('kalts2Damage', 5, 10, { id: 1 });
    assert.ok(fx.parts.length > 0, 'the procedural red explosion sparks');
    assert.equal(fx.localTex.size, 0);
    assert.ok(fx.rings.length > 0, 'and its ground rings');
    fx.clear();
    fx.simFx('kalts2Heal', 5, 10, { id: 1 });
    assert.ok(fx.parts.length > 0, 'the procedural green heal field rings / sheds plus particles');
    assert.equal(fx.localTex.size, 0);
  });

  test('a kind with no local spec never consults the assets (the atlas ring is still used)', () => {
    const a = fakeAssets(GROUPS, LOADED);
    const fx = makeFx(a);
    fx.simFx('aoe', 5, 10, {});
    assert.equal(fx.localTex.size, 0);
    assert.deepEqual(a.called, []);
  });

  test('with the art loaded the official layers are drawn instead of the procedural archetype', () => {
    const a = fakeAssets(GROUPS, LOADED);
    const fx = makeFx(a);
    const atlasRing = fx.tex.ring;
    fx.simFx('kalts2Damage', 5, 10, { id: 1 });
    assert.equal(fx.parts.length, 0, 'the procedural explosion is skipped');
    assert.equal(fx.rings.length, 2, 'one ground field per official layer');
    const locals = [...fx.localTex.values()];
    for (const r of fx.rings) {
      assert.ok(locals.includes(r.sp.texture), 'each ring draws an official local texture');
      assert.notEqual(r.sp.texture, atlasRing, 'not the procedural atlas ring');
    }
    assert.equal(fx.localTex.size, 2);
    assert.deepEqual(a.called, []);
    // the two layers are distinct (the field and the ray), tinted the official colour
    assert.notEqual(fx.rings[0].sp.texture, fx.rings[1].sp.texture);
    assert.equal(fx.rings[0].sp.tint, FX.FX_KINDS.kalts2Damage.local.tint);
  });

  test('listed but not loaded: procedural now, the official art from the next event on (never a blank frame)', () => {
    const a = fakeAssets(GROUPS);
    const fx = makeFx(a);
    fx.simFx('kalts2Heal', 5, 10, { id: 1 });
    assert.ok(fx.parts.length > 0, 'the first event draws the procedural heal field');
    assert.deepEqual(a.called, [URL('flow_332_3'), URL('star_118_7')], 'both layers are prefetched');
    fx.clear();
    a.imageNow = (u) => LOADED[u] || null;   // the prefetch resolved
    fx.simFx('kalts2Heal', 5, 10, { id: 1 });
    assert.equal(fx.parts.length, 0, 'now the official layers are drawn');
    assert.equal(fx.rings.length, 2);
  });

  test('settings.localFx === false opts the official tier off (procedural), like a quality tier', () => {
    const fx = makeFx(fakeAssets(GROUPS, LOADED), { quality: 'high', damageNumbers: true, localFx: false });
    fx.simFx('kalts2Damage', 5, 10, { id: 1 });
    assert.equal(fx.localTex.size, 0);
    assert.ok(fx.parts.length > 0, 'the procedural explosion');
  });
});

describe('kalts2 S2 official textures (when the local client was extracted)', () => {
  const manifest = (() => { try { return JSON.parse(readFileSync(path.join(ROOT, 'data/local-assets.json'), 'utf8')); } catch { return null; } })();
  const group = manifest?.groups?.[GROUP];
  const skip = group ? false : 'no local extraction (data/local-assets.json has no fx/kalts2)';

  test('every layer the two kinds name is in the fx/kalts2 group and on disk', { skip }, () => {
    for (const kind of ['kalts2Heal', 'kalts2Damage']) {
      const layers = LA.fxLocalLayers(FX.FX_KINDS[kind].local);
      assert.ok(layers.length >= 1, `${kind} names at least one official layer`);
      for (const ly of layers) {
        assert.ok(group[ly.name], `${kind}: ${ly.name} extracted`);
        assert.ok(existsSync(path.join(ROOT, 'public', group[ly.name].path)), `${ly.name} on disk`);
      }
    }
  });

  test('the kinds resolve their official textures when the manifest lists them', { skip }, () => {
    const a = { localUrl: (g, n) => (g === GROUP && group[n] && group[n].path) || null, imageNow: () => PICTURE, image: () => Promise.resolve(null) };
    assert.deepEqual(LA.fxLocalSource(a, FX.FX_KINDS.kalts2Heal.local).map((l) => l.name), ['flow_332_3', 'star_118_7']);
    assert.deepEqual(LA.fxLocalSource(a, FX.FX_KINDS.kalts2Damage.local).map((l) => l.name), ['flow_331_2', 'star_118_7']);
  });
});
