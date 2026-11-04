// The designs borrowed from upstream's 2026-11 additions (冻河 / 国度 / 塔露拉), implemented on our engine:
//   * 触发型效果 marks: one per (caster, kind), so different kinds coexist; transfer moves only the asked kind
//   * cast window: a MANUAL skill casts like an AUTO one while CAST_AUTO_BUFF lasts (冻河 S2 「期间技能变为自动开启」)
//   * 场 (domains): a shared tile set per caster, union across casters, pruned with its source (国度)
//   * onLeave: the state captured as the unit leaves; a knock-out settles 0.7 s later, a retreat at once (国度 T2)
//   * shot records: what a ranged attack does is decided at launch, applied on impact (冻河 T2)
//   * injury-stage guard: the hit that casts 塔露拉 S2 is reduced by `damage_remaining_scale` before the shelter is up
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';
import { CAST_AUTO_BUFF } from '../../server/sim/constants.js';
import { tileKeyOf } from '../../server/sim/battle/domains.js';
import { queueShot, takeShot } from '../../server/sim/content/kits/shared/shotRecord.js';

const DIY = (charId, skillIndex = 0, o = {}) => ({ uid: 1, diy: { slot: 'chess_char_6_diy1_a', charId, skillIndex, uniEquipId: null }, row: 10, col: 6, ...o });
const inert = (id) => chessRec({ id, skill: null, stats: { maxHp: 1e7, atk: 0, def: 0, blockCnt: 0 } });
const foe = (key, o = {}) => enemyRec({ key, hp: 1e7, atk: 0, speed: 0, ...o });

test('trigger marks: one per (caster, kind); different kinds coexist; transfer and consume take only that kind', () => {
  const h = makeBattle({
    units: [{ chessId: 'a', row: 10, col: 5 }, { chessId: 'b', row: 11, col: 5 }, { chessId: 'c', row: 9, col: 5 }],
    defs: { chess: { a: inert('a'), b: inert('b'), c: inert('c') } }, enemies: [], timeLimit: 30, autoFinish: false, seed: 3,
  });
  h.step();
  const [a, b, c] = ['a', 'b', 'c'].map((id) => h.unit(id));
  assert.equal(h.b.applyTrigger(a, b, { kind: 's1' }), true);
  assert.equal(h.b.applyTrigger(a, b, { kind: 's1' }), false, 'this caster already holds that kind');
  assert.equal(h.b.applyTrigger(a, b, { kind: 's2' }), true, 'another kind of the same caster coexists');
  assert.equal(h.b.applyTrigger(c, b, { kind: 's1' }), true, 'another caster of the same kind coexists');
  assert.equal(b.buffs.filter((x) => x.key === 'trigger:effect').length, 3);
  assert.equal(h.b.ownerTrigger(b, a, 's2')?.data.kind, 's2');
  assert.equal(h.b.transferTrigger(b, c, a, 's2'), true, 'moves only the asked kind');
  assert.equal(h.b.ownerTrigger(b, a, 's2'), null);
  assert.equal(h.b.ownerTrigger(c, a, 's2')?.data.kind, 's2');
  assert.deepEqual(h.b.consumeTrigger(b, 's1', c), { kind: 's1' }, 'the caster-specific mark is consumed');
  assert.equal(h.b.ownerTrigger(b, a, 's1')?.data.kind, 's1', 'the other caster\'s S1 stays');
});

