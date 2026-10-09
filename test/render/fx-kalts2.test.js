// test/render/fx-kalts2.test.js — 凯尔希·思衡托 S2 保护性拒止 (kit server/sim/content/kits/ops/chess_char_1052_kalts2-kalts2.js):
// the 医疗单元's burst is drawn in the OFFICIAL colours — ONE green heal orb (FX_KINDS.kalts2Heal) and ONE red damage orb
// (FX_KINDS.kalts2Damage) per burst, both centred on the impact point (the sim emits one event each, see
// test/content/chess_kalts2.test.js). Colours come from the client's own material tints in
// battle/prefabs/effects/kalts2.ab (kalts2_skill_02_range_heal_01 green / kalts2_skill_02_range_damage_01 red). The local
// field's radius is `r × layer.scale` (render/fx/simfx.js `_fxLocal`), so the outer layer is scale 1 at r = 1.5 — the S2
// hit radius — and the orb spans the burst (docs/MATCHMAKING.md §35.11).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FxSystem, FX_KINDS, fxSpec } from '../../public/js/render/fx.js';
import { presetCamera } from '../../public/js/render/projection.js';

test('kalts2 S2 burst kinds: a GREEN 1.5 heal field and a RED 1.5 damage field, each its own kind', () => {
  assert.equal(FX_KINDS.kalts2Heal.a, 'healAoe');
  assert.equal(FX_KINDS.kalts2Heal.c, 0x62f08a, 'the official green');
  assert.equal(FX_KINDS.kalts2Heal.r, 1.5, 'the 1.5 heal radius');
  assert.equal(FX_KINDS.kalts2Damage.a, 'blast');
  assert.equal(FX_KINDS.kalts2Damage.c, 0xe03232, 'the official red');
  assert.equal(FX_KINDS.kalts2Damage.r, 1.5, 'the 1.5 damage radius');
  // explicit kinds (no keyword guess), and the heal reads apart from the damage
  assert.equal(fxSpec('kalts2Heal').a, 'healAoe');
  assert.equal(fxSpec('kalts2Damage').a, 'blast');
  assert.notEqual(FX_KINDS.kalts2Heal.c, FX_KINDS.kalts2Damage.c);
  // the outer local layer spans the burst: its field radius is r × scale = 1.5 tiles = S2_RADIUS (render/fx/simfx.js
  // `_fxLocal` → render/fx/rings.js `ring`), and the inner star core keeps the original 0.8 ratio
  for (const kind of ['kalts2Heal', 'kalts2Damage']) {
    const s = FX_KINDS[kind];
    assert.equal(s.local.layers[0].scale, 1, `${kind}: the outer layer spans r (1.5)`);
    assert.equal(s.r * s.local.layers[0].scale, 1.5, `${kind}: outer field radius = S2 hit radius`);
    assert.equal(s.local.layers[1].scale, 0.8, `${kind}: inner core 0.8 of the field`);
  }
});

function recordingFx() {
  const cam = presetCamera('boss', { width: 1280, height: 720 });
  const calls = [];
  const fx = Object.create(FxSystem.prototype);
  const rec = (name) => (...a) => { calls.push(name); return name === '_where' || name === '_point' ? { x: a[0], y: a[1], z: 0, v: null } : undefined; };
  Object.assign(fx, {
    ctx: { cam: () => cam, heightAt: () => 0, fieldRect: () => ({ r0: 0, r1: 5, c0: 0, c1: 20 }), timeScale: () => 2 },
    _p: { x: 0, y: 0, s: 0, depth: 0 }, _q: { x: 0, y: 0, s: 0, depth: 0 }, locks: [],
    _where: rec('_where'), _point: rec('_point'), particle: rec('particle'), ring: rec('ring'), burst: rec('burst'),
    explosion: rec('explosion'), flashScreen: rec('flashScreen'), tileFlash: rec('tileFlash'),
  });
  fx._chest = (v, out) => Object.assign(out, cam.project(0, 0, 0.5, out));
  return { fx, calls };
}

test('the two kinds are drawn: kalts2Damage explodes, kalts2Heal rings and sheds plus particles', () => {
  const { fx, calls } = recordingFx();
  fx.simFx('kalts2Damage', 7, 10, { id: 20 });
  assert.ok(calls.includes('explosion'), 'the red damage burst is an explosion');
  calls.length = 0;
  fx.simFx('kalts2Heal', 3, 10, { id: 5 });
  assert.ok(calls.includes('ring') && calls.includes('particle'), 'the green heal field rings and sheds plus particles');
});
