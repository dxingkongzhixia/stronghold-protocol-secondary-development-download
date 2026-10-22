// Generic boss protocol runtime: the linked guard, the mimic's down/revive cycle and the clear-protocol timer
// (docs/PRTS-SOURCE-CODE.md §3). The contract itself is covered by test/plugins/bossProtocol.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, chessRec } from '../helpers/battleHarness.js';

const BOSS = 'enemy_protocol_boss';
const MIMIC = 'enemy_protocol_mimic';

const protocol = (o = {}) => ({
  link: { enemy: MIMIC, guard: true },
  revive: { count: 3, atk: 100, hpReset: true, down: 8, shortenOnHit: { seconds: 2, min: 3 } },
  clearProtocol: { at: 90, warning: 10, lp: 10 },
  ...o,
});

function battle({ p = protocol(), bossSpeed = 0, mimicSpeed = 0, autoFinish = true, timeLimit = 60, allyCols = null } = {}) {
  const boss = { ...enemyRec({ key: BOSS, hp: 50000, atk: 1000, speed: bossSpeed }), protocol: p, rank: 'BOSS' };
  const mimic = enemyRec({ key: MIMIC, hp: 25000, atk: 600, speed: mimicSpeed });
  const units = allyCols ? allyCols.map((col, i) => ({ chessId: 'test_beam', row: 10, col, uid: i + 1 })) : undefined;
  const defs = { enemies: { [BOSS]: boss, [MIMIC]: mimic } };
  if (units) defs.chess = { test_beam: chessRec({ id: 'test_beam', stats: { maxHp: 1e6, atk: 0 } }) };
  const h = makeBattle({
    units,
    enemies: [{ key: BOSS, time: 0, pos: [10, 6] }, { key: MIMIC, time: 0, pos: [10, 10] }],
    defs,
    autoFinish,
    timeLimit,
  });
  h.run(0.1);
  return h;
}

const guard = (h, e) => e.buffs.some((b) => b.key === 'protocol:guard');
const down = (e) => e.buffs.some((b) => b.key === 'protocol:down');
const kill = (h, e) => h.b.loseHp(e, 1e9);

test('protocol.ui publishes the live boss HUD through the battle plugin view', () => {
  const h = battle({ p: protocol({ ui: { id: 'demo-boss', revivesLabel: '重构', clearLabel: '清除' } }), autoFinish: false, timeLimit: 12 });
  const view = h.b.snapshot().pluginView['demo-boss'];
  assert.equal(view.hud.boss[0].type, 'text');
  assert.match(view.hud.boss[0].text, /3\/3/);
  assert.equal(view.hud.boss[1].type, 'countdown');
  h.run(1);
  assert.ok(h.b.snapshot().pluginView['demo-boss'].hud.boss.some((b) => b.type === 'countdown'));
});

test('protocol events name the plugin-owned PRTS / mimic effect prefabs', () => {
  const h = battle({ p: protocol({ clearProtocol: { at: 10, warning: 0.5, lp: 10 } }), autoFinish: false, timeLimit: 12 });
  const keys = () => h.eventsOf('fx').filter((e) => e[1] === 'plugin').map((e) => e[4]?.skill);
  const mimic = h.b.enemies.find((e) => e.defId === MIMIC);
  kill(h, mimic);
  h.step(1);
  assert.ok(keys().includes('plugin:prts-source-code:enemy_mpprme_buff_01'), 'down');
  h.run(9.6);
  assert.ok(keys().includes('plugin:prts-source-code:enemy_mpprts_buff_02'), 'clear warning');
});