test('domains: a shared tile set per caster, union across casters, pruned with its source', () => {
  const h = makeBattle({
    units: [{ chessId: 'a', row: 10, col: 5 }, { chessId: 'b', row: 11, col: 5 }],
    defs: { chess: { a: inert('a'), b: inert('b') } }, enemies: [], timeLimit: 30, autoFinish: false, seed: 3,
  });
  h.step();
  const a = h.unit('a'), b = h.unit('b');
  const ka = tileKeyOf(a), kb = tileKeyOf(b);
  assert.notEqual(ka, kb);
  h.b.setDomain(a, [ka, 999]);
  h.b.setDomain(b, [kb, 999]);
  assert.deepEqual([...h.b.domainTiles()].sort((x, y) => x - y), [ka, kb, 999].sort((x, y) => x - y), 'the union of both fields');
  assert.equal(h.b.domainHas(kb), true);
  assert.equal(h.b.unitOnDomain(a), true, 'a stands on the union');
  h.b.clearDomain(a);
  assert.deepEqual([...h.b.domainTiles()].sort((x, y) => x - y), [kb, 999].sort((x, y) => x - y), 'his own part is gone');
  h.b.kill(b, null);
  assert.equal(h.b.domainTiles().size, 0, 'a dead source\'s field is pruned');
});

test('cast window: a MANUAL skill casts like an AUTO one while CAST_AUTO_BUFF lasts', () => {
  const h = makeBattle({
    units: [{ chessId: 't', row: 10, col: 5, skillIndex: 0 }],
    defs: { chess: { t: chessRec({ id: 't', skill: { skillId: 'sk_test', skillType: 'MANUAL', durationType: 'NONE', duration: 0, spType: 'INCREASE_WITH_TIME', spCost: 10, initSp: 0, trigger: { rule: 'SP_FULL' }, bb: {} }, stats: { maxHp: 1e7, atk: 0, blockCnt: 0 } }) } },
    enemies: [], timeLimit: 30, autoFinish: false, seed: 3,
  });
  h.step();
  const u = h.unit('t');
  assert.equal(u.skill.manual, true);
  u.skill.opReadyAt = -Infinity;
  u.skill.sp = 10;
  assert.ok(h.runUntil(() => u.skill.activations >= 1, 1), 'casts once');
  u.skill.sp = 10;
  h.run(1);
  assert.equal(u.skill.activations, 1, 'the 3 s operation cooldown holds a MANUAL skill');
  // the window is the only way a MANUAL skill skips that cooldown while it lasts
  u.skill.opReadyAt = h.b.time + 3;
  u.skill.sp = 10;
  h.b.addBuff(u, { key: CAST_AUTO_BUFF, duration: 1 });
  assert.ok(h.runUntil(() => u.skill.activations >= 2, 1), 'the window lifts the operation cooldown');
});

test('冻河 S2: no enemy in reach → the mark waits; with one it fires, grants ASPD and opens the cast window', () => {
  const h = makeBattle({
    units: [DIY('char_4244_tocka', 1), { chessId: 'mate', row: 10, col: 8, skillIndex: 0 }],
    defs: {
      chess: { mate: chessRec({ id: 'mate', skill: { skillId: 'sk_test', skillType: 'MANUAL', durationType: 'NONE', duration: 0, spType: 'INCREASE_WITH_TIME', spCost: 10, initSp: 0, trigger: { rule: 'DEFAULT' }, bb: {} }, stats: { maxHp: 1e7, atk: 0, blockCnt: 0 }, rangeGrid: [[0, 0], [0, 1], [0, -1]] }) },
      enemies: { e: foe('e') },
    },
    enemies: [], timeLimit: 40, autoFinish: false, seed: 3,
  });
  h.step();
  const u = h.b.units.find((x) => x.kind === 'op' && x.side === 'ally' && x.def?.charId === 'char_4244_tocka');
  const mate = h.unit('mate');
  assert.ok(u, 'tocka fielded');
  mate.skill.sp = mate.skill.spCost;      // ready, but its operation cooldown is still running
  mate.skill.opReadyAt = h.b.time + 3;
  h.b.applyTrigger(u, mate, { kind: 'skchr_tocka_2' }); // her S2 mark, placed directly (the S2 cast itself is covered elsewhere)
  h.run(1);
  assert.equal(mate.hasBuff('tocka:s2aspd'), false, 'no enemy in the holder\'s range: the mark waits');
  assert.equal(mate.skill.activations, 0, 'and the skill has no target either');
  h.spawn('e', { pos: [10, 9] });
  assert.ok(h.runUntil(() => mate.hasBuff('tocka:s2aspd'), 2), 'an enemy in reach fires the mark');
  assert.ok(mate.findBuff(CAST_AUTO_BUFF), 'and opens its cast window');
  assert.equal(mate.hasBuff('trigger:effect'), false, 'the S2 mark is consumed');
  // the window, not the 3 s operation cooldown, decides now
  mate.skill.sp = mate.skill.spCost;
  mate.skill.opReadyAt = h.b.time + 3;
  const n = mate.skill.activations;
  assert.ok(h.runUntil(() => mate.skill.activations > n, 1), 'the window lifts the operation cooldown');
});

