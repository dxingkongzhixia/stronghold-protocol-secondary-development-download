// 盟约效果的持续时间 (owner's rule, 2026-11-03): 300 s of a normal round, halved to 150 s in a boss / hidden field.
// Past the deadline the bond reads as inactive (bondTier 0) and the standing buffs it handed out carry that life, so
// nothing of the bond keeps running on a long boss fight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { bondEffectLife, bondTier, passiveBuff } from '../../server/sim/content/support/index.js';

test('the bond effect life is 300 s (normal) and 150 s (boss / hidden)', () => {
  assert.equal(bondEffectLife({ kind: 'normal' }), 300);
  assert.equal(bondEffectLife({ kind: 'unite' }), 300);
  assert.equal(bondEffectLife({ kind: 'boss' }), 150);
  assert.equal(bondEffectLife({ kind: 'hidden' }), 150);
});

test('a battle born past the deadline reads every bond as inactive, and its standing buffs expire with it', () => {
  const h = makeBattle({
    units: [{ uid: 1, diy: { slot: 'chess_char_6_diy1_a', charId: 'char_4247_oxi', skillIndex: 2, uniEquipId: null }, row: 10, col: 6 }],
    defs: { enemies: { e: enemyRec({ key: 'e', hp: 5e6, atk: 1, speed: 0, bat: 2 }) } },
    enemies: [{ key: 'e', pos: [10, 16] }],
    timeLimit: 20, autoFinish: false, seed: 3,
  });
  h.step();
  const b = h.b;
  const u = b.units.find((x) => x.kind === 'op' && x.side === 'ally');
  // a bond state of our own: the harvester reads it live
  const ps = b.getPlayer('p1');
  ps.bonds.yanShip = { count: 3, active: true, tier: 1, layers: 3 };
  assert.equal(b.bondUntil, b.time + 300 - 1 / 30, 'a normal battle gets 300 s (set at install, one tick in)');
  assert.ok(bondTier(b, 'p1', 'yanShip') >= 1, 'active while the effect lives');

  // 300 s later: nothing of the bond is left
  b.bondUntil = b.time + 1;
  passiveBuff(b, u, 'bond:test', { atk: 0.5 });
  assert.ok(u.findBuff('bond:test'), 'the standing buff exists');
  h.run(1.2);
  assert.equal(bondTier(b, 'p1', 'yanShip'), 0, 'inactive past the deadline');
  assert.equal(!!u.findBuff('bond:test'), false, 'its buff expired with the effect');
});
