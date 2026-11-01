// test/sim/waves.test.js — the engine's wave projectiles (server/sim/battle/waves.js): 塔露拉 S3's 簇火 detonate on the
// first enemy they touch. The reach is the perpendicular distance to the travelled segment (no axis-aligned box) and the
// collision is swept (a fast wave cannot skip an enemy between two ticks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { BattleWaves } from '../../server/sim/battle/waves.js';

test('the swept segment returns the closest point projection, clamped', () => {
  assert.equal(BattleWaves._segT(0, 0, 10, 0, 5, 3), 0.5);
  assert.equal(BattleWaves._segT(0, 0, 10, 0, -5, 3), 0);
  assert.equal(BattleWaves._segT(0, 0, 10, 0, 15, 3), 1);
  assert.equal(BattleWaves._segT(2, 2, 2, 2, 5, 5), 0, 'a zero-length step');
});

function waveBattle(pos, speed = 2.3) {
  const h = makeBattle({
    units: [{ uid: 1, chessId: 'chess_char_4244_tocka_a', row: 10, col: 5 }],
    defs: { enemies: { e: enemyRec({ key: 'e', hp: 50000, atk: 1, speed: 0, bat: 5 }) } },
    enemies: [{ key: 'e', pos }],
    timeLimit: 30, autoFinish: false, seed: 3,
  });
  h.step();
  const owner = h.b.units.find((u) => u.kind === 'op' && u.side === 'ally');
  const foe = h.b.units.find((u) => u.kind === 'enemy');
  return { h, owner, foe, speed };
}

test('a fast wave hits the enemy it sweeps through (no tunnelling between ticks)', () => {
  // 20 tiles/s ⇒ 2 tiles per 0.1 s tick: per-tick tile squares at x 7 and 9 would both miss an enemy at x 8.
  const { h, owner, foe } = waveBattle([10, 8]);
  const hp = foe.hp;
  h.b.spawnWave({ owner, x: 5, y: 10, dr: 0, dc: 1, speed: 20, distance: 10, hitWidth: 0.5, blastRadius: 0.6, damage: 100, type: 'arts' });
  h.run(1);
  assert.ok(foe.hp < hp, `the wave hit (hp ${foe.hp} of ${hp})`);
});

test('a wave misses an enemy outside the perpendicular reach', () => {
  const { h, owner, foe } = waveBattle([13, 8]);   // 3 rows away from the lane at row 10
  const hp = foe.hp;
  h.b.spawnWave({ owner, x: 5, y: 10, dr: 0, dc: 1, speed: 20, distance: 10, hitWidth: 0.5, blastRadius: 0.6, damage: 100, type: 'arts' });
  h.run(1);
  assert.equal(foe.hp, hp, 'untouched');
});

test('the blast damages every enemy within the radius of the contact point', () => {
  const h = makeBattle({
    units: [{ uid: 1, chessId: 'chess_char_4244_tocka_a', row: 10, col: 5 }],
    defs: { enemies: { e: enemyRec({ key: 'e', hp: 50000, atk: 1, speed: 0, bat: 5 }) } },
    enemies: [{ key: 'e', pos: [10, 8], count: 2 }],
    timeLimit: 30, autoFinish: false, seed: 3,
  });
  h.step();
  const owner = h.b.units.find((u) => u.kind === 'op' && u.side === 'ally');
  const foes = h.b.units.filter((u) => u.kind === 'enemy');
  const hp = foes.map((e) => e.hp);
  h.b.spawnWave({ owner, x: 5, y: 10, dr: 0, dc: 1, speed: 20, distance: 10, hitWidth: 0.5, blastRadius: 1.5, damage: 100, type: 'arts' });
  h.run(1);
  assert.ok(foes.every((e, i) => e.hp < hp[i]), 'both in the blast');
});
