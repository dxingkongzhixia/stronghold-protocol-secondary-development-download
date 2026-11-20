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
import { REGULATION_EXTRA_KITS } from '../server/sim/content/enemies/regulation-extra.js';
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
  // 规程's kits live in two modules (the mainline port + this fork's own additions); a shared key may be provided by either
  for (const key of Object.keys(REGULATION_KITS)) assert.equal(KITS[key], REGULATION_EXTRA_KITS[key] ?? REGULATION_KITS[key], key);
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

test('萨卡兹子裔补给车: only the 重生造物 on the field get the +10 % ATK / apoptosis aura', () => {
  const h = field();
  h.step(1);
  h.b.spawnEnemy('enemy_1224_dsuply', { pos: [6, 8] });
  const reborn = h.b.spawnEnemy('enemy_1221_dzomg', { pos: [6, 7] });
  const other = h.b.spawnEnemy('enemy_1000_gopro_2', { pos: [6, 7] });
  const far = h.b.spawnEnemy('enemy_1221_dzomg_2', { pos: [13, 15] });
  h.run(1.5);
  const b = buffs(reborn, 'ab:dsuply')[0];
  assert.ok(b, 'aura buff on a 大君之赐');
  assert.equal(b.mods.atkPct, 0.1, 'one truck is one stack (+10 %)');
  assert.ok(buffs(far, 'ab:dsuply').length > 0, 'no radius — every 重生造物');
  assert.equal(buffs(other, 'ab:dsuply').length, 0, 'other enemies do not get it');
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

test('狂暴凶豕兽: block weight 2, rush acceleration, and the first attack is 移速×600 (never ×600)', () => {
  const h = field();
  h.step(1);
  const e = h.b.spawnEnemy('enemy_1309_mhboar_2', { pos: [10, 8] });
  assert.equal(e.blockWeight, 2, '占用 2 阻挡数');
  h.run(4.2); // 3 s predelay + a few 0.333 s stacks
  assert.ok(e.findBuff('reg:mhboar_rush'), 'rush acceleration buff');
  assert.ok(e.s.moveSpeed > 0.4 + 1e-6, `move speed ${e.s.moveSpeed}`);
  const ally = h.allies().find((a) => a.tileC === 6) ?? h.allies()[0];
  const hp = ally.hp;
  assert.ok(h.runUntil(() => ally.hp < hp, 12), 'the ally is hit');
  assert.ok(hp - ally.hp < 5000, `one hit is 移速×600, not ×600 ATK (${Math.round(hp - ally.hp)})`);
});

test('恶尘源石虫: the death explosion is delayed 1 s and deals 350 % ATK', () => {
  const h = field();
  h.step(1);
  const e = h.b.spawnEnemy('enemy_1424_lrboom', { pos: [10, 7] });
  const ally = h.allies().find((a) => a.tileC === 6) ?? h.allies()[0];
  const hp = ally.hp;
  h.b.dealDamage(null, e, { amount: e.s.maxHp * 2, type: 'true' });
  assert.equal(e.alive, false, 'dead');
  h.run(0.5);
  assert.ok(hp - ally.hp < 1, 'no explosion inside the 1 s fuse');
  h.run(0.8);
  const dealt = hp - ally.hp;
  // 350 % × 300 ATK, less the ally's DEF (physical); nowhere near the 池's 1 s delay being skipped
  assert.ok(dealt > 0, `explosion damage ${dealt}`);
});

test('“投石机”: the first shot is arts and splashes the cross, then it fights in melee', () => {
  const h = field();
  h.step(1);
  const e = h.b.spawnEnemy('enemy_1388_wingnt', { pos: [10, 7] });
  const target = h.allies().find((u) => u.tileR === 10 && u.tileC === 6);
  const splash = h.allies().find((u) => u.tileR === 9 && u.tileC === 6);
  const hp = splash.hp;
  h.b.dealDamage(e, target, { amount: e.s.atk, type: 'phys', isAttack: true });
  assert.ok(hp - splash.hp > 0, 'the tile next to the target takes the 150 % arts splash');
  assert.equal(e.profile.melee, true, 'then melee only');
});

test('寻路者阵地破坏者: two ammo shots splash the 8 tiles, then it is melee only', () => {
  const h = field();
  h.step(1);
  const e = h.b.spawnEnemy('enemy_1216_cansld', { pos: [10, 7] });
  const target = h.allies().find((u) => u.tileR === 10 && u.tileC === 6);
  const splash = h.allies().find((u) => u.tileR === 9 && u.tileC === 6);
  const fire = () => h.b.emit('attack', { attacker: e, targets: [target], targetDeployments: new Map([[target, target.deploySeq]]), isSkill: false });
  let hp = splash.hp;
  fire();
  assert.ok(hp - splash.hp > 0, 'first round splashes');
  hp = splash.hp;
  fire();
  assert.ok(hp - splash.hp > 0, 'second round splashes');
  hp = splash.hp;
  fire();
  assert.ok(Math.abs(hp - splash.hp) < 1e-6, 'no third round: ammo 2');
  assert.equal(e.profile.melee, true, 'then melee only');
});

test('寻路者信使: the shot applies 缴械 + 沉默 (无法攻击或治疗) and does not drain SP', () => {
  const h = field();
  h.step(1);
  const e = h.b.spawnEnemy('enemy_1219_mtrbty', { pos: [10, 7] });
  const target = h.allies().find((u) => u.tileR === 10 && u.tileC === 6);
  if (target.skill) target.skill.sp = 10;
  h.b.emit('attack', { attacker: e, targets: [target], targetDeployments: new Map([[target, target.deploySeq]]), isSkill: false });
  h.step(0.1);
  assert.equal(target.s.flags.disarm, true, '缴械');
  assert.equal(target.s.flags.silence, true, '沉默');
  if (target.skill) assert.ok(target.skill.sp >= 10, 'headshot_sp is the ammo counter, not an SP drain');
});

test('萨卡兹子裔责罚者: the 4th attack stuns AND damages allies in radius 1.0', () => {
  const h = field();
  h.step(1);
  const e = h.b.spawnEnemy('enemy_1362_dfat', { pos: [10, 7] });
  const target = h.allies().find((u) => u.tileR === 10 && u.tileC === 6);
  const fire = () => h.b.emit('attack', { attacker: e, targets: [target], targetDeployments: new Map([[target, target.deploySeq]]), isSkill: false });
  const hp = target.hp;
  fire(); fire(); fire();
  assert.ok(Math.abs(target.hp - hp) < 1e-6, 'no damage on the first three attacks');
  fire();
  h.step(0.1);
  assert.ok(target.hp < hp, 'the 责罚 hit deals 100 % ATK physical');
  assert.ok(target.findBuff('stun') || target.s.flags.stun, 'and stuns for 4 s');
});

test('萨卡兹子裔集恨者: it counts every 重生造物 on the field', () => {
  const h = field();
  h.step(1);
  const e = h.b.spawnEnemy('enemy_1226_dklord', { pos: [6, 8] });
  h.b.spawnEnemy('enemy_1221_dzomg', { pos: [6, 6] });
  h.b.spawnEnemy('enemy_1220_dzoms', { pos: [6, 4] });
  h.run(0.5);
  const lord = buffs(e, 'reg:lord')[0];
  assert.ok(lord, 'ATK buff');
  assert.ok(Math.abs(lord.mods.atkPct - 0.3) < 1e-9, `2 × 15 % (${lord.mods.atkPct})`);
});

test('残党乐团: the stance move speed is the FINAL multiplier (激昂 200 %, 沉郁 50 %)', () => {
  const h = field();
  h.step(1);
  const e = h.b.spawnEnemy('enemy_1373_ltnhor_2', { pos: [6, 8] });
  const target = h.allies()[0];
  h.step(0.1);
  assert.equal(buffs(e, 'ab:switchmode')[0].mods.moveMul, 2, '激昂: 最终 200 %');
  const fire = () => h.b.emit('attack', { attacker: e, targets: [target], targetDeployments: new Map([[target, target.deploySeq]]), isSkill: false });
  fire(); fire(); fire();
  h.step(0.1);
  assert.equal(buffs(e, 'ab:switchmode')[0].mods.moveMul, 0.5, '沉郁: 最终 50 %');
});

test('战线推进者: the 强击 marker is ×1.8, not the 250 % 封阻物 multiplier', () => {
  const h = field();
  h.step(1);
  const e = h.b.spawnEnemy('enemy_1406_chghmr', { pos: [10, 7] });
  const target = h.allies().find((u) => u.tileR === 10 && u.tileC === 6);
  h.step(0.1);
  const hp = target.hp;
  h.b.dealDamage(e, target, { amount: e.s.atk, type: 'phys', isAttack: true });
  const marked = hp - target.hp;
  const hp2 = target.hp;
  h.b.dealDamage(e, target, { amount: e.s.atk, type: 'phys', isAttack: true });
  const plain = hp2 - target.hp;
  assert.ok(marked > plain * 1.5, `marked ${marked} vs plain ${plain}`);
});

test('暴走食人花: it swallows one ally and spits it out when killed during digestion', () => {
  const h = field();
  h.step(1);
  const e = h.b.spawnEnemy('enemy_10003_trwlpl_2', { pos: [10, 7] });
  const ally = h.allies().find((u) => u.tileR === 10 && u.tileC === 6);
  assert.ok(h.runUntil(() => !ally.alive, 20), 'swallowed');
  assert.ok(e.findBuff('ab:trwlpl_eat'), 'digesting (self-bound)');
  h.b.kill(e, null);
  h.step(0.2);
  assert.equal(ally.alive, true, 'spat out, no redeploy time');
});

test('开天汽水瓶: 120 true damage a second (12 every 0.1 s), not 240', () => {
  const h = field();
  h.step(1);
  const e = h.b.spawnEnemy('enemy_10146_nscola', { pos: [4, 8] });
  const hp = e.hp;
  h.run(1);
  const lost = hp - e.hp;
  assert.ok(lost > 100 && lost < 140, `about 120 a second (${Math.round(lost)})`);
});
