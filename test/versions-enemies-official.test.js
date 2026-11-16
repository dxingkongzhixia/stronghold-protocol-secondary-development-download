// test/versions-enemies-official.test.js — the hand-written act3 enemy kits (server/sim/content/enemies/regulation.js):
// registration plus the mechanics that are easy to observe in one battle (reborn, death boom + cold, first-hit crit with
// no-heal, enemy aura, the 雪山 stances and the 乐团 switch).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from '../server/sim/simdata.js';
import { setGameData } from '../server/sim/content/support/index.js';
import { KITS } from '../server/sim/content/enemies.js';
import { REGULATION_KITS } from '../server/sim/content/enemies/regulation.js';
import { makeBattle } from './helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const ACT3 = Object.fromEntries(fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => [path.basename(f, '.json'), JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))]));
const ds = new DataSource(ACT3);
const buffs = (u, key) => u.buffs.filter((b) => b.key === key);

after(() => setGameData(null));

function field(extra = {}) {
  setGameData(ACT3);
  return makeBattle({
    data: ds, seed: 13, autoFinish: false,
    units: [{ chessId: 'chess_char_1_02_a', row: 10, col: 6 }, { chessId: 'chess_char_1_05_a', row: 9, col: 6 }],
    enemies: [{ key: 'enemy_1000_gopro_2', time: 0, pos: [4, 8] }],
    ...extra,
  });
}

test('every official kit is registered and its key is in KITS', () => {
  for (const key of Object.keys(REGULATION_KITS)) assert.equal(KITS[key], REGULATION_KITS[key], key);
});

test('锋盔骑士团学徒: reborn after five seconds', () => {
  const h = field();
  h.step(1);
  const e = h.b.spawnEnemy('enemy_1104_lfkght', { pos: [6, 8] });
  h.step(1);
  h.b.dealDamage(h.allies()[0], e, { amount: e.s.maxHp * 2, type: 'true' });
  h.run(7);
  assert.equal(e.alive, true, 'reborn');
  assert.ok(e.hp > 0, 'revived with HP');
});

test('冰原卫法: death explosion damages and chills the ally next to it', () => {
  const h = field();
  h.step(1);
  const e = h.b.spawnEnemy('enemy_1191_krgrg', { pos: [10, 7] });
  h.step(1);
  const ally = h.allies()[0];
  const hp = ally.hp;
  h.b.dealDamage(ally, e, { amount: e.s.maxHp * 2, type: 'true' });
  h.step(1);
  assert.ok(ally.hp < hp, 'boom damage');
  assert.ok(ally.findBuff('cold') || buffs(ally, 'cold').length > 0, 'cold');
});

test('假想敌：丛生: the first hit on a target blocks healing', () => {
  const h = field();
  h.step(1);
  const e = h.b.spawnEnemy('enemy_9040_accrit', { pos: [10, 7] });
  const ally = h.allies()[0];
  h.step(1);
  h.b.dealDamage(e, ally, { amount: 100, type: 'phys', isAttack: true });
  h.step(1);
  assert.ok(buffs(ally, 'ab:accrit_noheal').length > 0, 'no-heal buff');
});

test('不眠雪山: the two stances and the bond buff are installed', () => {
  const h = field();
  h.step(1);
  const e = h.b.spawnEnemy('enemy_9024_acsgnt', { pos: [6, 8] });
  h.step(1);
  assert.ok(buffs(e, 'ab:acsgnt_bond').length > 0, 'bond buff');
  assert.ok(buffs(e, 'ab:acsgnt_sit').length > 0, 'sit stance');
});

test('残党乐团圆号手: a switch-mode buff is installed', () => {
  const h = field();
  h.step(1);
  const e = h.b.spawnEnemy('enemy_1373_ltnhor', { pos: [6, 8] });
  h.step(1);
  assert.ok(buffs(e, 'ab:switchmode').length > 0, 'switch mode');
});

test('萨卡兹子裔补给车: nearby enemies get the ATK aura', () => {
  const h = field();
  h.step(1);
  h.b.spawnEnemy('enemy_1224_dsuply', { pos: [6, 8] });
  const other = h.b.spawnEnemy('enemy_1000_gopro_2', { pos: [6, 7] });
  h.run(1.5);
  assert.ok(buffs(other, 'ab:dsuply').length > 0, 'aura buff');
});

test('搏命养家者: nearby enemies take less physical and arts damage', () => {
  const h = field();
  h.step(1);
  h.b.spawnEnemy('enemy_10196_ubba', { pos: [6, 8] });
  const other = h.b.spawnEnemy('enemy_1000_gopro_2', { pos: [6, 7] });
  h.run(1.5);
  const b = buffs(other, 'ab:ubba_guard')[0];
  assert.ok(b, 'guard aura');
  assert.equal(b.mods.physTakenMul, 0.75);
});

test('萨卡兹子裔寄生者: an enemy killed nearby leaves a 大君之赐; the gift does not trigger it again', () => {
  const h = field();
  h.step(1);
  h.b.spawnEnemy('enemy_9030_acpara', { pos: [6, 8] });
  const victim = h.b.spawnEnemy('enemy_1000_gopro_2', { pos: [6, 8] });
  h.b.kill(victim);
  const gifts = h.enemies().filter((e) => e.defId === 'enemy_1221_dzomg');
  assert.equal(gifts.length, 1, 'a 大君之赐 at the dead enemy');
  h.b.kill(gifts[0]);
  h.step();
  assert.equal(h.enemies().filter((e) => e.defId === 'enemy_1221_dzomg').length, 0, 'no chain from a gift');
});

test('内测版自助出餐终端 summons on its own skill cooldown', () => {
  const h = field();
  h.step(1);
  h.b.spawnEnemy('enemy_10077_mpbarr', { pos: [5, 8] });
  h.run(3.3);
  assert.ok(h.enemies().some((e) => e.defId === 'enemy_10073_mpcar'), 'Spawn');
});
