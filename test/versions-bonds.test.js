// test/versions-bonds.test.js — the regulation season's new bonds (server/sim/content/bonds/regulation.js): 聚合's
// healing / element recovery / damage-reduction aura and 伊比利亚's stacking arts DoT, slow and bounce on a version's
// own data (act3autochess). The other new bonds (乌萨斯 / 莱塔尼亚) are still P2 work.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from '../server/sim/simdata.js';
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