test('the linked mimic guards the boss while alive, then revives it three times', () => {
  const h = battle();
  const boss = h.b.enemies.find((e) => e.defId === BOSS);
  const mimic = h.b.enemies.find((e) => e.defId === MIMIC);
  assert.ok(boss && mimic, 'both spawned');
  assert.equal(guard(h, boss), true, 'boss untargetable while the mimic lives');
  assert.ok(mimic.mem.ab.list.some((a) => a.killed), 'the mimic got the link ability');
  const view = h.b.snapshot().protocol;
  assert.equal(view.revivesLeft, 3);
  assert.equal(view.revivesMax, 3);
  assert.equal(view.clearIn, 89.9);

  const atk0 = mimic.s.atk;
  for (let i = 1; i <= 3; i++) {
    kill(h, mimic);
    h.step(1);
    assert.equal(mimic.alive, true, `revive ${i}: still on the field`);
    assert.equal(down(mimic), true, `revive ${i}: down window`);
    assert.equal(h.b.snapshot().protocol.down, true, `revive ${i}: the HUD says down`);
    assert.equal(h.b.snapshot().protocol.revivesLeft, 3 - i);
    assert.equal(guard(h, boss), false, `revive ${i}: the boss is targetable`);
    h.run(8.2);
    assert.equal(down(mimic), false, `revive ${i}: back up`);
    assert.equal(guard(h, boss), true, `revive ${i}: the boss is guarded again`);
    assert.equal(mimic.s.atk, atk0 + 100 * i, `revive ${i}: attack grows`);
  }

  kill(h, mimic);
  h.step(2);
  assert.equal(mimic.alive, false, 'the fourth knock-out is final');
  assert.equal(guard(h, boss), false, 'the boss stays targetable');
});

test('damage to the boss during the down window shortens the revive, never below the floor', () => {
  const h = battle();
  const boss = h.b.enemies.find((e) => e.defId === BOSS);
  const mimic = h.b.enemies.find((e) => e.defId === MIMIC);
  const shorten = [];
  h.b.on('protocolShorten', (c) => shorten.push(c));
  kill(h, mimic);
  h.step(1);
  const t0 = h.b.time;
  h.b.dealDamage(null, boss, { amount: 100, type: 'true' });
  h.run(1);
  assert.equal(shorten.length, 1, 'the hit shortened the timer');
  assert.ok(h.b.time - t0 < 7, 'not the full 8 s down window');
  h.run(5.2);
  assert.equal(down(mimic), false, 'revived earlier');
  // the floor: repeated hits cannot take it below `min` (3 s) from the knock-out
  kill(h, mimic);
  h.step(1);
  const t1 = h.b.time;
  for (let i = 0; i < 10; i++) h.b.dealDamage(null, boss, { amount: 100, type: 'true' });
  h.step(1);
  assert.equal(down(mimic), true, 'the floor holds after many hits');
  h.run(3.2);
  assert.equal(down(mimic), false, 'revived at about the 3 s floor');
  assert.ok(h.b.time - t1 < 3.4, 'not the full 8 s down window');
});

test('the clear protocol warns, then records the LP loss once', () => {
  const h = battle({ p: protocol({ clearProtocol: { at: 10, warning: 0.5, lp: 10 } }), autoFinish: false, timeLimit: 12 });
  const warnings = [];
  const clears = [];
  h.b.on('protocolWarning', (c) => warnings.push(c));
  h.b.on('protocolClear', (c) => clears.push(c));
  h.run(9.6);
  assert.equal(warnings.length, 1, 'one warning');
  assert.equal(clears.length, 0, 'not yet');
  h.run(0.6);
  assert.equal(clears.length, 1, 'cleared once');
  h.runToEnd(10);
  assert.equal(h.b.result().lpLoss, 10, 'the result carries the team LP loss');
});

test('a knock-down raises DP regeneration for the configured window', () => {
  const h = battle({ p: protocol({ clearProtocol: undefined, dpRegen: { multiplier: 3, duration: 10 } }) });
  const mimic = h.b.enemies.find((e) => e.defId === MIMIC);
  const ps = h.b.players[0];
  const before = ps.dp;
  kill(h, mimic);
  h.run(10.5);
  assert.ok(ps.dp - before > 25, `DP rose by ${ps.dp - before} (base + doubled)`);
});

test('the decay projectile damages the nearest operator and shrinks on the way', () => {
  const boss = {
    ...enemyRec({ key: BOSS, hp: 50000, atk: 1000, speed: 0 }),
    protocol: protocol({ clearProtocol: undefined, projectile: { cooldown: 1, damage: [2.4, 1], radius: [1.5, 0.45] } }),
    rank: 'BOSS',
  };
  const h = makeBattle({
    units: [{ chessId: 'test_guard', row: 10, col: 10 }],
    enemies: [{ key: BOSS, time: 0, pos: [10, 8] }],
    defs: { chess: { test_guard: chessRec({ id: 'test_guard', stats: { maxHp: 1e6, atk: 0 } }) }, enemies: { [BOSS]: boss } },
    autoFinish: false,
    timeLimit: 3,
    hooks: ['damaged'],
  });
  const ally = h.unit('test_guard');
  const hits = [];
  h.b.on('protocolProjectile', (c) => hits.push(c));
  h.run(1.6);
  assert.ok(hits.length >= 1, 'the orb landed');
  assert.ok(ally.hp < ally.s.maxHp, 'the operator took damage');
  assert.ok(hits[0].damage >= 1000 && hits[0].damage <= 2400, `decayed from 2.4x ATK (${hits[0].damage})`);
});

