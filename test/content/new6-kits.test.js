// The 2026-11-01 six-star additions (塔露拉 / 冻河 / 国度): each DIY pick loads its own official kit and fights a few
// seconds without content errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { FX_BINDINGS } from '../../public/js/render/vfx/skills.js';

const picks = [
  ['char_4247_oxi', '塔露拉', 2],
  ['char_4244_tocka', '冻河', 2],
  ['char_4246_dminon', '国度', 2],
  ['char_4182_oblvns', '丰川祥子', 2],
];
const walker = () => enemyRec({ key: 'e_walk', hp: 4000, atk: 300, speed: 0.8, bat: 1.5 });

test('塔露拉 S2: TAKE_DAMAGE trigger with 5 charges (official 触发方式)', () => {
  const h = makeBattle({
    units: [{ uid: 1, diy: { slot: 'chess_char_6_diy1_a', charId: 'char_4247_oxi', skillIndex: 1, uniEquipId: null }, row: 10, col: 6 }],
    defs: { enemies: { e_hit: enemyRec({ key: 'e_hit', hp: 50000, atk: 300, range: 1.5, bat: 1 }) } },
    enemies: [{ key: 'e_hit', pos: [10, 7] }],
    timeLimit: 20, autoFinish: false, seed: 3,
  });
  h.step();
  const u = h.b.units.find((x) => x.kind === 'op' && x.side === 'ally');
  assert.equal(u.skill.maxCharges, 5, 'five charges');
  assert.equal(u.skill.rule, 'TAKE_DAMAGE', 'only a hit triggers it');
  const before = u.skill.activations;
  assert.ok(h.runUntil(() => u.skill.activations > before, 10), 'activates after taking a hit');
  assert.ok(u.skill.activations <= 5, 'charges capped at five');
});

test('2026-11-01 6★: each DIY pick runs its own hand-authored kit in a real battle', () => {
  for (const [charId, name, skillIndex] of picks) {
    const h = makeBattle({
      units: [{ uid: 1, diy: { slot: 'chess_char_6_diy1_a', charId, skillIndex, uniEquipId: null }, row: 10, col: 6 }],
      defs: { enemies: { e_walk: walker() } },
      enemies: [{ key: 'e_walk', route: 0, count: 3, interval: 3 }],
      timeLimit: 30, autoFinish: false, seed: 3,
    });
    h.step();
    const u = h.b.units.find((x) => x.kind === 'op' && x.side === 'ally');
    assert.ok(u, `${name}: fielded`);
    assert.equal(u.def.charId, charId, `${name}: charId`);
    assert.ok(u.kit && !u.kit.generic, `${name}: own kit`);
    h.run(15);
    assert.equal(h.b.errorCount ?? 0, 0, `${name}: ${JSON.stringify(h.b.errors?.slice(0, 3))}`);
  }
});

test('冻河 S1: placing a mark emits the official mark fx on the marked ally', () => {
  const h = makeBattle({
    units: [
      { uid: 1, diy: { slot: 'chess_char_6_diy1_a', charId: 'char_4244_tocka', skillIndex: 0, uniEquipId: null }, row: 10, col: 6 },
      { uid: 2, diy: { slot: 'chess_char_6_diy2_a', charId: 'char_4182_oblvns', skillIndex: 0, uniEquipId: null }, row: 10, col: 7 },
    ],
    defs: { enemies: { e_walk: enemyRec({ key: 'e_walk', hp: 50000, atk: 300, speed: 0.8, bat: 1.5 }) } },
    enemies: [{ key: 'e_walk', pos: [10, 8] }],
    timeLimit: 25, autoFinish: false, seed: 3,
  });
  h.step();
  const u = h.b.units.find((x) => x.kind === 'op' && x.def?.charId === 'char_4244_tocka');
  u.skill.sp = u.skill.spCost;
  assert.ok(h.runUntil(() => h.eventsOf('fx').some((e) => e[1] === 'mark'), 15), 'the mark fx fires');
  const ev = h.eventsOf('fx').find((e) => e[1] === 'mark');
  const ally = h.b.units.find((x) => x.id === ev[4].target);
  assert.ok(ally && ally.side === 'ally' && ally !== u, 'on another ally');
  assert.equal(ev[4].id, u.id, 'owned by 冻河');
  assert.ok(ally.findBuff('trigger:effect'), 'and the mark itself is on that ally');
  // The mark is reported as a status: the client's status loops (EXTRA_STATUS_LOOPS) draw the official buff aura rows.
  const on = h.eventsOf('status').find((e) => e[1] === ally.id && e[2] === 'tocka_s1_mark');
  assert.equal(on?.[3], 1, 'the mark status goes on');
  h.b.removeBuff(ally, 'trigger:effect');
  h.step();
  const off = h.eventsOf('status').find((e) => e[1] === ally.id && e[2] === 'tocka_s1_mark' && e[3] === 0);
  assert.ok(off, 'and off when the mark is consumed');
});

