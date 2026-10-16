// test/render/fx-local.test.js — the optional local-art tier of an fx kind (docs/ASSETS.md "Battle effects").
//
// A kind's `local` spec (render/fx/kinds.js) names official pictures of the local-client manifest
// (data/local-assets.json): render/fx/localart.js resolves them (per client), and render/fx/simfx.js draws them as
// ground fields INSTEAD of the procedural archetype only when the client has every layer listed AND loaded; else the
// procedural drawing is used. So a connected client without the art sees the procedural version — the same effect,
// bytes neither blank nor fetched for the fallback (owner's Minecraft-shader-style graceful degradation). This file
// pins (a) the fallback, (b) the local tier of the generated roster table (render/fx/official.js). Our own custom
// operators are deliberately not in that table any more: they use the official battle effects and fall back to the plain
// procedural archetype (owner, 2026-10-16), so their kinds never resolve a local spec.
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

/** The animation-grid names the fx-official picker must never choose (tools/build-fx-official.mjs SHEET). */
const SHEET = /(^|[^a-z0-9])(flipbook|sprite|sheet|atlas|sequence|filmstrip)([^a-z0-9]|$)/i;
/** The per-attack / impact kinds the fx-official table must never carry (tools/build-fx-official.mjs IMPACT_KINDS). */
const IMPACT_KINDS = new Set(['hit', 'crit', 'strike', 'slash', 'beam', 'bolt']);
/** The soft in-place effect texture families the fx-official picker is restricted to (tools/build-fx-official.mjs). */
const EFFECT_TEX = /(?:^|[^a-z0-9])(flow|ray|glow|ring|star|light|smoke|aura|halo)(?:[^a-z0-9]|$)/i;
/** The archetypes an official ground field is the right read for: AREA / SELF in-place effects (tools/build-fx-official.mjs KIND_ARCH). */
const KIND_ARCH = new Set(['blast', 'zone', 'healAoe', 'wave',
  'buff', 'shield', 'shatter', 'summon', 'vanish', 'lift', 'sleep', 'heal', 'down', 'counter', 'dodge', 'dp', 'coin', 'sp']);

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
    const src = LA.fxLocalSource(a, { group: GROUP, layers: [{ name: 'flow_332_3' }, { name: 'star_118_7' }] });
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

  test('our custom operators fall back to the procedural archetype — no local spec, no fetch', () => {
    const a = fakeAssets(GROUPS, LOADED);
    const fx = makeFx(a, undefined, new Map([[1, fakeView(5, 10, 'char_4217_makoto')]]));
    fx.simFx('aoe', 5, 10, { id: 1 });
    assert.ok(fx.parts.length > 0, 'the procedural blast is drawn (the official battle effects handle 结城理 instead)');
    assert.equal(fx.localTex.size, 0);
    assert.deepEqual(a.called, [], 'the fallback never consults the manifest');
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

describe('fx kinds of our custom operators: no attributed local art any more (procedural, no fetch)', () => {
  test('a shared kind from a custom operator stays procedural, another operator too, and nothing is fetched', () => {
    const a = fakeAssets(MK_GROUPS, MK_LOADED);
    const fx = makeFx(a, undefined, new Map([[1, fakeView(5, 10, 'char_4217_makoto')]]));
    fx.simFx('aoe', 5, 10, { id: 1 });
    assert.ok(fx.parts.length > 0, 'the procedural blast (结城理 uses the official battle effects instead)');
    assert.equal(fx.localTex.size, 0);
    fx.clear();
    const fx2 = makeFx(a, undefined, new Map([[2, fakeView(5, 10, 'char_1234_other')]]));
    fx2.simFx('aoe', 5, 10, { id: 2 });
    assert.ok(fx2.parts.length > 0, 'the procedural blast');
    assert.deepEqual(a.called, [], 'the fallback never consults the manifest');
  });

  test('a `strike` on a custom operator is procedural too, whatever the anchor', () => {
    const a = fakeAssets(MK_GROUPS, MK_LOADED);
    const views = new Map([[7, fakeView(3, 4, 'char_4217_makoto')], [9, fakeView(5, 10, 'enemy_1001_slime')]]);
    const fx = makeFx(a, undefined, views);
    fx.simFx('strike', 5, 10, { id: 9, src: 7 });
    assert.ok(fx.parts.length > 0, 'the procedural strike flare');
    assert.equal(fx.localTex.size, 0);
    assert.deepEqual(a.called, []);
  });

  test('望 棋子: the token anchor is procedural too; a missing extraction is the same', () => {
    const WG = 'fx/wang';
    const W_URL = (n) => `/assets/local/${WG}/${n}.png`;
    const groups = { [WG]: { char_wang_05: W_URL('char_wang_05'), char_wang_03: W_URL('char_wang_03') } };
    const loaded = { [W_URL('char_wang_05')]: PICTURE, [W_URL('char_wang_03')]: PICTURE };
    const views = new Map([[4, fakeView(5, 10, 'token_10064_wang_stone1')]]);
    const fx = makeFx(fakeAssets(groups, loaded), undefined, views);
    fx.simFx('champagneBomb', 5, 10, { id: 4, consumed: true });
    assert.ok(fx.parts.length > 0, 'the procedural blast');
    assert.equal(fx.localTex.size, 0);
    const fx2 = makeFx(fakeAssets({}), undefined, views);
    fx2.simFx('champagneBomb', 5, 10, { id: 4 });
    assert.ok(fx2.parts.length > 0, 'no manifest entry → the same procedural explosion');
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
    assert.ok(keys.length >= 50, `the roster is covered (${keys.length} operators)`);
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

  test('no chosen layer is an animation grid (a flipbook / sheet would show a whole sheet of images)', { skip }, () => {
    for (const [op, e] of Object.entries(OFF.FX_OFFICIAL)) {
      for (const ly of e.layers) assert.ok(!SHEET.test(ly.name), `${op} picked the animation grid ${ly.name}`);
    }
  });

  test('an operator whose only usable art is a sheet gets no entry (its procedural tier stays)', { skip }, () => {
    // 烈夏 (lionhd): fx/lionhd carries one Texture2D, flipbook_86 — an animation grid, so there is no single-frame
    // effect to draw and the entry is absent (the procedural 'explosion' is drawn instead).
    const group = manifest.groups['fx/lionhd'];
    assert.ok(group && Object.keys(group).length === 1 && SHEET.test(Object.keys(group)[0]), 'fx/lionhd is a single flipbook');
    assert.equal(OFF.FX_OFFICIAL.char_373_lionhd, undefined, 'no entry for a sheet-only operator');
    // a mixed bundle keeps only its soft in-place effect pictures: 隐现 (inside) keeps AVG_flow_05, never the animation
    // grid flipbook_215 nor the object-looking inside_bullet01.
    const inside = OFF.FX_OFFICIAL.char_498_inside;
    assert.ok(inside && inside.layers.length >= 1, 'inside keeps a non-sheet effect field');
    for (const ly of inside.layers) {
      assert.ok(!SHEET.test(ly.name), `inside: ${ly.name} is not a sheet`);
      assert.ok(EFFECT_TEX.test(ly.name), `inside: ${ly.name} is a soft in-place effect picture`);
    }
  });

  test('every chosen layer is a soft in-place effect picture (flow / ray / glow / ring / star / light / smoke / aura / halo)', { skip }, () => {
    for (const [op, e] of Object.entries(OFF.FX_OFFICIAL)) {
      for (const ly of e.layers) {
        assert.ok(EFFECT_TEX.test(ly.name), `${op} picked the non-effect picture ${ly.name}`);
      }
      assert.ok(e.layers.length >= 1 && e.layers.length <= 2, `${op}: 1–2 layers`);
      // small scales: even before the draw-time cap, a layer stays around one body
      for (const ly of e.layers) assert.ok(ly.scale > 0 && ly.scale <= 1, `${op}: ${ly.name} scale ${ly.scale} is small`);
    }
  });

  test('the table only carries in-place AREA / SELF kinds (never per-target / per-hit / instant / unit-attached)', { skip }, () => {
    for (const [op, e] of Object.entries(OFF.FX_OFFICIAL)) {
      for (const k of e.kinds) {
        assert.ok(!IMPACT_KINDS.has(k), `${op} must not list the impact kind '${k}'`);
        assert.ok(KIND_ARCH.has(FX.fxSpec(k, {}).a), `${op} lists '${k}' (${FX.fxSpec(k, {}).a}), not an in-place area/self kind`);
      }
      assert.ok(e.kinds.length >= 1, `${op} lists some in-place kind`);
    }
  });
});

// --- the drawn-size cap and the kill switch (render/fx/localart.js, render/fx/simfx.js _fxLocal) ------------------
//
// An official picture is an in-place effect AT the anchor, never a board-wide ground field: a layer set's drawn radii
// (`r × layer.scale`) are scaled down together so the largest is at most LOCAL_FX_MAX_R (≈ one body), preserving the
// authored ratios. Before this, a wide archetype radius (a 'tide' r=2, a 'sermon' r=1.5, an 'aoe' behind a large
// skill) times a 1.5 layer scale painted a 2–3 tile flat image over the board — the owner's report.
describe('fx official-art drawn size: capped to ~one body (render/fx/simfx.js _fxLocal)', () => {
  const manifest = (() => { try { return JSON.parse(readFileSync(path.join(ROOT, 'data/local-assets.committed.json'), 'utf8')); } catch { return null; } })();
  const skip = manifest ? false : 'no data/local-assets.committed.json';

  test('the kill switch is ON by default and the cap is ~one body', () => {
    assert.equal(LA.LOCAL_ART_ENABLED, true, 'the local official-art tier is on by default');
    assert.ok(LA.LOCAL_FX_MAX_R > 0 && LA.LOCAL_FX_MAX_R <= 1.1, `the cap is ~one body (${LA.LOCAL_FX_MAX_R})`);
  });

  test('a generated entry on a wide kind draws every layer at ≤ LOCAL_FX_MAX_R (never a field over the board)', { skip }, () => {
    const e = OFF.FX_OFFICIAL.char_4194_rmixer;             // sermon: spec r = 1.5 (a wide 'wave')
    assert.ok(e && e.kinds.includes('sermon'), 'rmixer emits sermon');
    const url = (n) => `/assets/local/${e.group}/${n}.png`;
    const groups = { [e.group]: Object.fromEntries(e.layers.map((l) => [l.name, url(l.name)])) };
    const loaded = Object.fromEntries(e.layers.map((l) => [url(l.name), PICTURE]));
    const fx = makeFx(fakeAssets(groups, loaded), undefined, new Map([[1, fakeView(5, 10, 'char_4194_rmixer')]]));
    fx.simFx('sermon', 5, 10, { id: 1 });
    assert.equal(fx.rings.length, e.layers.length, 'one ground field per layer');
    assert.ok(fx.rings.length > 0, 'the official layers are drawn');
    for (const r of fx.rings) {
      assert.ok(r.r1 > 0 && r.r1 <= LA.LOCAL_FX_MAX_R, `r1 ${r.r1} ≤ ${LA.LOCAL_FX_MAX_R} (nominal r × scale = 1.35)`);
    }
    assert.equal(Math.max(...fx.rings.map((r) => r.r1)), LA.LOCAL_FX_MAX_R, 'the wide layer is clamped exactly to the cap');
  });

  test('a narrow kind keeps its own small radius (the cap is a ceiling, not a fixed size)', { skip }, () => {
    const e = OFF.FX_OFFICIAL.char_1040_blaze2;             // splash: spec r defaults to 1
    const url = (n) => `/assets/local/${e.group}/${n}.png`;
    const groups = { [e.group]: Object.fromEntries(e.layers.map((l) => [l.name, url(l.name)])) };
    const loaded = Object.fromEntries(e.layers.map((l) => [url(l.name), PICTURE]));
    const fx = makeFx(fakeAssets(groups, loaded), undefined, new Map([[1, fakeView(5, 10, 'char_1040_blaze2')]]));
    fx.simFx('splash', 5, 10, { id: 1 });
    assert.equal(fx.rings.length, 1);
    assert.ok(Math.abs(fx.rings[0].r1 - 0.9) < 1e-9, `1 × 0.9 = 0.9, under the cap (got ${fx.rings[0].r1})`);
  });
});

// --- the normal-attack impact stays procedural (render/fx/projectiles.js _impact, render/fx/numbers.js damage) --------
//
// The client's official per-attack hit art is a particle-system effect prefab the projectile prefabs name in
// `_effectsWhenHit` (common_hit_01 / <op>_hit_01 / …), not the operator's one signature Texture2D. An earlier design
// drew that signature texture as a ground field at the victim — visibly wrong (wrong texture, wrong anchor/scale) — so
// the normal-attack impact is drawn procedurally, never from the official table. These tests pin that: the hit path
// stays procedural for a registered operator (whose skill fx DO use the table) too, and never consults the manifest.
describe('fx normal-attack impact: procedural, not the official table', () => {
  const manifest = (() => { try { return JSON.parse(readFileSync(path.join(ROOT, 'data/local-assets.committed.json'), 'utf8')); } catch { return null; } })();
  const skip = manifest ? false : 'no data/local-assets.committed.json';

  /** A hit-path unit view (render/fx as the fx system reads it): `damage`/`_impact` need id / maxHp / onHit. */
  const hitView = (id, x, y, defId) => ({ id, x, y, z: 0, hover: 0, _headTiles: 1.2, alive: true, destroyed: false, maxHp: 3000, info: { defId, spine: defId }, onHit() {} });

  test('the generated table carries no impact kind and no fx-less operator', { skip }, () => {
    for (const [op, e] of Object.entries(OFF.FX_OFFICIAL)) {
      for (const k of e.kinds) {
        assert.ok(!IMPACT_KINDS.has(k), `${op} must not list the attack / impact kind '${k}'`);
      }
      assert.ok(Array.isArray(e.kinds) && e.kinds.length, `${op} lists some skill fx kind`);
    }
    // an operator whose kit emits only impact kinds is absent entirely: 跃击's 战终 (ayer, 'strike'), 克洛丝 (prove,
    // 'crit'), 跃跃 (caper, 'crit') and 雷蛇 (f12yin, 'crit') keep their procedural tier.
    for (const op of ['char_294_ayer', 'char_145_prove', 'char_4100_caper', 'char_264_f12yin']) {
      assert.equal(OFF.FX_OFFICIAL[op], undefined, `${op} (impact kinds only) has no entry`);
    }
  });

  test('a registered operator\'s melee blow is drawn procedurally and never touches the manifest', () => {
    // blaze2 is in the table (its skill fx use the official art) but its melee blow must stay procedural, and no
    // registered layer is even resolved/fetched for the hit path.
    assert.ok(OFF.FX_OFFICIAL.char_1040_blaze2, 'blaze2 is a registered operator');
    const e = OFF.FX_OFFICIAL.char_1040_blaze2;
    const url = (n) => `/assets/local/${e.group}/${n}.png`;
    const groups = { [e.group]: Object.fromEntries(e.layers.map((l) => [l.name, url(l.name)])) };
    const loaded = Object.fromEntries(e.layers.map((l) => [url(l.name), PICTURE]));
    const a = fakeAssets(groups, loaded);
    const atk = hitView(1, 3, 4, 'char_1040_blaze2');
    const fx = makeFx(a);
    fx._slashAt = atk.id;                          // app.js sets this just before a melee 'dmg'
    fx.damage(hitView(2, 5, 10, 'enemy_1001'), 100, 'phys', atk);
    assert.equal(fx.rings.length, 0, 'no official ground field on the hit path');
    assert.equal(fx.localTex.size, 0, 'no official texture on the hit path');
    assert.ok(fx.parts.length > 0, 'the procedural glow / burst / slash is drawn');
    assert.deepEqual(a.called, [], 'the hit path never consults (or fetches) the local manifest');
  });

  test('a ranged shot\'s impact is drawn procedurally, even for a registered operator', () => {
    const e = OFF.FX_OFFICIAL.char_1040_blaze2;
    const url = (n) => `/assets/local/${e.group}/${n}.png`;
    const groups = { [e.group]: Object.fromEntries(e.layers.map((l) => [l.name, url(l.name)])) };
    const loaded = Object.fromEntries(e.layers.map((l) => [url(l.name), PICTURE]));
    const a = fakeAssets(groups, loaded);
    const atk = hitView(1, 3, 10, 'char_1040_blaze2');
    const tgt = hitView(2, 6, 10, 'enemy_1001');
    const fx = makeFx(a, undefined, new Map([[1, atk], [2, tgt]]));
    fx.attack(atk, tgt, 'arrow');
    for (let t = 0; t < 0.2; t += 1 / 120) fx.update(1 / 120);   // fly and land
    assert.equal(fx.localTex.size, 0, 'the arrival burst draws no official texture');
    assert.equal(fx.rings.length, 0, 'no official ground field at the impact');
    assert.ok(fx.parts.length > 0, 'the procedural arrival burst (the spark flare) is drawn');
    assert.deepEqual(a.called, [], 'the impact never consults the manifest');
  });

  test('an operator not listed behaves the same: procedural, no fetch', () => {
    const a = fakeAssets({});
    const atk = hitView(1, 3, 4, 'char_nope');
    const fx = makeFx(a);
    fx._slashAt = atk.id;
    fx.damage(hitView(2, 5, 10, 'enemy_1001'), 100, 'phys', atk);
    assert.equal(fx.localTex.size, 0);
    assert.ok(fx.parts.length > 0, 'the procedural white burst');
    assert.deepEqual(a.called, [], 'an unlisted operator is never fetched');
  });
});

// --- the committed manifest ships the extracted groups (a clone gets them with no local client) ------------------
describe('official fx art of our custom operators (committed manifest)', () => {
  const manifest = (() => { try { return JSON.parse(readFileSync(path.join(ROOT, 'data/local-assets.committed.json'), 'utf8')); } catch { return null; } })();
  const skip = manifest ? false : 'no data/local-assets.committed.json';

  const OURS = ['char_4132_ascln', 'char_4217_makoto', 'char_1015_aglna2', 'char_377_gdglow', 'char_4138_narant', 'char_1052_kalts2', 'char_4231_clemnt', 'char_2027_wang'];

  test('our custom operators are NOT in the generated table (official fx + procedural fallback)', () => {
    for (const op of OURS) assert.equal(OFF.FX_OFFICIAL[op], undefined, `${op} has no entry`);
  });

  test('no fx kind carries a local spec for our custom operators or their summons', () => {
    const ours = new Set([...OURS, 'token_10064_wang_stone1']);
    for (const [kind, def] of Object.entries(FX.FX_KINDS)) {
      const local = def && def.local;
      if (!local) continue;
      for (const key of [...Object.keys(local.byOp || {}), ...Object.keys(local.bySkill || {})]) {
        assert.ok(!ours.has(key), `${kind} still wires ${key}`);
      }
    }
  });

  test('the operator effect groups are committed (kept for the official battle effects)', { skip }, () => {
    const groups = manifest.groups || {};
    for (const g of ['fx/kalts2', 'fx/makoto', 'fx/narant', 'fx/wang', 'fx/aglna2', 'fx/ascln', 'fx/gdglow']) {
      assert.ok(groups[g] && Object.keys(groups[g]).length, `${g} committed`);
    }
  });
});