test('the chain-reaction beam unlocks after the first revive and hits the line', () => {
  const p = protocol({
    clearProtocol: undefined,
    revive: { count: 1, atk: 0, down: 1 },
    beam: { interval: 1, targets: 3, damageScale: 0.5, width: 1, windup: 0.2, interruptHp: 0.15 },
  });
  const h = battle({ p, allyCols: [9, 8, 7] });
  const mimic = h.b.enemies.find((e) => e.defId === MIMIC);
  const hits = [];
  h.b.on('protocolBeam', (c) => hits.push(c));
  kill(h, mimic);
  h.run(1.3); // down 1 s, first revive
  h.run(1.1); // first beam
  assert.ok(hits.length >= 1, 'the beam fired after the revive');
  assert.ok(h.b.allies().some((a) => a.hp < a.s.maxHp), 'the line hit an operator');
});

test('damage to the mimic interrupts the beam wind-up', () => {
  const p = protocol({
    clearProtocol: undefined,
    revive: { count: 1, atk: 0, down: 1 },
    beam: { interval: 1, targets: 3, damageScale: 0.5, width: 1, windup: 2, interruptHp: 0.15 },
  });
  const h = battle({ p, allyCols: [9, 8, 7] });
  const mimic = h.b.enemies.find((e) => e.defId === MIMIC);
  const beams = [];
  const interrupts = [];
  h.b.on('protocolBeam', (c) => beams.push(c));
  h.b.on('protocolBeamInterrupt', (c) => interrupts.push(c));
  kill(h, mimic);
  h.run(1.3);
  h.run(1.1); // wind-up starts
  h.b.dealDamage(null, mimic, { amount: 0.15 * mimic.s.maxHp, type: 'true' });
  h.run(2.5);
  assert.equal(interrupts.length, 1, 'the wind-up was interrupted');
  assert.equal(beams.length, 0, 'no beam landed');
});

test('the first revive unlocks the fly window and enough damage lands it early', () => {
  const p = protocol({
    clearProtocol: undefined,
    revive: { count: 1, atk: 0, down: 1 },
    fly: { duration: 25, targets: 2, range: 2, intervalDelta: -0.5, hpLoss: 0.3, knockDownDamage: 0.15 },
  });
  const h = battle({ p });
  const mimic = h.b.enemies.find((e) => e.defId === MIMIC);
  const ends = [];
  h.b.on('protocolFlyEnd', (c) => ends.push(c));
  const range0 = mimic.base.rangeRadius;
  kill(h, mimic);
  h.run(1.3);
  assert.ok(mimic.buffs.some((b) => b.key === 'protocol:fly'), 'the mimic flies after the first revive');
  assert.equal(mimic.base.rangeRadius, range0 + 2, 'mimic range +2');
  assert.equal(mimic.s.maxTargets, 1, 'the mimic gains one extra target');

  h.b.dealDamage(null, mimic, { amount: mimic.s.maxHp * 0.3, type: 'true' });
  h.run(0.1);
  assert.equal(ends.length, 1);
  assert.equal(ends[0].early, true, 'the mimic landed early');
  assert.equal(mimic.base.rangeRadius, range0, 'mimic range restored');
  assert.equal(mimic.buffs.some((b) => b.key === 'protocol:fly'), false, 'fly buff gone');
});

