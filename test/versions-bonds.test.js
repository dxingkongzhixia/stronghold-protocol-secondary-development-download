// test/versions-bonds.test.js — the regulation season's new bonds (server/sim/content/bonds/regulation.js): 聚合's
// healing / element recovery / damage-reduction aura and 伊比利亚's stacking arts DoT, slow and bounce on a version's
// own data (act3autochess). The other new bonds (乌萨斯 / 莱塔尼亚) are still P2 work.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from '../server/sim/simdata.js';
import * as S from '../server/sim/content/support/index.js';
import { setGameData } from '../server/sim/content/support/index.js';
import { makeBattle, checkInvariants } from './helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const ACT3 = Object.fromEntries(fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => [path.basename(f, '.json'), JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))]));
const ds = new DataSource(ACT3);
const bondOn = (count, layers = 0, thresholds = [3, 6]) => ({ count, active: count >= thresholds[0], tier: thresholds.filter((t) => count >= t).length, layers });
const buffs = (u, key) => u.buffs.filter((b) => b.key === key);

after(() => setGameData(null));

test('聚合 3: allies in a member range recover HP and element every second and gain damage reduction', () => {
  setGameData(ACT3);
  const h = makeBattle({
    data: ds, seed: 3, autoFinish: false,
    units: [
      { chessId: 'chess_char_1_15_a', row: 10, col: 4 },  // 褐果 (docShip)
      { chessId: 'chess_char_3_06_a', row: 11, col: 4 },  // 风絮 (docShip)
      { chessId: 'chess_char_1_02_a', row: 10, col: 6, carryState: { hpPct: 0.5 } }, // 艾丝黛尔 (not a member)
    ],
    enemies: [{ key: 'enemy_1000_gopro_2', time: 0, pos: [8, 4] }],
    bonds: { docShip: bondOn(3, 0) },
  });
  h.step(1);
  const ally = h.allies().find((u) => u.defId === 'chess_char_1_02_a');
  const m1 = h.allies().find((u) => u.defId === 'chess_char_1_15_a');
  const m2 = h.allies().find((u) => u.defId === 'chess_char_3_06_a');
  assert.ok(ally && m1 && m2, 'the units are deployed');
  ally.elem.neural = 100;
  const hp0 = ally.hp;
  h.run(1.05);
  const heal = (m1.s.atk + m2.s.atk) * 0.16;
  assert.ok(Math.abs((ally.hp - hp0) - heal) <= Math.max(1, heal * 0.02), `heal ${ally.hp - hp0} vs ${heal}`);
  assert.ok(ally.elem.neural < 100, `element recovered (${ally.elem.neural})`);
  assert.ok(buffs(ally, `bond:doc:res:${m1.id}`).length > 0 || buffs(ally, `bond:doc:res:${m2.id}`).length > 0, 'damage reduction');
  checkInvariants(h.b);
});

test('伊比利亚: every damage instance stacks a 10 s arts DoT; 6 adds the slow', () => {
  setGameData(ACT3);
  for (const [count, six] of [[3, false], [6, true]]) {
    const h = makeBattle({
      data: ds, seed: 5, autoFinish: false,
      units: [{ chessId: 'chess_char_1_08_a', row: 10, col: 4 }], // 深靛 (iberiaShip)
      enemies: [{ key: 'enemy_1000_gopro_2', time: 0, pos: [10, 6] }],
      bonds: { iberiaShip: bondOn(count, 0) },
    });
    h.step(1);
    const e = h.enemies()[0];
    const hp0 = e.hp;
    assert.ok(h.runUntil(() => h.enemies().some((x) => x.hp < hp0), 8), 'the member attacked');
    const dots = buffs(e, `bond:iberia:dot:${h.allies()[0].id}`);
    assert.ok(dots.length >= 1, `DoT applied (${dots.length})`);
    assert.ok(dots.length <= 10, 'at most 10 stacks');
    if (six) assert.ok(buffs(e, 'bond:iberia:slow').length >= 1, 'the 6-member slow');
    else assert.equal(buffs(e, 'bond:iberia:slow').length, 0);
    const hp1 = e.hp;
    h.run(1.05);
    assert.ok(e.hp < hp1, 'the DoT ticks');
    checkInvariants(h.b);
  }
});

