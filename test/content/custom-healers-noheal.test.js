// test/content/custom-healers-noheal.test.js — the shared heal-selection rule (Battle.healTargetable) and the heals of
// our CUSTOM_CHESS operators that heal others: 结城理's 俄耳甫斯 support-form aura (S3's second <替身>) and 凯尔希·思衡托's
// S2 医疗单元 burst (test/content/chess_kalts2.test.js). 予愿安洁莉娜's 天穹间的舞步 gives an hpRegen *attribute* (no heal:
// 禁疗 / 无法被友方治疗 do not stop it — PRTS 异常效果 禁疗), 阿斯卡纶's 生命复苏 and the rest are self-heals: no ally
// selection to audit. The rule: never a 禁疗 (healFree) / 无法被友方治疗 (noHeal / profile.noHeal) ally, unless the healer's
// profile `healThrough` names it (凯尔希's Mon3tr); a 孤立 one is not selectable either.
// Run: node --test test/content/custom-healers-noheal.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';

const ds = getDefaultSource();
const IDX = (id, skillId) => ds.rawChess(id).skills.find((s) => s.skillId === skillId).index;
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e7, speed: 0, def: 0, res: 0, ...o });
const YAK = 'chess_char_1_02_a', TEXAS = 'chess_char_1_08_a', UTAGE = 'chess_char_1_18_a', PERFUMER = 'chess_char_2_14_a';
const done = (h) => { assert.deepEqual(h.b.errors.map((e) => `${e.label} ${e.message}`), []); checkInvariants(h.b); };

test('Battle.healTargetable: the shared heal-selection rule (禁疗 / 无法被友方治疗 / 孤立 out, healThrough in)', () => {
  const h = makeBattle({
    defs: { enemies: { enemy_d: dummy('enemy_d') } }, timeLimit: 60, autoFinish: false, seed: 3,
    units: [{ chessId: YAK, row: 10, col: 4 }, { chessId: TEXAS, row: 10, col: 5 }, { chessId: UTAGE, row: 11, col: 5 }],
  });
  h.step();
  const healer = h.unit(1), free = h.unit(2), musha = h.unit(3);
  assert.equal(h.b.healTargetable(healer, free), true, 'an ordinary ally');
  assert.equal(h.b.healTargetable(healer, healer), true, 'a self-heal');
  h.b.addBuff(free, { key: 'test:hf', flags: { healFree: true }, persist: true });
  assert.equal(h.b.healTargetable(healer, free), false, '禁疗 (healFree): not a heal target');
  assert.equal(free.profile.noHeal, false, '(healFree only, no profile.noHeal)');
  // profile.noHeal (无法被友方治疗: 武者) is refused, and healThrough does NOT beat it (only the *flag* half is reachable)
  assert.equal(musha.profile.noHeal, true, '宴 is 武者');
  healer.profile.healThrough = (_healer, a) => a === musha;
  assert.equal(h.b.healTargetable(healer, musha), false, 'healThrough does not beat a profile noHeal');
  // the *flag* half: a flag-only noHeal ally named by healThrough IS selectable (凯尔希's Mon3tr), a healFree one too
  h.b.removeBuff(free, 'test:hf');
  h.b.addBuff(free, { key: 'test:nh', flags: { noHeal: true, healFree: true }, persist: true });
  healer.profile.healThrough = (_healer, a) => a === free;
  assert.equal(h.b.healTargetable(healer, free), true, 'healThrough names the flag-only 禁疗 ally');
  // 孤立 is never selectable, healThrough or not
  h.b.addBuff(musha, { key: 'test:iso', flags: { isolated: true }, persist: true });
  healer.profile.healThrough = (_healer, a) => a === musha;
  assert.equal(h.b.healTargetable(healer, musha), false, '孤立: not selectable');
  done(h);
});

test('结城理 俄耳甫斯 (S3 second <替身>) heals the ordinary injured allies, never a 禁疗 or 武者 ally; the unhealable ones do not eat the 3 heal slots; the dodge buff still reaches them', () => {
  // 5 allies around him: the three unhealable ones at the LOWEST HP ratios, then two ordinary ones. The aura heals up to
  // 3 (`attack@max_target_heal` 3), so a selection that took the three lowest would spend every slot on allies no heal
  // can reach — the two ordinary ones (higher HP) prove the shared selection skips them.
  const h = makeBattle({
    defs: { enemies: { enemy_d: dummy('enemy_d') } }, timeLimit: 60, autoFinish: false, seed: 3,
    hooks: ['heal', 'attack', 'damaged'], captureNoisy: true,
    units: [
      { chessId: 'chess_char_4217_makoto_a', row: 10, col: 4, skillIndex: IDX('chess_char_4217_makoto_a', 'skchr_makoto_3') },
      { chessId: YAK, row: 11, col: 5 }, { chessId: PERFUMER, row: 9, col: 5 },
      { chessId: TEXAS, row: 11, col: 4 }, { chessId: UTAGE, row: 10, col: 6 }, { chessId: YAK, row: 9, col: 4 },
    ],
    enemies: [{ key: 'enemy_d', pos: [10, 5] }],
  });
  h.step();
  const u = h.unit('chess_char_4217_makoto_a');
  const ord1 = h.unit(2), ord2 = h.unit(3), free1 = h.unit(4), musha = h.unit(5), free2 = h.unit(6);
  h.b.addBuff(free1, { key: 'test:hf1', flags: { healFree: true }, persist: true });
  h.b.addBuff(free2, { key: 'test:hf2', flags: { healFree: true }, persist: true });
  assert.ok(free1.s.flags.healFree && !free1.profile.noHeal, '禁疗 ally 1');
  assert.ok(musha.profile.noHeal, '宴 (武者)');
  ord1.hp = ord1.s.maxHp * 0.30; ord2.hp = ord2.s.maxHp * 0.40;
  free1.hp = free1.s.maxHp * 0.10; musha.hp = musha.s.maxHp * 0.12; free2.hp = free2.s.maxHp * 0.15;
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.activations >= 1, 4), 'S3 cast');
  // the second persona is the 俄耳甫斯 support form (the persona state is `trait.dollNo`; driving it past the first
  // knock-out needs the whole doll chain, so the test sets it like the render test does)
  h.run(1);
  u.trait.dollNo = 2;
  h.run(3);
  assert.ok(u.findBuff('makoto:orpheus'), '俄耳甫斯 out');
  const heals = h.hooksOf('heal').filter((c) => c.source === u && !c.opts?.regen);
  assert.ok(heals.some((c) => c.target === ord1) && heals.some((c) => c.target === ord2), 'both ordinary injured allies are healed');
  const unh = new Set([free1, musha, free2]);
  assert.ok(heals.every((c) => !unh.has(c.target)), 'no heal reaches a 禁疗 / 武者 ally');
  // the dodge is a buff, not a heal: the 禁疗 / 无法被友方治疗 allies still get it
  assert.ok(free1.findBuff('makoto:orpheusDodge') && musha.findBuff('makoto:orpheusDodge') && free2.findBuff('makoto:orpheusDodge'), 'every ally around still dodges');
  done(h);
});