test('shot records: the launch decides, the impact applies, one record per (attackId, target)', () => {
  const u = { mem: {} };
  const t1 = { id: 1 }, t2 = { id: 2 };
  queueShot(u, 7, t1, { burst: true });
  queueShot(u, 7, t2, { burst: false });
  queueShot(u, 8, t1, { burst: true });
  assert.deepEqual(takeShot(u, 7, t1), { burst: true }, 'the first arrow\'s own decision');
  assert.deepEqual(takeShot(u, 8, t1), { burst: true }, 'the second arrow keeps its own');
  assert.deepEqual(takeShot(u, 7, t2), { burst: false });
  assert.equal(takeShot(u, 7, t1), null, 'each record is taken once');
});

test('国度 T2: a knock-out settles 0.7 s later with the cached ATK, a retreat at once', () => {
  const setup = (leave, { buff = false } = {}) => {
    const h = makeBattle({
      units: [DIY('char_4246_dminon', 0), { chessId: 'bait', row: 10, col: 4 }, { chessId: 'bait2', row: 12, col: 5 }],
      defs: { chess: { bait: inert('bait'), bait2: inert('bait2') }, enemies: { e: foe('e') } },
      enemies: [{ key: 'e', pos: [10, 8] }], timeLimit: 60, autoFinish: false, seed: 3, hooks: ['damaged'], captureNoisy: true,
    });
    h.step();
    const u = h.b.units.find((x) => x.kind === 'op' && x.side === 'ally' && x.def?.charId === 'char_4246_dminon');
    const e = h.b.enemies[0];
    // the snapshot must use the ATK he had as he left, not the stats of a dead unit: a +100 % buff proves it
    if (buff) h.b.addBuff(u, { key: 'test:atk', duration: 60, mods: { atkPct: 1 } });
    h.run(1.2);
    const leaveHits = () => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e && (c.dmg?.tags || []).includes('dminon:leave'));
    assert.equal(leaveHits().length, 0, 'the talent has not fired yet');
    leave(h, u);
    return { h, u, e, leaveHits };
  };
  const ko = setup((h, u) => h.b.kill(u, null), { buff: true });
  assert.equal(ko.leaveHits().length, 0, 'nothing at the knock-out');
  ko.h.run(0.6);
  assert.equal(ko.leaveHits().length, 0, 'still nothing before 0.7 s');
  assert.ok(ko.h.runUntil(() => ko.leaveHits().length > 0, 1), 'the talent fires after the delay');
  assert.ok(ko.e.findBuff('stun'), 'and stuns it');
  const plain = setup((h, u) => h.b.kill(u, null));
  plain.h.run(1);
  assert.ok(plain.leaveHits().length > 0, 'the unbuffed run settles too');
  assert.ok(Math.abs(ko.leaveHits()[0].amount / plain.leaveHits()[0].amount - 2) <= 1e-6, 'the cached (buffed) ATK is used');

  const rt = setup((h, u) => h.b.retreat(u));
  rt.h.run(0.1);
  assert.equal(rt.leaveHits().length, 1, 'a retreat settles at once');
});

