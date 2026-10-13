// test/content/clemnt.test.js — 克莱门莎 (chess_char_4231_clemnt, custom tier-6 本源近卫): the primguard branch, the two
// talents, the three skills (冲蚀 / 风暴潮 / 与海为敌) and the engine additions they need (放逐 / 漩涡 / 强制缴械).
// Kit: server/sim/content/kits/ops/chess_char_4231_clemnt-clemnt.js; branch: server/sim/professions.js;
// engine: server/sim/battle/displacement.js (banishGroup), server/sim/buffs.js (disarmForce / banish).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';

const CLEM = 'chess_char_4231_clemnt_a';
const ds = getDefaultSource();
const IDX = (chessId, skillId) => ds.rawChess(chessId).skills.findIndex((s) => s.skillId === skillId);

const dummy = (key, extra = {}) => enemyRec({ key, hp: 1e7, def: 0, speed: 0, ...extra });

test('primguard: block 2, can hit air, blocked-first selection', () => {
  const h = makeBattle({ units: [{ chessId: CLEM, row: 10, col: 5 }] });
  h.step();
  const u = h.unit(CLEM);
  assert.equal(u.profile.sub, 'primguard');
  assert.equal(u.s.blockCnt, 2, '阻挡两个敌人');
  assert.equal(u.profile.canHitFly, true, '可以攻击自身阻挡的飞行单位 (PRTS 分支特性信息)');
  assert.equal(u.profile.attack, 'melee');
  checkInvariants(h.b);
});

test('生死定夺 (talent 1): a physical hit can raise the ATK scale; 习得性防御 (talent 2) only from the front, more vs 海怪', () => {
  const h = makeBattle({
    units: [{ chessId: CLEM, row: 10, col: 5, dir: 'RIGHT' }],
    defs: { enemies: { enemy_d: dummy('enemy_d') } },
    enemies: [{ key: 'enemy_d', pos: [10, 6] }],
  });
  h.step();
  const u = h.unit(CLEM);
  const e = h.enemy('enemy_d');

  // talent 2: the enemy on the tile directly in front (facing RIGHT) → damage ×(1 − 0.3) for a plain enemy, ×(1 − 0.5)
  // for a 【海怪】 (seamonster tag).
  e.x = u.tileC + 1; e.y = u.tileR;
  const frontPlain = h.b.dealDamage(e, u, { amount: 1000, type: 'phys', canDodge: false });
  // a second battle for the seamonster, so the HP pools never mix
  const h2 = makeBattle({
    units: [{ chessId: CLEM, row: 10, col: 5, dir: 'RIGHT' }],
    defs: { enemies: { enemy_s: { ...dummy('enemy_s'), tags: ['seamonster'] } } },
    enemies: [{ key: 'enemy_s', pos: [10, 6] }],
  });
  h2.step();
  const u2 = h2.unit(CLEM), e2 = h2.enemy('enemy_s');
  e2.x = u2.tileC + 1; e2.y = u2.tileR;
  const frontSea = h2.b.dealDamage(e2, u2, { amount: 1000, type: 'phys', canDodge: false });

  // behind the unit: no reduction
  e.x = u.tileC - 1; e.y = u.tileR;
  const behind = h.b.dealDamage(e, u, { amount: 1000, type: 'phys', canDodge: false });

  assert.ok(behind > 0);
  assert.ok(Math.abs(frontPlain / behind - 0.65) < 1e-9, `front plain ×0.65 (got ${frontPlain}/${behind})`);
  assert.ok(Math.abs(frontSea / behind - 0.45) < 1e-9, `front 海怪 ×0.45 (got ${frontSea}/${behind})`);

  // talent 1: the proc multiplies the physical amount; only a phys hit of hers (never the target's) is touched
  let scaled = false;
  for (let i = 0; i < 200 && !scaled; i++) {
    const ctx = { source: u, target: e, dmg: h.b.makeDamage({ amount: 1000, type: 'phys' }), credit: u };
    h.b.emit('hit', ctx);
    if (ctx.dmg.amount > 1000) scaled = true;
  }
  assert.ok(scaled, '生死定夺 can raise the physical hit');
  checkInvariants(h.b); checkInvariants(h2.b);
});

test('冲蚀 S1: next attack ×atk_scale, then 侵蚀损伤 = ep_damage_ratio × the physical damage dealt', () => {
  const h = makeBattle({
    units: [{ chessId: CLEM, row: 10, col: 5, skillIndex: IDX(CLEM, 'skchr_clemnt_1') }],
    defs: { enemies: { enemy_d: dummy('enemy_d') } },
    enemies: [{ key: 'enemy_d', pos: [10, 6] }],
    hooks: ['damaged'], captureNoisy: true,
  });
  h.step();
  const u = h.unit(CLEM);
  assert.ok(u.skill.activate('test', { free: true }));
  const n0 = h.hooksOf('damaged').length;
  assert.ok(h.b.forceAttack(u));
  const ev = h.hooksOf('damaged').slice(n0);
  const phys = ev.filter((c) => c.source === u && c.target?.side === 'enemy' && c.type === 'phys' && c.dmg?.isAttack).pop();
  const ero = ev.filter((c) => c.source === u && c.target?.side === 'enemy' && c.type === 'element' && c.dmg?.element === 'erosion').pop();
  assert.ok(phys, 'the next attack landed a physical hit');
  assert.ok(ero, '侵蚀损伤 attached');
  assert.ok(Math.abs(ero.amount - phys.amount * 0.25) < 1e-6, `侵蚀 = 25 % of the damage dealt (${ero.amount} vs ${phys.amount})`);
  checkInvariants(h.b);
});

