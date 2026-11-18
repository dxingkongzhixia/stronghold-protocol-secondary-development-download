// test/versions-bosses.test.js — the act3 bosses (boss_11–17, server/sim/content/bosses.js kitFnC / kitSpider / kitEel /
// kitDyjsfg): the enemy keys are in BOSS_KITS and their core mechanics act on a version battle — 械 summons its units,
// 蛛 dodges as its HP drops, 电 adds neural damage, 矩兽 reduces damage, tramples, overloads and empties the field on death.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from '../server/sim/simdata.js';
import { setGameData } from '../server/sim/content/support/index.js';
import { BOSS_KEYS } from '../server/sim/content/bosses.js';
import { makeBattle } from './helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const ACT3 = Object.fromEntries(fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => [path.basename(f, '.json'), JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))]));
const ds = new DataSource(ACT3);
const buffs = (u, key) => u.buffs.filter((b) => b.key === key);

after(() => setGameData(null));

function field(bossKey, extra = {}) {
  setGameData(ACT3);
  return makeBattle({
    data: ds, seed: 11, autoFinish: false,
    units: [{ chessId: 'chess_char_1_02_a', row: 9, col: 6 }],
    enemies: [{ key: bossKey, time: 0, pos: [6, 6] }],
    ...extra,
  });
}

test('the act3 boss keys are registered', () => {
  for (const k of ['enemy_9029_acfnc', 'enemy_9029_acfnc_2', 'enemy_9035_acspider', 'enemy_9035_acspider_2', 'enemy_9037_aceel', 'enemy_9037_aceel_2', 'enemy_2124_dyjsfg']) {
    assert.ok(BOSS_KEYS.includes(k), k);
  }
});

test('假想敌：械 attacks summon 量变之械 and a low HP 冲击之械', () => {
  const h = field('enemy_9029_acfnc');
  h.step(1);
  const boss = h.enemies()[0];
  const ally = h.allies()[0];
  h.b.dealDamage(boss, ally, { amount: 50, type: 'phys', isAttack: true });
  h.step(1);
  assert.ok(h.b.enemies.some((e) => e.defId === 'enemy_9028_acfncb'), '量变之械');
  h.b.dealDamage(ally, boss, { amount: boss.s.maxHp * 0.85, type: 'true' });
  h.step(2);
  assert.ok(h.b.enemies.some((e) => e.defId === 'enemy_9027_acfnca'), '冲击之械');
});

test('假想敌：蛛 dodges after losing a quarter of its HP', () => {
  const h = field('enemy_9035_acspider');
  h.step(1);
  const boss = h.enemies()[0];
  const ally = h.allies()[0];
  h.b.dealDamage(ally, boss, { amount: boss.s.maxHp * 0.3, type: 'true' });
  h.step(2);
  assert.ok(buffs(boss, 'boss:spider_evade').length > 0, 'dodge buff');
});

test('假想敌：电 adds neural damage on its attacks', () => {
  const h = field('enemy_9037_aceel');
  h.step(1);
  const boss = h.enemies()[0];
  const ally = h.allies()[0];
  ally.elem.neural = 0;
  h.b.dealDamage(boss, ally, { amount: 50, type: 'arts', isAttack: true });
  h.step(1);
  assert.ok(ally.elem.neural > 0, `neural ${ally.elem.neural}`);
});

test('矩兽: damage reduction, trample and overload', () => {
  const h = field('enemy_2124_dyjsfg');
  h.step(1);
  const boss = h.enemies()[0];
  const ally = h.allies()[0];
  assert.ok(buffs(boss, 'boss:dyj_res').length > 0, 'damage reduction');
  const hp0 = ally.hp;
  h.run(3);
  assert.ok(ally.hp < hp0, 'trample');
  h.b.dealDamage(ally, boss, { amount: boss.s.maxHp * 0.65, type: 'true' });
  h.step(2);
  assert.ok(buffs(boss, 'boss:dyj_over').length > 0, 'overload');
});

