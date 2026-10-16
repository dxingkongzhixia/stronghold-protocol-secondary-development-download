// OUR difficulty layer (owner 2026-10-16 — docs/BALANCE.md §8, docs/MATCHMAKING.md §47): enemies from round 5 on get
// +30 % HP / ATK, every leader +40 % (the shared pool and its own ATK / DEF / RES, parts and mid-fight summons too).
// The official tables stay the BASE and data/tuning.json `boost` carries the factors (switch off with `enabled:false`).
// The files that pin the OFFICIAL numbers run on withoutTuning(DATA) — test/match/{waves,balance,finalAssault,boss-hp-scaling}.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameData, boostOf } from '../../server/match/gamedata.js';
import { setupMatchWaves, buildBossWave } from '../../server/match/waves.js';
import { bossPoolHp } from '../../server/match/finalAssault.js';
import { createRng } from '../../server/sim/rng.js';
import {
  BOOST_FROM_ROUND, ENEMY_BOOST_HP, ENEMY_BOOST_ATK, BOSS_BOOST_HP, BOSS_BOOST_ATK, BOSS_BOOST_DEF, BOSS_BOOST_RES,
} from '../../shared/constants.js';
import { DATA } from './harness.js';
import { withoutTuning } from '../../tools/balance.mjs';

const OFFICIAL = withoutTuning(DATA);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test('boostOf: the block, its defaults, the off switch and the all-ones case', () => {
  assert.equal(boostOf(undefined), null);
  assert.equal(boostOf({ enabled: false }), null);
  assert.equal(boostOf({ enemy: { hp: 1, atk: 1 }, boss: { hp: 1, atk: 1, def: 1, res: 1 } }), null, 'all 1 = official');
  assert.deepEqual(boostOf({}), {
    fromRound: BOOST_FROM_ROUND,
    enemy: { hp: ENEMY_BOOST_HP, atk: ENEMY_BOOST_ATK },
    boss: { hp: BOSS_BOOST_HP, atk: BOSS_BOOST_ATK, def: BOSS_BOOST_DEF, res: BOSS_BOOST_RES },
  });
  const p = boostOf({ fromRound: 7, enemy: { hp: 2 }, boss: { def: 1.5 } });
  assert.equal(p.fromRound, 7);
  assert.deepEqual(p.enemy, { hp: 2, atk: ENEMY_BOOST_ATK });
  assert.deepEqual(p.boss, { hp: BOSS_BOOST_HP, atk: BOSS_BOOST_ATK, def: 1.5, res: BOSS_BOOST_RES });
});

test('enemies: +30 % HP / ATK from round 5, official below it, DEF / RES / speed untouched', () => {
  const m = new GameData(DATA, 'mode_multi_hard');
  for (const r of [1, 2, 3, 4]) {
    assert.equal(m.enemyBoost(r), null, `R${r} off`);
    assert.deepEqual(m.enemyScale(r), m.baseEnemyScale(r), `R${r} = the official table`);
  }
  for (const r of [5, 9, 14]) {
    const base = m.baseEnemyScale(r);
    assert.deepEqual(m.enemyBoost(r), { hp: ENEMY_BOOST_HP, atk: ENEMY_BOOST_ATK }, `R${r}`);
    const s = m.enemyScale(r);
    near(s.hpMul, base.hpMul * ENEMY_BOOST_HP, `R${r} hp`);
    near(s.atkMul, base.atkMul * ENEMY_BOOST_ATK, `R${r} atk`);
    assert.equal(s.speedMul, base.speedMul, `R${r} speed untouched`);
    assert.equal(s.defMul, undefined, 'a normal enemy gets no DEF key');
    assert.equal(s.resMul, undefined, 'a normal enemy gets no RES key');
  }
});

