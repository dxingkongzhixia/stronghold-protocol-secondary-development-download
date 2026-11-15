// test/versions-map-rules.test.js — the 规程 map tiles the covenant season does not carry: m09 隐匿地块
// (tile_duel_grassland: both sides' ground units gain 隐匿, an enemy blocked on it is revealed and restored at once) and
// m12 加速地块 (tile_speedup: ASPD +25 / move ×1.5). The default data has neither glyph, so nothing here touches it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadData } from '../server/data.js';
import { DataSource } from '../server/sim/simdata.js';
import { setGameData } from '../server/sim/content/support/index.js';
import { enemyStealthed } from '../server/sim/targeting.js';
import { terrainAt } from '../server/sim/content/devices.js';
import { makeBattle } from './helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = loadData(path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1'), { log: quiet });
const DS = new DataSource(ACT3, quiet);

/** [row, col] of every glyph `g` of the stage (rows are bottom-first, as stages.json stores them). */
function tilesOf(stageId, g) {
  const st = ACT3.stages[stageId];
  const out = [];
  st.rows.forEach((row, r) => { [...row].forEach((ch, c) => { if (ch === g) out.push([r, c]); }); });
  return out;
}

/** A tile of the stage inside a player's battle rect (GEO.FIELD rows 9–12 / cols 2–10 here; `w` also marks other halves). */
function tileInField(stageId, g) {
  const t = tilesOf(stageId, g).find(([r, c]) => r >= 9 && r <= 12 && c >= 0 && c <= 10);
  assert.ok(t, `${stageId}: a ${g} tile inside the player's rect`);
  return t;
}

test('the 规程 data carries the m09 隐匿地块 and m12 加速地块, and the default data has neither', () => {
  assert.equal(ACT3.stages.act3autochess_m09.tiles.w?.tileKey, 'tile_duel_grassland');
  assert.deepEqual(ACT3.stages.act3autochess_m09.special.duelGrass,
    { rule: 'groundUnitsGainStealth', clearedOnLeave: true, enemyStealthRestoreSec: 0 });
  assert.equal(ACT3.stages.act3autochess_m12.tiles.z?.tileKey, 'tile_speedup');
  assert.deepEqual(ACT3.stages.act3autochess_m12.special.speedup, { attack_speed: 25, move_speed: 1.5 });
  // isolation: the 盟约 season's stages carry no `w` / `z` glyph or block
  const def = JSON.parse(readFileSync(path.join(ROOT, 'data', 'stages.json'), 'utf8'));
  for (const st of Object.values(def)) {
    assert.equal(st.special?.duelGrass, undefined, st.id);
    assert.equal(st.special?.speedup, undefined, st.id);
  }
});

test('m09 隐匿地块: an operator and a ground enemy on it gain 隐匿; leaving the tile clears it', (t) => {
  setGameData(ACT3);
  t.after(() => setGameData(null));
  const [gr, gc] = tileInField('act3autochess_m09', 'w');
  const far = tilesOf('act3autochess_m09', 'w').find(([r, c]) => r >= 9 && r <= 12 && c <= 10 && (r !== gr || c !== gc));
  assert.ok(far, 'a second 隐匿 tile inside the rect');
  const [er, ec] = far;
  const [fr, fc] = tileInField('act3autochess_m09', 'r');
  const h = makeBattle({
    data: DS, seed: 5, stageId: 'act3autochess_m09', timeLimit: 5,
    units: [{ uid: 1, chessId: 'chess_char_5_26_b', row: gr, col: gc }],
    enemies: [{ key: 'enemy_1000_gopro_2', time: 0, pos: [er, ec] }],
  });
  const b = h.b;
  h.step();
  const ally = h.unit(1);
  assert.equal(terrainAt(b, gr, gc), 'duelGrass', 'the tile is terrain at the sim level');
  assert.ok(ally.findBuff('terrain:duelGrass'), 'the operator on it is hidden');
  assert.equal(ally.findBuff('terrain:duelGrass').data.stealthRestore, 0, 'blocked → restored at once');
  const enemy = h.enemies()[0];
  assert.ok(enemy, 'the enemy spawned');
  assert.ok(enemyStealthed(enemy), 'a ground enemy on it is 隐匿 too');
  // stepping off the tile removes the buff (clearedOnLeave)
  ally.tileR = fr; ally.tileC = fc;
  h.step();
  assert.equal(ally.findBuff('terrain:duelGrass'), null, 'leaving clears it');
  assert.equal(terrainAt(b, fr, fc), null, 'the new tile is no terrain');
});

test('m12 加速地块: ground units on it get ASPD +25 and move ×1.5, flyers do not', (t) => {
  setGameData(ACT3);
  t.after(() => setGameData(null));
  const [r, c] = tileInField('act3autochess_m12', 'z');
  const h = makeBattle({
    data: DS, seed: 5, stageId: 'act3autochess_m12', timeLimit: 5,
    units: [{ uid: 1, chessId: 'chess_char_5_26_b', row: r, col: c }],
    enemies: [{ key: 'enemy_1000_gopro_2', time: 0, pos: [r, c] }],
  });
  h.step();
  assert.equal(terrainAt(h.b, r, c), 'speedup');
  const buff = h.unit(1).findBuff('terrain:speedup');
  assert.ok(buff, 'the operator on it is sped up');
  assert.deepEqual([buff.mods.aspd, buff.mods.moveMul], [25, 1.5]);
  const e = h.enemies()[0];
  assert.ok(e.findBuff('terrain:speedup'), 'the ground enemy on it too');
});