test('伊比利亚: the bond\'s own DoT / bounce damage does not proc the bond again', () => {
  setGameData(ACT3);
  const h = makeBattle({
    data: ds, seed: 5, autoFinish: false,
    units: [{ chessId: 'chess_char_1_08_a', row: 10, col: 4 }], // 深靛 (iberiaShip)
    enemies: [{ key: 'enemy_1000_gopro_2', time: 0, pos: [10, 6] }],
    bonds: { iberiaShip: bondOn(6, 0) },
  });
  h.step(1);
  const m = h.allies()[0];
  const e = h.enemies()[0];
  const before = buffs(e, `bond:iberia:dot:${m.id}`).length;
  // a tick of the bond's own DoT (or a bounce) is tagged bond:iberia: it must not stack the DoT or bounce again — that
  // recursion used to reach the hook nesting guard inside a 6-member battle (act3 golden coop2-HARD-4)
  h.b.dealDamage(m, e, { amount: 10, type: 'arts', isSkill: true, tags: ['bond:iberia'] });
  assert.equal(buffs(e, `bond:iberia:dot:${m.id}`).length, before, 'no self-stacking from the bond\'s own damage');
  checkInvariants(h.b);
});

test('乌萨斯: member ATK / HP buffs, kill layers, and the 6-member bleed conversion', () => {
  setGameData(ACT3);
  const h = makeBattle({
    data: ds, seed: 7, autoFinish: false,
    units: [
      { chessId: 'chess_char_1_16_a', row: 10, col: 4 }, // 烈夏 (ursusShip)
      { chessId: 'chess_char_1_02_a', row: 10, col: 5, carryState: { hpPct: 0.6 } },
    ],
    enemies: [{ key: 'enemy_1000_gopro_2', time: 0, pos: [10, 7] }],
    bonds: { ursusShip: bondOn(6, 0) },
  });
  h.step(1);
  const m = h.allies().find((u) => u.defId === 'chess_char_1_16_a');
  const buff = buffs(m, 'bond:ursus')[0];
  assert.ok(buff, 'the ATK / HP buff');
  assert.ok(buff.mods.atkPct > 0 && buff.mods.hpPct > 0, JSON.stringify(buff.mods));
  // a member's kill adds 4 temporary layers at 6 members
  const layers0 = S.bondLayers(h.b, 'p1', 'ursusShip');
  const e = h.enemies()[0];
  // 6: damage taken becomes a 10 s HP loss
  h.b.dealDamage(e, m, { amount: 1000, type: 'phys' });
  h.step(1);
  assert.ok(buffs(m, `bond:ursus:bleed:${m.id}`).length > 0, 'bleed buff');
  // a member's kill adds temporary layers
  h.b.dealDamage(m, e, { amount: 1e9, type: 'true' });
  h.step(2);
  assert.ok(S.bondLayers(h.b, 'p1', 'ursusShip') > layers0, 'kill layers');
});

test('莱塔尼亚: members get ATK and an enemy death summons 小节 (6: 乐部 chance too)', () => {
  setGameData(ACT3);
  const h = makeBattle({
    data: ds, seed: 9, autoFinish: false,
    units: [{ chessId: 'chess_char_1_19_a', row: 10, col: 4 }], // 地灵 (lethaniaShip)
    enemies: [{ key: 'enemy_1000_gopro_2', time: 0, pos: [10, 6] }],
    bonds: { lethaniaShip: bondOn(6, 0) },
  });
  h.step(1);
  const m = h.allies()[0];
  assert.ok(buffs(m, 'bond:lethania').length > 0, 'the ATK buff');
  const e = h.enemies()[0];
  h.b.dealDamage(m, e, { amount: 1e9, type: 'true' });
  h.step(2);
  const summoned = h.b.enemies.filter((x) => x.alive && (x.defId === 'enemy_9025_aclts' || x.defId === 'enemy_9026_acltm'));
  assert.ok(summoned.length >= 1, 'a summon');
});
