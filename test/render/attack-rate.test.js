// test/render/attack-rate.test.js — the pure pacing policy behind #729 (render/attackRate.js).
//
// The sim publishes a unit's own attack interval (UnitInfo.atkInterval, ['rate', id, seconds]); these functions only
// decide what the renderer does with it. Display policy, not game rules: nothing here can change a battle.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATK_MIN_S, ATK_MAX_S, ATK_DEFAULT_S, ATK_JUMP_TOLERANCE, ATK_DRIFT_SHARE,
  clampAtkInterval, startAtkInterval, nextAtkInterval,
} from '../../public/js/render/attackRate.js';

describe('clampAtkInterval: what the renderer is willing to show', () => {
  test('bounds a real value into the display window', () => {
    assert.equal(clampAtkInterval(1.3), 1.3);
    assert.equal(clampAtkInterval(0.05), ATK_MIN_S);
    assert.equal(clampAtkInterval(25), ATK_MAX_S);
  });

  test('a value that cannot be a duration falls back instead of freezing a clip', () => {
    for (const bad of [0, -1, NaN, Infinity, null, undefined, '', 'x']) {
      assert.equal(clampAtkInterval(bad), ATK_DEFAULT_S, String(bad));
    }
  });

  test('the window is a display choice: 0.2 s … 10 s', () => {
    assert.equal(ATK_MIN_S, 0.2);
    assert.equal(ATK_MAX_S, 10);
    assert.equal(ATK_DEFAULT_S, 1.2);
  });
});

describe('startAtkInterval: the sim value wins over the record guess', () => {
  test('a positive sim value is used as-is', () => {
    assert.equal(startAtkInterval(2.4, 1.0), 2.4);
  });

  test('without one, the base-record guess; without both, the default', () => {
    assert.equal(startAtkInterval(undefined, 1.5), 1.5);
    assert.equal(startAtkInterval(null, 0), ATK_DEFAULT_S);
    assert.equal(startAtkInterval(0, -3), ATK_DEFAULT_S);
  });

  test('the chosen value is clamped like every other', () => {
    assert.equal(startAtkInterval(100, 1), ATK_MAX_S);
    assert.equal(startAtkInterval(0.001, 1), ATK_MIN_S);
  });
});

describe('nextAtkInterval: authoritative vs measured', () => {
  test('authoritative: a measured gap is ignored — a pause is not a slower rhythm', () => {
    // a 3 s gap after a 1 s rhythm is a stop / stun / redeploy, never a 3 s attack interval
    assert.deepEqual(nextAtkInterval(1, 3, true, { authoritative: true }), { interval: 1, measured: false });
    assert.deepEqual(nextAtkInterval(1, 0.9, true, { authoritative: true }), { interval: 1, measured: false });
  });

  test('measured (no sim value): the first sane gap replaces the guess outright', () => {
    const r = nextAtkInterval(1.2, 0.8, false);
    assert.equal(r.measured, true);
    assert.ok(Math.abs(r.interval - 0.8) < 1e-9, 'no slow ramp-in');
  });

  test('measured: a later change past the tolerance is taken at once (a skill or buff landed)', () => {
    const r = nextAtkInterval(1, 0.6, true);
    assert.ok(Math.abs(r.interval - 0.6) < 1e-9);
    assert.equal(r.measured, true);
  });

  test('measured: only a sub-threshold wobble is smoothed', () => {
    const base = 1;
    const target = base * (1 + ATK_JUMP_TOLERANCE / 2);
    const r = nextAtkInterval(base, target, true);
    const want = base + (target - base) * ATK_DRIFT_SHARE;
    assert.ok(Math.abs(r.interval - want) < 1e-9, `${r.interval} vs ${want}`);
    assert.equal(r.measured, true);
  });

  test('a stall gap (hidden tab, reconnect) is never a rhythm', () => {
    for (const gap of [0, 0.01, 30, NaN, Infinity]) {
      assert.deepEqual(nextAtkInterval(1, gap, false), { interval: 1, measured: false }, String(gap));
    }
  });
});