test('the trigger and stance kit fx are bound to their official prefabs', () => {
  assert.deepEqual(FX_BINDINGS.skchr_tocka_1.mark.keys, ['tocka_skill_01_buff_02_start_01']);
  assert.equal(FX_BINDINGS.skchr_tocka_1.mark.at, 'target');
  assert.deepEqual(FX_BINDINGS.skchr_oxi_2.stance.keys, ['oxi_skill_02_hit_01']);
  assert.equal(FX_BINDINGS.skchr_oxi_2.stance.at, 'target');
});

test('冻河 S1: element gauge fills do not fire the mark, physical damage does (official damageMask ELEMENT)', () => {
  const h = makeBattle({
    units: [
      { uid: 1, diy: { slot: 'chess_char_6_diy1_a', charId: 'char_4244_tocka', skillIndex: 0, uniEquipId: null }, row: 10, col: 6 },
      { uid: 2, diy: { slot: 'chess_char_6_diy2_a', charId: 'char_4182_oblvns', skillIndex: 0, uniEquipId: null }, row: 10, col: 7 },
    ],
    defs: { enemies: { e: enemyRec({ key: 'e', hp: 50000, atk: 1, speed: 0, bat: 5 }) } },
    enemies: [{ key: 'e', pos: [10, 8] }],
    timeLimit: 30, autoFinish: false, seed: 3,
  });
  h.step();
  const u = h.b.units.find((x) => x.kind === 'op' && x.def?.charId === 'char_4244_tocka');
  const ally = h.b.units.find((x) => x.kind === 'op' && x.def?.charId === 'char_4182_oblvns');
  const foe = h.b.units.find((x) => x.kind === 'enemy');
  u.skill.sp = u.skill.spCost;
  assert.ok(h.runUntil(() => ally.findBuff('trigger:effect'), 15), 'S1 marks the ally');
  h.b.dealDamage(foe, ally, { amount: 10, type: 'element', element: 'burn' });
  assert.ok(ally.findBuff('trigger:effect'), 'an element gauge fill keeps the mark');
  h.b.dealDamage(foe, ally, { amount: 10, type: 'phys' });
  assert.ok(!ally.findBuff('trigger:effect'), 'a physical hit fires it');
  assert.ok(ally.findBuff('tocka:shield'), 'the shield is there');
});

test('丰川祥子: damage fills the Fever gauge; a joined Fever lasts 22 s and S3 withdraws into the downed state', () => {
  const h = makeBattle({
    units: [{ uid: 1, diy: { slot: 'chess_char_6_diy1_a', charId: 'char_4182_oblvns', skillIndex: 2, uniEquipId: null }, row: 10, col: 6 }],
    defs: { enemies: { e: enemyRec({ key: 'e', hp: 1e9, atk: 1, speed: 0, bat: 2 }) } },
    enemies: [{ key: 'e', pos: [10, 9] }],
    timeLimit: 90, autoFinish: false, seed: 3,
  });
  h.step();
  const u = h.b.units.find((x) => x.kind === 'op' && x.side === 'ally');
  assert.equal(u.skill.id, 'skchr_oblvns_3', 'S3 selected');
  assert.equal(h.b.feverState(), 'stop');
  h.b.addFever(u, 3);
  assert.equal(h.b.feverPoints(u), 3, 'the talent points accumulate');
  assert.equal(h.b.addFever(u, 97), true, 'the gauge fills and she joins Fever');
  assert.equal(h.b.inFever(u), true);
  assert.equal(h.b.feverState(), 'mid', '1–4 members: mid');
  u.skill.sp = u.skill.spCost;
  assert.ok(h.runUntil(() => u.skill.active, 10), 'S3 on');
  h.run(22.2);
  assert.equal(h.b.inFever(u), false, 'Fever ran its 22 s');
  assert.equal(u.alive, false, 'she withdrew');
  assert.equal(u.removeReason, 'fever');
  assert.ok(h.b.isDown(u), 'and lies knocked down on her tile');
});
