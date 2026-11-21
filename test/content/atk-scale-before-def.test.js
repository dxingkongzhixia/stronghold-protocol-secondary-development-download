// 「攻击力提升至 / 当次攻击的攻击力」is an attack-scale on `dmg.amount` — applied to the ATK, before DEF.
// A physical hit of 100 into DEF 80 separates the two readings: pre-DEF 150 → 70, post-mitigation ×1.5 → 30.
// The upstream mainline fixed the same 15 sites in round 84; this file pins the ones this fork ships.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getData, loadData } from '../../server/data.js';
import { DataSource } from '../../server/sim/simdata.js';
import { setGameData } from '../../server/sim/content/support/index.js';
import { mitigate } from '../../server/sim/damage.js';
import { enemyRec, makeBattle } from '../helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUIET = Object.freeze({ warn() {}, error() {}, info() {} });
const DEFAULT = getData({ log: QUIET });

const DEF = 80;
const AMT = 100;

function use(t, data) {
  setGameData(data);
  t.after(() => setGameData(null));
}

function forceProc(h) {
  const orig = h.b.rng;
  h.b.rng = Object.assign(() => 0, orig, { chance() { return true; } });
}

/** A battle with `id` on (10,4) and one armor enemy (DEF 80, no attack) beside it. */
function field(data, id) {
  const rec = data.chess[id];
  if (!rec) throw new Error(`no chess ${id}`);
  const src = {
    ...data,
    chess: { ...data.chess, [id]: { ...rec, garrisonIds: [] } },
    enemies: { ...data.enemies, armor: enemyRec({ key: 'armor', hp: 1e6, def: DEF, speed: 0, atk: 0 }) },
  };
  const h = makeBattle({
    data: new DataSource(src),
    seed: 1, autoFinish: false, timeLimit: 12,
    units: [{ uid: 1, chessId: id, row: 10, col: 4 }],
  });
  h.step();
  const unit = h.unit(1);
  const enemy = h.spawn('armor', { pos: [10, 5] });
  return { h, unit, enemy };
}

/** HP removed by one physical attack of AMT (the readings differ only against DEF). */
function strike(h, source, enemy) {
  const before = enemy.hp;
  h.b.dealDamage(source, enemy, { amount: AMT, type: 'phys', isAttack: true });
  return before - enemy.hp;
}

function assertPreDef(label, dealt, scale) {
  assert.equal(typeof scale, 'number', `${label}: scale`);
  assert.ok(scale > 1, `${label}: scale ${scale} does not separate the readings`);
  const want = mitigate(AMT * scale, 'phys', { def: DEF });
  const wrong = mitigate(AMT, 'phys', { def: DEF }) * scale;
  assert.ok(Math.abs(want - wrong) > 1, `${label}: pre ${want} vs post ${wrong}`);
  assert.ok(Math.abs(dealt - want) < 1e-6, `${label}: dealt ${dealt}, pre-DEF ${want}, post-mitigation ${wrong}`);
}

function finish(h) {
  assert.deepEqual(h.b.errors.map((e) => `${e.label} ${e.message}`), []);
}

test('寒芒克洛丝 中的: atk_scale is this attack\'s ATK, before DEF', (t) => {
  use(t, DEFAULT);
  const { h, unit, enemy } = field(DEFAULT, 'chess_char_4_06_a');
  forceProc(h);
  const scale = unit.def.talents[0].bb.atk_scale; // post-潜能 (data/chess.json stores the max-potential number)
  assertPreDef('kroos2', strike(h, unit, enemy), scale);
  finish(h);
});

test('风笛 精密填弹: the boosted attack\'s ATK is raised before DEF', (t) => {
  use(t, DEFAULT);
  const { h, unit, enemy } = field(DEFAULT, 'chess_char_4_07_a');
  unit.mem.bpBoost = true;
  const scale = DEFAULT.chess.chess_char_4_07_a.talents[0].bb.atk_scale;
  assertPreDef('bpipe', strike(h, unit, enemy), scale);
  finish(h);
});

test('歌蕾蒂娅 弱肉强食: ATK against light enemies is raised before DEF', (t) => {
  use(t, DEFAULT);
  const { h, unit, enemy } = field(DEFAULT, 'chess_char_4_12_a');
  const tb = unit.def.talents[1].bb;
  assert.ok(enemy.s.massLevel <= tb.value, 'a light enemy');
  assertPreDef('glady', strike(h, unit, enemy), tb.atk_scale);
  finish(h);
});

test('百炼嘉维尔 module: ATK against a blocked enemy is raised before DEF', (t) => {
  use(t, DEFAULT);
  const { h, unit, enemy } = field(DEFAULT, 'chess_char_4_23_b');
  enemy.blockedBy = unit;
  const scale = DEFAULT.chess.chess_char_4_23_b.trait.bb.atk_scale;
  assertPreDef('gvial2', strike(h, unit, enemy), scale);
  finish(h);
});

test('佩佩 module: splash-count ATK scale is applied before DEF', (t) => {
  use(t, DEFAULT);
  const { h, unit, enemy } = field(DEFAULT, 'chess_char_6_06_b');
  unit.mem.pepeBoost = true;
  const scale = DEFAULT.chess.chess_char_6_06_b.trait.bb.atk_scale_e;
  assertPreDef('pepe', strike(h, unit, enemy), scale);
  finish(h);
});

test('瑕光 仁慈: ATK against a sleeper is raised before DEF', (t) => {
  use(t, DEFAULT);
  const { h, unit, enemy } = field(DEFAULT, 'chess_char_3_12_a');
  enemy.s.flags.sleep = true;
  const scale = unit.def.talents[1].bb.atk_scale;
  assertPreDef('blemsh', strike(h, unit, enemy), scale);
  finish(h);
});