test('国度 S2: physical / arts damage on an enemy standing on “国度” cannot be dodged', () => {
  const h = makeBattle({
    units: [DIY('char_4246_dminon', 1), { chessId: 'hit', row: 10, col: 4 }],
    defs: {
      chess: { hit: chessRec({ id: 'hit', stats: { maxHp: 1e7, atk: 500, blockCnt: 0 }, rangeGrid: [[0, 0]] }) },
      enemies: { e: foe('e') },
    },
    enemies: [{ key: 'e', pos: [10, 8] }], timeLimit: 60, autoFinish: false, seed: 3, captureNoisy: true, hooks: ['hit'],
  });
  h.step();
  const u = h.b.units.find((x) => x.kind === 'op' && x.side === 'ally' && x.def?.charId === 'char_4246_dminon');
  const a = h.unit('hit'), e = h.b.enemies[0];
  h.b.addBuff(e, { key: 'test:dodge', duration: 999, mods: { dodgePhys: 1, dodgeArts: 1 } });
  const dmg = () => { const before = e.hp; h.b.dealDamage(a, e, { amount: 100, type: 'phys', canDodge: true }); return before - e.hp; };
  assert.equal(dmg(), 0, '100 % dodge outside the skill');
  u.skill.sp = u.skill.spCost;
  u.skill.opReadyAt = -Infinity;
  assert.ok(h.runUntil(() => u.skill.active, 2), 'S2 runs');
  assert.ok(dmg() > 0, 'on the country the dodge is off (the `hit` stage sets canDodge false)');
  assert.ok(h.hooksOf('hit').some((c) => c.target === e && c.dmg.canDodge === false), 'the mask is visible at the hit stage');
});

test('塔露拉 S2: the hit that casts it is reduced by damage_remaining_scale before the shelter is up', () => {
  const h = makeBattle({
    units: [DIY('char_4247_oxi', 1)],
    defs: { enemies: { e_hit: enemyRec({ key: 'e_hit', hp: 50000, atk: 300, range: 1.5, bat: 1 }) } },
    enemies: [{ key: 'e_hit', pos: [10, 7] }], timeLimit: 30, autoFinish: false, seed: 3, captureNoisy: true, hooks: ['hit'],
  });
  h.step();
  const u = h.b.units.find((x) => x.kind === 'op' && x.side === 'ally');
  assert.equal(u.skill.id, 'skchr_oxi_2');
  u.skill.sp = u.skill.spCost;
  u.skill.opReadyAt = -Infinity;
  assert.ok(h.runUntil(() => u.skill.activations > 0, 10), 'the first hit casts S2');
  const guarded = h.hooksOf('hit').filter((c) => c.target === u && c.dmg.guarded);
  assert.ok(guarded.length >= 1, 'the triggering instance is marked');
  assert.equal(guarded[0].dmg.mul, 0.1, 'and takes the skill\'s own damage_remaining_scale');
});

test('冻河 T2: an empowered attack applies the shot its launch recorded (area weakness)', () => {
  const h = makeBattle({
    units: [DIY('char_4244_tocka', 0), { chessId: 'mate', row: 10, col: 8 }],
    defs: { chess: { mate: inert('mate') }, enemies: { e: foe('e') } },
    enemies: [], timeLimit: 40, autoFinish: false, seed: 3,
  });
  h.step();
  const u = h.b.units.find((x) => x.kind === 'op' && x.side === 'ally' && x.def?.charId === 'char_4244_tocka');
  const mate = h.unit('mate');
  h.b.applyTrigger(u, mate, { kind: 'skchr_tocka_1' });
  h.b.dealDamage(mate, mate, { amount: 10, type: 'phys' }); // fires the S1 mark → the next attack is empowered
  assert.equal(u.mem.tockaEmpower, true, 'the mark fired');
  const e = h.spawn('e', { pos: [10, 7] });
  assert.ok(h.runUntil(() => e.findBuff('tocka:weak'), 6), 'the arrow lands with the area weakness');
  assert.equal(u.mem.tockaEmpower, false, 'the launch consumed the empowerment');
});
