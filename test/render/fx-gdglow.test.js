// test/render/fx-gdglow.test.js — 澄闪 (char_377_gdglow) 驭械术师 funnel: the optional official-art tier of the `drone`
// fx kind (docs/ASSETS.md "Battle effects"). The funnel's own texture (char_gdglow_04, the `char_gdglow_14` material's
// `_MainTex`) lives in a SHARED external CAB (refs/fx/texture/object.ab); tools/local-extract/extract.py resolves it
// (EXTERNAL_MATERIALS) into fx/gdglow, tools/local-extract/fx-official-overrides.json pins it, and
// tools/build-fx-official.mjs emits the FX_OFFICIAL entry the resolver consults. Without the art the `drone` kind's
// procedural summon burst is drawn. Pinned against the headless fake PIXI like fx-local.test.js.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

let fake, FX, OFF;
before(async () => {
  fake = installFakePixi();
  FX = await import('../../public/js/render/fx.js');
  OFF = await import('../../public/js/render/fx/official.js');
});
after(() => fake.restore());

const cam = presetCamera('normal', { width: 1600, height: 900 });
const PICTURE = { width: 128, height: 128 };

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

function makeFx(assets, views = new Map()) {
  const P = fake.P;
  const ctx = fakeViewCtx(P);
  return new FX.FxSystem({
    P, layers: ctx.layers, cam: () => cam, assets, settings: { quality: 'high', damageNumbers: true }, heightAt: () => 0,
    timeScale: () => 2, loadLevel: () => 0, subProfOf: () => null, view: (id) => views.get(id) || null,
    screenSize: () => ({ width: 1600, height: 900 }), fieldTop: () => 120,
  });
}

const fakeView = (x, y, defId) => ({ x, y, z: 0, info: { defId, spine: defId } });

describe('驭械术师 funnel official art (char_377_gdglow)', () => {
  test('the generated table lists the funnel layer for the `drone` kind', () => {
    const e = OFF.FX_OFFICIAL.char_377_gdglow;
    assert.ok(e, 'char_377_gdglow is in FX_OFFICIAL');
    assert.equal(e.group, 'fx/gdglow');
    assert.deepEqual(e.kinds, ['drone']);
    assert.deepEqual(e.layers, [{ name: 'char_gdglow_04', scale: 1.3 }]);
  });

  test('the drone fx draws the extracted funnel field for char_377_gdglow; an unlisted caster stays procedural', () => {
    const e = OFF.FX_OFFICIAL.char_377_gdglow;
    const url = (n) => `/assets/local/${e.group}/${n}.png`;
    const groups = { [e.group]: Object.fromEntries(e.layers.map((l) => [l.name, url(l.name)])) };
    const loaded = Object.fromEntries(e.layers.map((l) => [url(l.name), PICTURE]));
    const fx = makeFx(fakeAssets(groups, loaded), new Map([[1, fakeView(5, 10, 'char_377_gdglow')]]));
    fx.simFx('drone', 5, 10, { id: 1 });
    assert.equal(fx.rings.length, e.layers.length, 'one official funnel field per layer');
    assert.equal(fx.parts.length, 0, 'the procedural summon burst is skipped');
    const locals = [...fx.localTex.values()];
    for (const r of fx.rings) assert.ok(locals.includes(r.sp.texture), 'the ring draws the official texture');
    // a funnel operator not in the table keeps the procedural burst (never a fetch)
    const a = fakeAssets(groups, loaded);
    const fx2 = makeFx(a, new Map([[2, fakeView(5, 10, 'char_999_nope')]]));
    fx2.simFx('drone', 5, 10, { id: 2 });
    assert.ok(fx2.parts.length > 0, 'an unlisted caster keeps the procedural summon burst');
    assert.equal(fx2.localTex.size, 0);
    assert.deepEqual(a.called, [], 'the fallback never fetches the art');
  });

  test('missing manifest entry → procedural, no network (a clone without the extraction)', () => {
    const a = fakeAssets({});
    const fx = makeFx(a, new Map([[1, fakeView(5, 10, 'char_377_gdglow')]]));
    fx.simFx('drone', 5, 10, { id: 1 });
    assert.ok(fx.parts.length > 0, 'procedural summon burst');
    assert.equal(fx.localTex.size, 0);
    assert.deepEqual(a.called, [], 'never a fetch');
  });
});
