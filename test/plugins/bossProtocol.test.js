import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBossProtocol, BOSS_PROTOCOL_LIMITS } from '../../shared/plugins/bossProtocol.js';

const FULL = {
  link: { enemy: 'enemy_1565_mpprme' },
  revive: { count: 3, atk: 100, hpReset: true, down: 8, shortenOnHit: { target: 'boss', seconds: 1, min: 3 } },
  clearProtocol: { at: 90, warning: 10, lp: 10, hiddenAt: 75, hiddenLp: 15 },
  dpRegen: { multiplier: 3, duration: 10 },
  deployLock: { count: 4, duration: 10, afterRevive: { count: 6, duration: 15 } },
  projectile: { cooldown: 12, damage: [2.4, 1], radius: [1.5, 0.45] },
  fly: { duration: 25, targets: 2, range: 3.5, intervalDelta: -0.5, hpLoss: 0.3, knockDownDamage: 0.15 },
  beam: { interval: 30, targets: 3, damageScale: 0.5, width: 1, windup: 3, interruptHp: 0.15 },
};

test('the full PRTS protocol normalises, applies defaults and keeps every field', () => {
  const { protocol, problems } = readBossProtocol(FULL);
  assert.deepEqual(problems, []);
  assert.deepEqual(protocol.link, { enemy: 'enemy_1565_mpprme', guard: true });
  assert.deepEqual(protocol.revive, { count: 3, atk: 100, hpReset: true, down: 8, shortenOnHit: { target: 'boss', seconds: 1, min: 3 } });
  assert.deepEqual(protocol.clearProtocol, { at: 90, warning: 10, lp: 10, hiddenAt: 75, hiddenLp: 15 });
  assert.deepEqual(protocol.dpRegen, { multiplier: 3, duration: 10 });
  assert.deepEqual(protocol.deployLock, { count: 4, duration: 10, afterRevive: { count: 6, duration: 15 } });
  assert.deepEqual(protocol.projectile, { cooldown: 12, damage: [2.4, 1], radius: [1.5, 0.45] });
  assert.deepEqual(protocol.fly, { duration: 25, targets: 2, range: 3.5, intervalDelta: -0.5, hpLoss: 0.3, knockDownDamage: 0.15 });
  assert.deepEqual(protocol.beam, { interval: 30, targets: 3, damageScale: 0.5, width: 1, windup: 3, interruptHp: 0.15 });
});

test('a link can replace the hard guard with an HP-ratio shield', () => {
  const { protocol, problems } = readBossProtocol({ link: { enemy: 'enemy_1565_mpprme', shieldRatio: 1 } });
  assert.deepEqual(problems, []);
  assert.deepEqual(protocol.link, { enemy: 'enemy_1565_mpprme', guard: true, shieldRatio: 1 });
});

test('defaults are conservative and a partial record needs only the fields it has', () => {
  const { protocol, problems } = readBossProtocol({ clearProtocol: {} });
  assert.deepEqual(problems, []);
  assert.deepEqual(protocol.clearProtocol, { at: 90, warning: 10, lp: 10 });
  assert.equal(protocol.link, undefined);
  assert.equal(readBossProtocol(undefined).protocol, null);
  assert.equal(readBossProtocol({}).protocol, null, 'an empty object has no protocol');
});

test('invalid values and unknown fields are reported and produce no protocol', () => {
  const cases = [
    { link: { enemy: 'not a valid id!' } },
    { link: { enemy: 'enemy_1', guard: 'yes' } },
    { link: { enemy: 'enemy_1', shieldRatio: -1 } },
    { revive: { count: BOSS_PROTOCOL_LIMITS.reviveCount + 1 } },
    { revive: { shortenOnHit: { seconds: 99 } } },
    { clearProtocol: { at: 1 } },
    { clearProtocol: { lp: 0 } },
    { deployLock: { count: 0 } },
    { projectile: { damage: [3] } },
    { projectile: { radius: [1] } },
    { fly: { targets: 9 } },
    { beam: { width: 0 } },
    { unknown: true },
  ];
  for (const bad of cases) {
    const { protocol, problems } = readBossProtocol(bad);
    assert.equal(protocol, null, JSON.stringify(bad));
    assert.ok(problems.length > 0, JSON.stringify(bad));
  }
});

test('a negative/over-large number never passes silently', () => {
  const { protocol, problems } = readBossProtocol({ revibe: { count: 3 } });
  assert.equal(protocol, null);
  assert.match(problems.join('\n'), /unknown field "revibe"/);
});