test('假想敌：械 enters its armour form below half HP (PRTS) and summons two 冲击之械', () => {
  const h = field('enemy_9029_acfnc');
  h.step(1);
  const boss = h.enemies()[0];
  const ally = h.allies()[0];
  h.b.dealDamage(ally, boss, { amount: boss.s.maxHp * 0.55, type: 'true' });
  h.step(2);
  assert.ok(boss.hpRatio < 0.5);
  assert.ok(buffs(boss, 'boss:acfnc_armor').length > 0, '护甲形态 (physical/arts -50%)');
  assert.equal(h.b.enemies.filter((e) => e.defId === 'enemy_9027_acfnca' && e.alive).length, 2, 'two 冲击之械');
});

test('假想敌：影役 lowers the block count of operators around it (not other enemies)', () => {
  const h = makeBattle({
    data: ds, seed: 11, autoFinish: false,
    units: [{ chessId: 'chess_char_1_02_a', row: 9, col: 6 }],
    enemies: [{ key: 'enemy_9034_acblk', time: 0, pos: [9, 5] }],
  });
  setGameData(ACT3);
  h.run(1.5);
  const a = h.allies()[0];
  assert.ok(buffs(a, 'ab:acblk').length > 0, 'ab:acblk on the operator');
  assert.equal(a.s.blockCnt, Math.max(0, a.base.blockCnt - 1), 'the operator loses one block');
});

test('假想敌：镜波 gives the lowest-RES operator +10 RES on death; 镜眼 slows the caster of arts damage', () => {
  const h = makeBattle({
    data: ds, seed: 11, autoFinish: false,
    units: [{ chessId: 'chess_char_1_02_a', row: 9, col: 6 }],
    enemies: [{ key: 'enemy_9031_acrefd', time: 0, pos: [9, 7] }, { key: 'enemy_9039_acrefm', time: 0, pos: [10, 5] }],
  });
  setGameData(ACT3);
  h.step(1);
  const [refd, refm] = h.enemies();
  const ally = h.allies()[0];
  const res0 = ally.s.res;
  h.b.kill(refd, ally);
  h.step(1);
  assert.ok(ally.s.res > res0, `RES ${res0} → ${ally.s.res} (镜波 +10)`);
  const aspd0 = ally.s.aspd;
  h.b.dealDamage(ally, refm, { amount: 20, type: 'arts', isAttack: true });
  h.step(1);
  assert.ok(ally.s.aspd < aspd0, `ASPD ${aspd0} → ${ally.s.aspd} (镜眼 -50)`);
});

test('假想敌：械 attacks the whole field (PRTS)', () => {
  const h = makeBattle({
    data: ds, seed: 11, autoFinish: false,
    units: [{ chessId: 'chess_char_1_02_a', row: 10, col: 3 }],
    enemies: [{ key: 'enemy_9029_acfnc', time: 0, pos: [12, 20] }],
  });
  setGameData(ACT3);
  h.step(1);
  const ally = h.allies()[0];
  const hp0 = ally.hp;
  h.run(3);
  assert.ok(ally.hp < hp0, 'a far operator is hit (rangeRadius 0 in data, the field-wide attack is scripted)');
});

test('假想敌：茧 hits up to three operators per side in one attack (PRTS)', () => {
  const units = [
    { chessId: 'chess_char_1_02_a', row: 9, col: 0 },
    { chessId: 'chess_char_1_02_a', row: 10, col: 1 },
    { chessId: 'chess_char_1_02_a', row: 11, col: 2 },
    { chessId: 'chess_char_1_02_a', row: 12, col: 3 },
    { chessId: 'chess_char_1_02_a', row: 9, col: 6 },
  ];
  const h = makeBattle({ data: ds, seed: 11, autoFinish: false, units, enemies: [{ key: 'enemy_9035_acspider', time: 0, pos: [12, 13] }] });
  setGameData(ACT3);
  h.step(1);
  const before = new Map(h.allies().map((a) => [a.id, a.hp]));
  h.run(2.6);
  const hit = h.allies().filter((a) => a.hp < (before.get(a.id) ?? a.hp));
  assert.ok(hit.length >= 3, `several operators struck by one attack (hit ${hit.length})`);
});