test('deploy-lock events fire on appearance and after the first revive', () => {
  const p = protocol({
    clearProtocol: undefined,
    revive: { count: 1, atk: 0, down: 1 },
    deployLock: { count: 4, duration: 10, afterRevive: { count: 6, duration: 15 } },
  });
  const locks = [];
  const h = makeBattle({
    enemies: [{ key: BOSS, time: 0, pos: [10, 6] }, { key: MIMIC, time: 0, pos: [10, 10] }],
    defs: { enemies: { [BOSS]: { ...enemyRec({ key: BOSS, hp: 50000, speed: 0 }), protocol: p }, [MIMIC]: enemyRec({ key: MIMIC, hp: 25000, speed: 0 }) } },
    autoFinish: false,
    timeLimit: 20,
    setup: (b) => b.on('protocolDeployLock', (c) => locks.push(c)),
  });
  h.run(0.1);
  assert.equal(locks.length, 1, 'the appearance lock');
  assert.equal(locks[0].count, 4);
  assert.equal(locks[0].afterRevive, false);
  const mimic = h.b.enemies.find((e) => e.defId === MIMIC);
  h.b.loseHp(mimic, 1e9);
  h.run(1.4);
  assert.equal(locks.length, 2, 'the after-revive lock');
  assert.equal(locks[1].count, 6);
  assert.equal(locks[1].duration, 15);
  assert.equal(locks[1].afterRevive, true);
});

test('the clear protocol charges every player on the field', () => {
  const boss = { ...enemyRec({ key: BOSS, hp: 50000, speed: 0 }), protocol: protocol({ clearProtocol: { at: 10, warning: 0.5, lp: 10 } }), rank: 'BOSS' };
  const mimic = enemyRec({ key: MIMIC, hp: 25000, speed: 0 });
  const h = makeBattle({
    players: [
      { playerId: 'p1', seat: 0, side: 'L', colOffset: 0, units: [], bonds: {}, playerEffects: [] },
      { playerId: 'p2', seat: 1, side: 'R', colOffset: 8, units: [], bonds: {}, playerEffects: [] },
    ],
    enemies: [{ key: BOSS, time: 0, pos: [10, 6] }, { key: MIMIC, time: 0, pos: [10, 10] }],
    defs: { enemies: { [BOSS]: boss, [MIMIC]: mimic } },
    autoFinish: false,
    timeLimit: 12,
  });
  let clear = null;
  h.b.on('protocolClear', (c) => { clear = c; });
  h.run(10.5);
  assert.equal(clear?.players, 2);
  assert.equal(clear?.perPlayer, 10);
  h.runToEnd(5);
  assert.equal(h.b.result().lpLoss, 20, 'two players × 10 LP');
});

test('the hidden variant uses hiddenAt / hiddenLp', () => {
  const boss = {
    ...enemyRec({ key: BOSS, hp: 50000, speed: 0 }),
    protocol: protocol({ clearProtocol: { at: 90, warning: 1, lp: 10, hiddenAt: 10, hiddenLp: 15 } }),
    rank: 'BOSS',
  };
  const h = makeBattle({
    kind: 'hidden',
    enemies: [{ key: BOSS, time: 0, pos: [3, 6] }, { key: MIMIC, time: 0, pos: [3, 9] }],
    defs: { enemies: { [BOSS]: boss, [MIMIC]: enemyRec({ key: MIMIC, hp: 25000, speed: 0 }) } },
    autoFinish: false,
    timeLimit: 12,
  });
  let clear = null;
  h.b.on('protocolClear', (c) => { clear = c; });
  h.run(10.5);
  assert.equal(clear?.lp, 15, 'hidden LP');
  h.runToEnd(5);
  assert.equal(h.b.result().lpLoss, 15);
});

test('killing the boss cancels its clear protocol, and a missing link does not guard forever', () => {
  const h = battle({ p: protocol({ clearProtocol: { at: 10, warning: 0.5, lp: 10 } }), autoFinish: false, timeLimit: 12 });
  const boss = h.b.enemies.find((e) => e.defId === BOSS);
  const clears = [];
  h.b.on('protocolClear', (c) => clears.push(c));
  h.b.loseHp(boss, 1e9);
  h.run(10.5);
  assert.equal(clears.length, 0, 'the timer was cancelled');
  h.runToEnd(10);
  assert.equal(h.b.result().lpLoss ?? 0, 0);

  // no mimic in the wave: the boss becomes targetable after the grace period
  const n = makeBattle({
    enemies: [{ key: BOSS, time: 0, pos: [10, 8] }],
    defs: { enemies: { [BOSS]: { ...enemyRec({ key: BOSS, hp: 50000, speed: 0 }), protocol: protocol() } } },
    autoFinish: false,
    timeLimit: 10,
  });
  n.run(0.1);
  const b2 = n.b.enemies.find((e) => e.defId === BOSS);
  assert.equal(guard(n, b2), true, 'guarded while the link may still spawn');
  n.run(6);
  assert.equal(guard(n, b2), false, 'the grace period gave up the guard');
});