test('the 8 formal modes boost; 入门协议 (inScope false) and `enabled:false` stay official', () => {
  for (const id of Object.keys(DATA.config.modes)) {
    const m = new GameData(DATA, id);
    if (DATA.config.modes[id].inScope === false) {
      assert.equal(m.enemyBoost(9), null, id);
      assert.equal(m.bossBoost(), null, id);
      assert.equal(m.bossHpMul('boss_1'), 1, id);
    } else {
      assert.deepEqual(m.enemyBoost(9), { hp: ENEMY_BOOST_HP, atk: ENEMY_BOOST_ATK }, id);
      assert.ok(m.bossBoost(), id);
    }
  }
  const off = new GameData({ ...DATA, tuning: { ...DATA.tuning, boost: { enabled: false } } }, 'mode_multi_hard');
  assert.deepEqual(off.enemyScale(9), off.baseEnemyScale(9));
  assert.equal(off.bossHpMul('boss_1'), 1);
  assert.deepEqual(off.bossEnemyScale(9), off.baseEnemyScale(9));
});

test('leaders: the leader scale is the official round table ×1.4 HP / ATK plus DEF / RES', () => {
  const m = new GameData(DATA, 'mode_multi_hard');
  assert.equal(m.bossHpMul('boss_1'), BOSS_BOOST_HP);
  const base = m.baseEnemyScale(14);
  const b = m.bossEnemyScale(14);
  near(b.hpMul, base.hpMul * BOSS_BOOST_HP, 'leader hp');
  near(b.atkMul, base.atkMul * BOSS_BOOST_ATK, 'leader atk');
  assert.equal(b.defMul, BOSS_BOOST_DEF);
  assert.equal(b.resMul, BOSS_BOOST_RES);
});

test('the wave builder hands tag-boss / tag-part spawns the leader scale (HP for a part, never the leader)', () => {
  const m = new GameData(DATA, 'mode_multi_hard');
  const rng = createRng(11);
  const wave = buildBossWave(m, rng, setupMatchWaves(m, rng).factions, 14, { bossId: 'boss_1', solo: false });
  const b = m.bossEnemyScale(14);
  const leader = wave.spawns.find((s) => s.tag === 'boss');
  assert.ok(leader, 'a tag-boss spawn');
  near(leader.mods.atkMul, b.atkMul, 'leader atk');
  assert.equal(leader.mods.defMul, BOSS_BOOST_DEF);
  assert.equal(leader.mods.resMul, BOSS_BOOST_RES);
  assert.equal(leader.mods.hpMul, undefined, 'the leader HP is the shared pool, never a spawn mod');
  const part = wave.spawns.find((s) => s.tag === 'part');
  if (part) {
    near(part.mods.hpMul, b.hpMul, 'a part takes the leader HP too');
    assert.equal(part.mods.defMul, BOSS_BOOST_DEF);
  }
  // the round's plain enemies keep the ENEMY scale (×1.3, no DEF / RES)
  const plain = wave.spawns.find((s) => s.tag !== 'boss' && s.tag !== 'part');
  if (plain) {
    assert.notEqual(plain.mods.hpMul, b.hpMul, 'a plain enemy is not on the leader scale');
    assert.equal(plain.mods.defMul, undefined);
  }
});

test('the shared pool is the official pool ×1.4, per boss and per alive count', () => {
  const on = new GameData(DATA, 'mode_multi_hard');
  const off = new GameData(OFFICIAL, 'mode_multi_hard');
  for (const bossId of ['boss_1', 'boss_5', 'boss_8', 'boss_10']) {
    for (const alive of [1, 2, 4]) {
      const official = bossPoolHp(off, bossId, alive);
      const ours = bossPoolHp(on, bossId, alive);
      assert.equal(on.bossHpMul(bossId), BOSS_BOOST_HP, bossId);
      assert.ok(Math.abs(ours / official - BOSS_BOOST_HP) < 0.01, `${bossId} ×${alive}: ${ours} / ${official}`);
    }
  }
});
