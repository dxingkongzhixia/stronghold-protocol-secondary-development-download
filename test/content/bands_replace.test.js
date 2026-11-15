// test/content/bands_replace.test.js — 规程's auto_chess_effect_replace second directions that our bond code does not
// already implement: 维多利亚's equipment sharing at 6 distinct members (bondeffect_victoria_2) and 阿戈尔's bench
// summon on the first knocked-down members (bondeffect_egir_2). Both are band-gated; the default data has no such band.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import { setGameData } from '../../server/sim/content/support/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const V = Object.fromEntries(fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))
  .map((f) => [path.basename(f, '.json'), JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))]));
setGameData(V);
after(() => setGameData(null));

const OP = (id, bonds) => chessRec({
  id, profession: 'WARRIOR', bonds, tier: 1, golden: false, rangeGrid: [[0, 0]],
  stats: { maxHp: 2000, atk: 500, def: 200, res: 0, aspd: 100, bat: 1, respawnTime: 20, spRecovery: 1, blockCnt: 2 },
  skill: { spCost: 60, duration: 5, initSp: 0 },
});

test('维多利亚 second direction: a member skill start lends its equipment to the 8 neighbours', () => {
  const ops = {};
  const units = [];
  const spots = [[10, 4], [10, 5], [10, 6], [11, 4], [11, 5], [11, 6]];
  for (let i = 0; i < 6; i++) {
    ops[`t_v${i}`] = OP(`t_v${i}`, ['victoriaShip']);
    units.push({ uid: i + 1, kind: 'chess', chessId: `t_v${i}`, row: spots[i][0], col: spots[i][1], ...(i === 0 ? { items: ['chess_item_1_01_e_a'] } : {}) });
  }
  const h = makeBattle({
    defs: { chess: ops, enemies: {} },
    players: [{ playerId: 'p1', seat: 0, bonds: { victoriaShip: { count: 6, active: true, tier: 2, layers: 0 } }, bandId: 'band_victoria', units }],
    enemies: [], timeLimit: 5, autoFinish: false,
  });
  h.step(1);
  const caster = h.unit('t_v0');
  const near = h.unit('t_v1');
  const atk0 = near.s.atk;
  caster.skill.activate('test', { free: true });
  assert.ok(near.buffs.some((b) => String(b.key).includes('@lend')), 'the neighbour holds the lent item');
  assert.ok(near.s.atk > atk0, 'its +15 % ATK applies');
});

test('阿戈尔 second direction: the first 3 members knocked down summon the bench member', () => {
  const ops = {};
  const units = [];
  const spots = [[10, 4], [10, 6], [10, 8], [11, 4], [11, 6], [11, 8]];
  for (let i = 0; i < 6; i++) {
    ops[`t_e${i}`] = OP(`t_e${i}`, ['egirShip']);
    units.push({ uid: i + 1, kind: 'chess', chessId: `t_e${i}`, row: spots[i][0], col: spots[i][1] });
  }
  ops.t_bench = OP('t_bench', ['egirShip']);
  const h = makeBattle({
    defs: { chess: ops, enemies: {} },
    players: [{
      playerId: 'p1', seat: 0, bonds: {}, bandId: 'band_egir', units,
      bandMarks: [{ tag: 'egir_bench', bondId: 'egirShip', count: 3, summon: { chessId: 't_bench', skillIndex: 0 } }],
    }],
    enemies: [], timeLimit: 20, autoFinish: false,
  });
  h.step(1);
  const members = [0, 1, 2, 3].map((i) => h.unit(`t_e${i}`));
  const summoned = () => h.allies().filter((a) => a.defId === 't_bench' && a.alive).length;
  h.b.kill(members[0]);
  h.b.kill(members[1]);
  h.b.kill(members[2]);
  assert.equal(summoned(), 3, 'three members knocked down → three summons');
  h.b.kill(members[3]);
  assert.equal(summoned(), 3, 'the fourth one summons nothing');
});

test('a member knocked down twice is not counted twice', () => {
  const ops = {};
  const units = [];
  for (let i = 0; i < 6; i++) {
    ops[`t_e${i}`] = OP(`t_e${i}`, ['egirShip']);
    units.push({ uid: i + 1, kind: 'chess', chessId: `t_e${i}`, row: 10 + (i % 2), col: 4 + i });
  }
  ops.t_bench = OP('t_bench', ['egirShip']);
  const h = makeBattle({
    defs: { chess: ops, enemies: {} },
    players: [{
      playerId: 'p1', seat: 0, bonds: {}, bandId: 'band_egir', units,
      bandMarks: [{ tag: 'egir_bench', bondId: 'egirShip', count: 3, summon: { chessId: 't_bench', skillIndex: 0 } }],
    }],
    enemies: [], timeLimit: 20, autoFinish: false,
  });
  h.step(1);
  const u = h.unit('t_e0');
  h.b.kill(u);
  const first = h.allies().filter((a) => a.defId === 't_bench' && a.alive).length;
  assert.equal(first, 1);
  // bring the same member back where it lay, then knock it down again
  assert.ok(h.b.redeploy(u, { free: true }));
  h.b.kill(u);
  assert.equal(h.allies().filter((a) => a.defId === 't_bench' && a.alive).length, 1, 'no second summon for one member');
});
