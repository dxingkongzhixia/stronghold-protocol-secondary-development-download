// test/content/custom-gdglow-drones.test.js — 澄闪 (char_377_gdglow, CUSTOM_CHESS in tools/build-data.mjs) 驭械术师 funnel.
//
// 「浮游单元+N」 is the number of simultaneous funnel attacks on top of the profession's base 1 — S1 火花四溅 / S2 电流翻涌
// +1 ⇒ 2, S3 澄净闪耀 +2 ⇒ 3 — and every attack leaves as the profession's 'drone' projectile
// (professions.js SUB.funnel + resolveProfile carve-out; render/style.js PROJ.drone). This pins the default-S3 spec reading
// its OWN blackboard (`attack@cnt` 2 ⇒ 3 drones, `attack@sluggish` 0.5 ⇒ 停顿 on hit); it used to read a null blackboard
// (1 drone, no 停顿) and the data's generic 'bolt' used to override the funnel's 'drone' projectile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';

const ds = getDefaultSource();
const raw = (id) => ds.rawChess(id);
const rec = (id, sid) => raw(id).skills.find((s) => s.skillId === sid);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, ...o });
const READY = { sp: 999 };
const both = (base) => [`${base}_a`, `${base}_b`];
const done = (h) => { checkInvariants(h.b); assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0])); };

/** 澄闪 on (10,4) facing right with 4 dummies in her base funnel range. */
function field(id, sid) {
  const keys = ['e1', 'e2', 'e3', 'e4'];
  return makeBattle({
    seed: 7, autoFinish: false, timeLimit: 120, captureNoisy: true, hooks: ['attack', 'statusApplied'],
    units: [{ chessId: id, row: 10, col: 4, skillIndex: rec(id, sid).index, carryState: READY }],
    defs: { enemies: Object.fromEntries(keys.map((k) => [k, dummy(k)])) },
    enemies: [{ key: 'e1', pos: [10, 6] }, { key: 'e2', pos: [10, 7] }, { key: 'e3', pos: [11, 6] }, { key: 'e4', pos: [11, 7] }],
  });
}

test('澄闪 浮游单元 count: S1/S2 +1 ⇒ 2, S3 +2 ⇒ 3 simultaneous funnel attacks, each the drone projectile', () => {
  for (const [sid, declared] of [['skchr_gdglow_1', 2], ['skchr_gdglow_2', 2], ['skchr_gdglow_3', 3]]) {
    for (const id of both('chess_char_377_gdglow')) {
      const h = field(id, sid);
      const u = h.unit(id);
      assert.equal(u.skill.id, sid, `${id} runs the selected skill`);
      assert.ok(h.runUntil(() => u.skill.active, 5), `${id} ${sid}: cast`);
      const t0 = h.b.time;
      h.run(4);
      const atks = h.hooksOf('attack').filter((c) => c.attacker === u && c.isSkill && c.t >= t0 - 1e-9);
      assert.ok(atks.length >= 2, `${id} ${sid}: ${atks.length} volleys`);
      for (const a of atks) assert.equal(a.targets.length, declared, `${id} ${sid}: ${declared} drones per attack`);
      // every funnel attack flies as the profession's 'drone' projectile (b.ev ['atk', shooter, target, vis])
      const shots = h.eventsOf('atk').filter((e) => e[1] === u.id);
      assert.ok(shots.length >= declared, `${id} ${sid}: shots captured`);
      assert.ok(shots.every((e) => e[3] === 'drone'), `${id} ${sid}: the funnel fires drones, not bolts`);
      done(h);
    }
  }
});

test('澄闪 S3 澄净闪耀: the default spec reads its own blackboard — 停顿 (sluggish) lands with its drone hits', () => {
  for (const id of both('chess_char_377_gdglow')) {
    const h = field(id, 'skchr_gdglow_3');
    const u = h.unit(id);
    assert.ok(h.runUntil(() => u.skill.active, 5), `${id}: cast`);
    h.run(2);
    const sluggish = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'sluggish');
    assert.ok(sluggish.length >= 1, `${id}: 停顿 applied by the S3 drones`);
    assert.equal(sluggish[0].duration, rec(id, 'skchr_gdglow_3').bb['attack@sluggish'], `${id}: the blackboard duration`);
    done(h);
  }
});