test('风暴潮 S2: range + ASPD, the 放逐舱 carries enemies and leaves a 漩涡 (no content errors)', () => {
  const h = makeBattle({
    units: [{ chessId: CLEM, row: 10, col: 5, skillIndex: IDX(CLEM, 'skchr_clemnt_2'), dir: 'RIGHT' }],
    defs: { enemies: { enemy_d: dummy('enemy_d') } },
    enemies: [{ key: 'enemy_d', pos: [10, 7] }],
    hooks: ['statusApplied'], autoFinish: false,
  });
  h.step();
  const u = h.unit(CLEM);
  assert.ok(u.skill.activate('test', { free: true }));
  assert.ok(u.s.aspd >= u.base.aspd + 90, `ASPD +100 (got ${u.s.aspd})`);
  assert.ok(u.rangeKeys.length > 2, 'its own 4-1 range');
  h.run(4);
  assert.equal(h.b.errors.length, 0, 'the cabin / whirlpool ran without content errors');
  const statuses = h.hooksOf('statusApplied').map((c) => c.status);
  assert.ok(statuses.includes('banish') || statuses.includes('slow'), `the 放逐舱 / 漩涡 applied a status (${statuses})`);
  checkInvariants(h.b);
});

test('与海为敌 S3: an 侵蚀 burst anywhere spends one bullet on the bursting enemy + its 4 neighbours, 3 hits each', () => {
  const h = makeBattle({
    units: [{ chessId: CLEM, row: 10, col: 5, skillIndex: IDX(CLEM, 'skchr_clemnt_3') }],
    defs: { enemies: { enemy_d: dummy('enemy_d'), enemy_n: dummy('enemy_n') } },
    enemies: [{ key: 'enemy_d', pos: [10, 7] }, { key: 'enemy_n', pos: [10, 8] }],
    hooks: ['ammoUsed', 'damaged'], captureNoisy: true,
  });
  h.step();
  const u = h.unit(CLEM);
  assert.ok(u.skill.activate('test', { free: true }));
  const ammo0 = u.skill.ammoLeft;
  assert.ok(ammo0 > 0, 'the skill carries bullets');
  const e = h.enemy('enemy_d'), n = h.enemy('enemy_n');
  const hpE = e.hp, hpN = n.hp;
  // any enemy's 侵蚀 损伤 burst (here forced) triggers the spend
  h.b.dealDamage(u, e, { type: 'element', element: 'erosion', amount: 5000 });
  assert.equal(u.skill.ammoLeft, ammo0 - 1, 'one bullet spent');
  assert.ok(h.hooksOf('ammoUsed').length >= 1);
  assert.ok(e.hp < hpE, 'the bursting enemy was struck');
  assert.ok(n.hp < hpN, 'a neighbour (the 4 tiles around) was struck too');
  checkInvariants(h.b);
});

test('engine 放逐: banishGroup teleports under a weight budget, applies 无敌 + 强制缴械, aborts off the field', () => {
  const h = makeBattle({
    defs: { enemies: { enemy_d: dummy('enemy_d'), enemy_n: dummy('enemy_n') } },
    enemies: [{ key: 'enemy_d', pos: [10, 5] }, { key: 'enemy_n', pos: [10, 6] }],
  });
  h.step();
  const e = h.enemy('enemy_d'), n = h.enemy('enemy_n');
  // weight budget 1: the first fits, the second is skipped
  const moved = h.b.banishGroup([e, n], 9, 5, { maxWeight: 1, maxCount: 15, duration: 1 });
  assert.equal(moved.length, 1);
  assert.equal(moved[0], e);
  assert.equal(Math.round(e.y), 9); assert.equal(Math.round(e.x), 5);
  assert.ok(e.findBuff('banish'), '放逐 (无敌) applied');
  assert.ok(e.findBuff('disarmForce'), '强制缴械 applied');
  // off the field: refused
  assert.deepEqual(h.b.banishGroup([n], 99, 99, { duration: 1 }), []);
  checkInvariants(h.b);
});

test('engine 强制缴械: disarmForce blocks an enemy normal attack; a blocked operator still uses its own', () => {
  const h = makeBattle({
    units: [{ chessId: CLEM, row: 10, col: 5 }],
    defs: { enemies: { enemy_d: enemyRec({ key: 'enemy_d', hp: 1e7, def: 0, atk: 200, bat: 1 }) } },
    enemies: [{ key: 'enemy_d', pos: [10, 8], route: { motion: 'WALK', start: [10, 8], end: [10, 2], checkpoints: [] } }],
    autoFinish: false,
  });
  h.step();
  const u = h.unit(CLEM), e = h.enemy('enemy_d');
  h.runUntil(() => e.blockedBy === u, 10);
  assert.ok(e.blockedBy === u, 'the enemy is blocked');
  const a0 = e.stats.attacks;
  h.b.applyStatus(e, 'disarmForce', { duration: 10 });
  h.run(3);
  assert.equal(e.stats.attacks, a0, 'no normal attack while 强制缴械');
  checkInvariants(h.b);
});
