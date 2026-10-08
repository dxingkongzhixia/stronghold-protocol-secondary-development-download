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
let fake, FX, LA, OFF;
before(async () => {
  fake = installFakePixi();
  FX = await import('../../public/js/render/fx.js');
  LA = await import('../../public/js/render/fx/localart.js');
  OFF = await import('../../public/js/render/fx/official.js');
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

/** A real FxSystem over the fake PIXI (assets is the fake store); `views` maps a unit id to a fake UnitView. */
function makeFx(assets, settings = { quality: 'high', damageNumbers: true }, views = new Map()) {
  const P = fake.P;
  const ctx = fakeViewCtx(P);
  return new FX.FxSystem({
    P, layers: ctx.layers, cam: () => cam, assets, settings, heightAt: () => 0,
    timeScale: () => 2, loadLevel: () => 0, subProfOf: () => null, view: (id) => views.get(id) || null,
    screenSize: () => ({ width: 1600, height: 900 }), fieldTop: () => 120,
  });
}

/** A fake UnitView of an anchored fx: the manager's view reads `info.spine || info.defId` (render/fx/simfx.js). */
const fakeView = (x, y, defId) => ({ x, y, z: 0, info: { defId, spine: defId } });

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

// --- attribution: a kind shared by many operators (local.bySkill / local.byOp) --------------------------------
const MK = 'fx/makoto';
const MK_URL = (n) => `/assets/local/${MK}/${n}.png`;
const MK_GROUPS = { [MK]: { flow_294_color_01: MK_URL('flow_294_color_01'), star_324: MK_URL('star_324'), ray_136: MK_URL('ray_136') } };
const MK_LOADED = { [MK_URL('flow_294_color_01')]: PICTURE, [MK_URL('star_324')]: PICTURE, [MK_URL('ray_136')]: PICTURE };

describe('fx local-art attribution: render/fx/localart.js fxLocalFor', () => {
  const base = { group: 'g', tint: 0x111111, dur: 0.5, layers: [{ name: 'base' }] };

  test('a plain local (only layers / name) is returned as it is', () => {
    assert.equal(LA.fxLocalFor(base), base);
    const named = { group: 'g', name: 'n' };
    assert.equal(LA.fxLocalFor(named), named);
  });

  test('bySkill picks the entry and wins over byOp; byOp is the fallback', () => {
    const local = { group: 'g', bySkill: { s1: { layers: [{ name: 'sk' }] } }, byOp: { op1: { layers: [{ name: 'op' }] } } };
    assert.deepEqual(LA.fxLocalFor(local, { skill: 's1' }, 'op1').layers, [{ name: 'sk' }]);
    assert.deepEqual(LA.fxLocalFor(local, { skill: 'nope' }, 'op1').layers, [{ name: 'op' }]);
    assert.deepEqual(LA.fxLocalFor(local, {}, 'op1').layers, [{ name: 'op' }]);
  });

  test('a selected entry inherits group / tint / dur (and base layers when it names none)', () => {
    const local = { group: 'g', tint: 0x222222, dur: 0.4, layers: [{ name: 'base' }], byOp: { op1: { scale: 2, tint: 0x333333 } } };
    const out = LA.fxLocalFor(local, {}, 'op1');
    assert.equal(out.group, 'g');
    assert.equal(out.tint, 0x333333);
    assert.equal(out.dur, 0.4);
    assert.deepEqual(out.layers, [{ name: 'base' }], 'the base layers are inherited when the entry has none');
    assert.equal(out.byOp, undefined, 'the map is not carried into the resolved spec');
  });

  test('nothing matches and there are no base layers → null (the caller stays procedural, no fetch)', () => {
    const local = { byOp: { op1: { group: 'g', layers: [{ name: 'x' }] } } };
    assert.equal(LA.fxLocalFor(local, {}, 'other'), null);
    assert.equal(LA.fxLocalFor(local, {}, null), null);
    assert.equal(LA.fxLocalFor(null), null);
  });
});

describe('fx kinds: official art attributed by operator (aoe / strike / champagneBomb / takeoff)', () => {
  test('a matching operator anchor draws its official layers; another operator stays procedural (no fetch)', () => {
    const a = fakeAssets(MK_GROUPS, MK_LOADED);
    const fx = makeFx(a, undefined, new Map([[1, fakeView(5, 10, 'char_4217_makoto')]]));
    fx.simFx('aoe', 5, 10, { id: 1 });
    assert.equal(fx.rings.length, 2, '结城理 official aoe layers');
    assert.equal(fx.parts.length, 0, 'the procedural blast is skipped');
    assert.deepEqual(a.called, []);
    fx.clear();
    // the same kind from another operator: no byOp entry → procedural, and never consults the manifest
    const fx2 = makeFx(a, undefined, new Map([[2, fakeView(5, 10, 'char_1234_other')]]));
    fx2.simFx('aoe', 5, 10, { id: 2 });
    assert.ok(fx2.parts.length > 0, 'the procedural blast');
    assert.deepEqual(a.called, []);
  });

  test('a `strike` anchored on the victim attributes to its `src` (结城理), not the victim', () => {
    const a = fakeAssets(MK_GROUPS, MK_LOADED);
    const views = new Map([[7, fakeView(3, 4, 'char_4217_makoto')], [9, fakeView(5, 10, 'enemy_1001_slime')]]);
    const fx = makeFx(a, undefined, views);
    fx.simFx('strike', 5, 10, { id: 9, src: 7 });
    assert.equal(fx.rings.length, 2);
    assert.equal(fx.parts.length, 0);
  });

  test('望 棋子: the token anchor picks the wang group; a missing extraction keeps the procedural blast', () => {
    const WG = 'fx/wang';
    const W_URL = (n) => `/assets/local/${WG}/${n}.png`;
    const groups = { [WG]: { char_wang_05: W_URL('char_wang_05'), char_wang_03: W_URL('char_wang_03') } };
    const loaded = { [W_URL('char_wang_05')]: PICTURE, [W_URL('char_wang_03')]: PICTURE };
    const views = new Map([[4, fakeView(5, 10, 'token_10064_wang_stone1')]]);
    const fx = makeFx(fakeAssets(groups, loaded), undefined, views);
    fx.simFx('champagneBomb', 5, 10, { id: 4, consumed: true });
    assert.equal(fx.rings.length, 2);
    fx.clear();
    const fx2 = makeFx(fakeAssets({}), undefined, views);
    fx2.simFx('champagneBomb', 5, 10, { id: 4 });
    assert.ok(fx2.parts.length > 0, 'no manifest entry → the procedural explosion');
  });
});

// --- the generated per-operator table (render/fx/official.js, tools/build-fx-official.mjs) ------------------------
describe('fx official-art table: the season roster (render/fx/official.js)', () => {
  const manifest = (() => { try { return JSON.parse(readFileSync(path.join(ROOT, 'data/local-assets.committed.json'), 'utf8')); } catch { return null; } })();
  const skip = manifest ? false : 'no data/local-assets.committed.json';

  test('fxLocalFor consults the table for a kind with no layers of its own, filtered to the operator kinds', () => {
    const e = OFF.FX_OFFICIAL.char_1040_blaze2;          // group fx/blaze2, kinds include 'splash'
    assert.ok(e && e.kinds.includes('splash'), 'blaze2 emits splash');
    assert.equal(LA.fxLocalFor({ official: true }, {}, 'char_1040_blaze2', 'splash').group, e.group);
    assert.deepEqual(LA.fxLocalFor({ official: true }, {}, 'char_1040_blaze2', 'splash').layers, e.layers);
    assert.equal(LA.fxLocalFor({ official: true }, {}, 'char_1040_blaze2', 'not_a_kind'), null, 'only the kinds the kit emits');
    assert.equal(LA.fxLocalFor({ official: true }, {}, 'char_nope', 'splash'), null, 'an operator not listed stays procedural');
    // a kind with its own base layers is never overridden by the table (kalts2Heal / kalts2Damage)
    const base = { group: 'g', layers: [{ name: 'x' }] };
    assert.equal(LA.fxLocalFor(base, {}, 'char_1040_blaze2', 'splash'), base);
  });

  test('a registered operator draws its official layers on a kind its kit emits; an unregistered one stays procedural', () => {
    const e = OFF.FX_OFFICIAL.char_1040_blaze2;
    const url = (n) => `/assets/local/${e.group}/${n}.png`;
    const groups = { [e.group]: Object.fromEntries(e.layers.map((l) => [l.name, url(l.name)])) };
    const loaded = Object.fromEntries(e.layers.map((l) => [url(l.name), PICTURE]));
    const a = fakeAssets(groups, loaded);
    const fx = makeFx(a, undefined, new Map([[1, fakeView(5, 10, 'char_1040_blaze2')]]));
    fx.simFx('splash', 5, 10, { id: 1 });
    assert.equal(fx.rings.length, e.layers.length, 'one official ground field per layer');
    assert.equal(fx.parts.length, 0, 'the procedural blast is skipped');
    assert.deepEqual(a.called, []);
    fx.clear();
    const fx2 = makeFx(fakeAssets(groups, loaded), undefined, new Map([[2, fakeView(5, 10, 'char_nope')]]));
    fx2.simFx('splash', 5, 10, { id: 2 });
    assert.ok(fx2.parts.length > 0, 'an operator not in the table keeps the procedural blast');
  });

  test('a registered operator whose group is absent draws the procedural tier (never a fetch, never blank)', () => {
    const a = fakeAssets({});
    const fx = makeFx(a, undefined, new Map([[1, fakeView(5, 10, 'char_1040_blaze2')]]));
    fx.simFx('splash', 5, 10, { id: 1 });
    assert.ok(fx.parts.length > 0, 'procedural blast');
    assert.equal(fx.localTex.size, 0);
    assert.deepEqual(a.called, [], 'the fallback never touches the network');
  });

  test('the table matches the registered groups: every entry is a roster operator of an fx group, all layers committed on disk', { skip }, () => {
    const groups = manifest.groups || {};
    const keys = Object.keys(OFF.FX_OFFICIAL);
    assert.ok(keys.length >= 80, `the roster is covered (${keys.length} operators)`);
    for (const [op, e] of Object.entries(OFF.FX_OFFICIAL)) {
      assert.match(op, /^char_/, op);
      assert.match(e.group, /^fx\//, op);
      assert.ok(Array.isArray(e.kinds) && e.kinds.length, `${op}: at least one kind`);
      assert.ok(Array.isArray(e.layers) && e.layers.length >= 1 && e.layers.length <= 2, `${op}: 1–2 layers`);
      const g = groups[e.group];
      assert.ok(g, `${op}: ${e.group} is a registered committed group`);
      for (const ly of e.layers) {
        assert.ok(g[ly.name], `${e.group}/${ly.name} committed`);
        assert.ok(existsSync(path.join(ROOT, 'public', g[ly.name].path)), `${e.group}/${ly.name} on disk`);
      }
    }
  });
});

// --- the shared normal-attack / hit flare (render/fx/projectiles.js _impact, render/fx/numbers.js damage) -------------
describe("fx official normal-attack / hit flare (kind 'hit')", () => {
  const manifest = (() => { try { return JSON.parse(readFileSync(path.join(ROOT, 'data/local-assets.committed.json'), 'utf8')); } catch { return null; } })();
  const skip = manifest ? false : 'no data/local-assets.committed.json';

  /** A hit-path unit view (render/fx as the fx system reads it): `damage`/`_impact` need id / maxHp / onHit. */
  const hitView = (id, x, y, defId) => ({ id, x, y, z: 0, hover: 0, _headTiles: 1.2, alive: true, destroyed: false, maxHp: 3000, info: { defId, spine: defId }, onHit() {} });

  test('every generated table entry carries the shared attack/hit kind', { skip }, () => {
    for (const [op, e] of Object.entries(OFF.FX_OFFICIAL)) assert.ok(e.kinds.includes('hit'), `${op} lists 'hit'`);
  });

  test('a registered operator\'s melee blow draws its official layers; an unregistered attacker stays procedural (no fetch)', () => {
    const e = OFF.FX_OFFICIAL.char_1040_blaze2;
    const url = (n) => `/assets/local/${e.group}/${n}.png`;
    const groups = { [e.group]: Object.fromEntries(e.layers.map((l) => [l.name, url(l.name)])) };
    const loaded = Object.fromEntries(e.layers.map((l) => [url(l.name), PICTURE]));
    const atk = hitView(1, 3, 4, 'char_1040_blaze2');
    const fx = makeFx(fakeAssets(groups, loaded));
    fx._slashAt = atk.id;                          // app.js sets this just before a melee 'dmg'
    fx.damage(hitView(2, 5, 10, 'enemy_1001'), 100, 'phys', atk);
    assert.equal(fx.rings.length, e.layers.length, 'one official ground field per layer');
    assert.equal(fx.localTex.size, e.layers.length);
    for (const r of fx.rings) assert.ok([...fx.localTex.values()].includes(r.sp.texture), 'each field draws an official texture');
    fx.clear();
    // an attacker not in the table (an enemy): the procedural white burst, no local texture, no manifest access
    const a = fakeAssets(groups, loaded);
    const fx2 = makeFx(a);
    const enemy = hitView(3, 3, 4, 'enemy_1001');
    fx2._slashAt = enemy.id;
    fx2.damage(hitView(4, 5, 10, 'enemy_1001'), 100, 'phys', enemy);
    assert.equal(fx2.localTex.size, 0);
    assert.ok(fx2.parts.length > 0, 'the procedural white burst is drawn');
    assert.deepEqual(a.called, [], 'an operator the table does not list is never fetched');
  });

  test('a registered operator\'s ranged shot draws its official layers where it lands', () => {
    const e = OFF.FX_OFFICIAL.char_1040_blaze2;
    const url = (n) => `/assets/local/${e.group}/${n}.png`;
    const groups = { [e.group]: Object.fromEntries(e.layers.map((l) => [l.name, url(l.name)])) };
    const loaded = Object.fromEntries(e.layers.map((l) => [url(l.name), PICTURE]));
    const atk = hitView(1, 3, 10, 'char_1040_blaze2');
    const tgt = hitView(2, 6, 10, 'enemy_1001');
    const fx = makeFx(fakeAssets(groups, loaded), undefined, new Map([[1, atk], [2, tgt]]));
    fx.attack(atk, tgt, 'arrow');
    for (let t = 0; t < 0.15; t += 1 / 120) fx.update(1 / 120);   // fly and land (rings live 0.32 s: still there)
    assert.equal(fx.localTex.size, e.layers.length, 'the arrival burst uses the official textures');
    assert.ok(fx.rings.length >= e.layers.length, 'the official ground fields are drawn at the impact');
  });

  test('with the art not listed the hit stays procedural and never touches the network', () => {
    const a = fakeAssets({});
    const atk = hitView(1, 3, 4, 'char_1040_blaze2');
    const fx = makeFx(a);
    fx._slashAt = atk.id;
    fx.damage(hitView(2, 5, 10, 'enemy_1001'), 100, 'phys', atk);
    assert.equal(fx.localTex.size, 0);
    assert.ok(fx.parts.length > 0, 'the procedural white burst');
    assert.deepEqual(a.called, [], 'an unlisted layer is not fetched');
  });
});

// --- the committed manifest ships the extracted groups (a clone gets them with no local client) ------------------
describe('official fx art of our custom operators (committed manifest)', () => {
  const manifest = (() => { try { return JSON.parse(readFileSync(path.join(ROOT, 'data/local-assets.committed.json'), 'utf8')); } catch { return null; } })();
  const skip = manifest ? false : 'no data/local-assets.committed.json';

  test('the operator effect groups are committed (extracted even before every one is wired)', { skip }, () => {
    const groups = manifest.groups || {};
    for (const g of ['fx/kalts2', 'fx/makoto', 'fx/narant', 'fx/wang', 'fx/aglna2', 'fx/ascln', 'fx/gdglow']) {
      assert.ok(groups[g] && Object.keys(groups[g]).length, `${g} committed`);
    }
  });

  test('every layer the wired kinds name is listed and on disk', { skip }, () => {
    const groups = manifest.groups || {};
    let n = 0;
    for (const def of Object.values(FX.FX_KINDS)) {
      const local = def && def.local;
      if (!local) continue;
      for (const [key, entry] of [...Object.entries(local.byOp || {}), ...Object.entries(local.bySkill || {})]) {
        for (const ly of LA.fxLocalLayers(entry)) {
          const g = ly.group || local.group;
          assert.ok(groups[g] && groups[g][ly.name], `${g}/${ly.name} (${key}) committed`);
          assert.ok(existsSync(path.join(ROOT, 'public', groups[g][ly.name].path)), `${g}/${ly.name} on disk`);
          n++;
        }
      }
    }
    assert.ok(n >= 8, 'several wired layers');
  });
});
