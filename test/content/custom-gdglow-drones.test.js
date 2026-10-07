// test/content/custom-gdglow-drones.test.js — 澄闪 (char_377_gdglow, CUSTOM_CHESS in tools/build-data.mjs) 驭械术师 funnel.
//
// 驭械术师's 浮游单元 all FOCUS ONE locked enemy — the profession's installFunnel holds `unit.trait.funnelTarget`, switching
// only after that enemy dies — and each drone deals the operator's FULL ATK. The volley is therefore `attack.hits`, NOT
// `attack.maxTargets` (the wrong model: N attacks split across N different enemies). 浮游单元+N = N extra hits per attack:
// S1 火花四溅 / S2 电流翻涌 +1 ⇒ 2, S3 澄净闪耀 +2 ⇒ 3. That is how the official 驭械术师 works (reference
// 异格拉普兰德 / 荒芜拉普兰德: "浮游单元+1 = one more drone hit per attack"). Every hit leaves as the profession's 'drone'
// projectile (professions.js SUB.funnel + resolveProfile carve-out; render/style.js PROJ.drone). This also pins the
// default-S3 spec reading its OWN blackboard (`attack@cnt` 2 ⇒ 3 hits, `attack@sluggish` 0.5 ⇒ 停顿 on hit); it used to
// read a null blackboard (1 hit, no 停顿) and the data's generic 'bolt' used to override the funnel's 'drone' projectile.
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

/** 澄闪 on (10,4) facing right with `positions` dummies in her funnel range (default: 3 in range). */
function field(id, sid, positions = [[10, 6], [10, 7], [11, 6]], enemyOpts = {}) {
  const keys = positions.map((_, i) => `e${i + 1}`);
  return makeBattle({
    seed: 7, autoFinish: false, timeLimit: 120, captureNoisy: true, hooks: ['attack', 'statusApplied', 'damaged', 'kill'],
    units: [{ chessId: id, row: 10, col: 4, skillIndex: rec(id, sid).index, carryState: READY }],
    defs: { enemies: Object.fromEntries(keys.map((k) => [k, dummy(k, enemyOpts[k] ?? {})])) },
    enemies: positions.map(([r, c], i) => ({ key: keys[i], pos: [r, c] })),
  });
}

/** The skill's own damage instances (the drone volley), grouped by attackId → { targets, hits }. */
function volleys(h, u, t0) {
  const byAtk = new Map();
  for (const c of h.hooksOf('damaged')) {
    if (c.source !== u || c.t < t0 - 1e-9 || !c.dmg || !c.dmg.isAttack || !c.dmg.isSkill) continue;
    let e = byAtk.get(c.dmg.attackId);
    if (!e) byAtk.set(c.dmg.attackId, e = { targets: new Set(), hits: 0, total: 0 });
    e.targets.add(c.target.defId); e.hits++; e.total += c.amount;
  }
  return [...byAtk.values()];
}

test('澄闪 浮游单元 focus ONE locked enemy: S1/S2 ⇒ 2 hits, S3 ⇒ 3 hits per attack, all as drones', () => {
  for (const [sid, declared] of [['skchr_gdglow_1', 2], ['skchr_gdglow_2', 2], ['skchr_gdglow_3', 3]]) {
    for (const id of both('chess_char_377_gdglow')) {
      const h = field(id, sid);
      const u = h.unit(id);
      assert.equal(u.skill.id, sid, `${id} runs the selected skill`);
      assert.ok(h.runUntil(() => u.skill.active, 5), `${id} ${sid}: cast`);
      const t0 = h.b.time;
      h.run(5);
      const atks = h.hooksOf('attack').filter((c) => c.attacker === u && c.isSkill && c.t >= t0 - 1e-9);
      assert.ok(atks.length >= 2, `${id} ${sid}: ${atks.length} volleys`);
      // ONE locked target per attack — never 3 different targets
      for (const a of atks) assert.equal(a.targets.length, 1, `${id} ${sid}: attack locks exactly one enemy`);
      // the damage of every volley concentrates on that single enemy: ~declared hits, one victim, nothing split
      const vols = volleys(h, u, t0);
      assert.ok(vols.length >= 2, `${id} ${sid}: ${vols.length} damage volleys`);
      for (const v of vols) {
        assert.equal(v.targets.size, 1, `${id} ${sid}: a volley damages exactly one enemy`);
        assert.equal(v.hits, declared, `${id} ${sid}: ${declared} drone hits per volley`);
      }
      // everything the skill dealt landed on the lock — the other two enemies are untouched
      const perEnemy = {};
      for (const c of h.hooksOf('damaged')) if (c.source === u && c.dmg?.isSkill) perEnemy[c.target.defId] = (perEnemy[c.target.defId] ?? 0) + 1;
      assert.deepEqual(Object.keys(perEnemy), ['enemy_e1'], `${id} ${sid}: damage concentrated on the locked enemy`);
      // every funnel attack flies as the profession's 'drone' projectile (b.ev ['atk', shooter, target, vis])
      const shots = h.eventsOf('atk').filter((e) => e[1] === u.id);
      assert.ok(shots.length >= declared, `${id} ${sid}: shots captured`);
      assert.ok(shots.every((e) => e[3] === 'drone'), `${id} ${sid}: the funnel fires drones, not bolts`);
      done(h);
    }
  }
});

test('澄闪 浮游单元 lock switch: the drones focus the first enemy and only hit the next one after it dies', () => {
  for (const id of both('chess_char_377_gdglow')) {
    const h = field(id, 'skchr_gdglow_3', [[10, 6], [10, 7]], { e1: { hp: 2000 }, e2: { hp: 2000 } });
    const u = h.unit(id);
    assert.ok(h.runUntil(() => u.skill.active, 5), `${id}: cast`);
    h.run(20);
    const dealt = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isSkill);
    const order = dealt.map((c) => c.target.defId);
    assert.ok(order.includes('enemy_e1') && order.includes('enemy_e2'), `${id}: both enemies were eventually hit`);
    const firstE2 = order.indexOf('enemy_e2');
    assert.ok(order.slice(0, firstE2).every((k) => k === 'enemy_e1'), `${id}: only the locked enemy is hit before it dies`);
    assert.ok(order.slice(firstE2).every((k) => k === 'enemy_e2'), `${id}: the next enemy is hit only after the first is gone`);
    // the switch is a death: the first lock is killed before the first hit lands on the second enemy
    const kill = h.hooksOf('kill').find((c) => c.victim?.defId === 'enemy_e1' && c.killer === u);
    assert.ok(kill, `${id}: the first lock died`);
    assert.ok(kill.t <= dealt.find((c) => c.target.defId === 'enemy_e2').t + 1e-9, `${id}: the death releases the drones onto the next`);
    done(h);
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
