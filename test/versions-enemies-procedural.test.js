// test/versions-enemies-procedural.test.js — programmatic coverage of another official version's new enemies
// (server/sim/content/enemies/procedural.js): with no hand-written kit, a kit is reused by talent signature or composed
// from the generic talent-group handlers. Pins the procedurally covered set and lists the ones left for official kits;
// every one of the 96 new act3 enemies must spawn and run a tick without a handler error.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from '../server/sim/simdata.js';
import { setGameData } from '../server/sim/content/support/index.js';
import { KITS, STATS_ONLY } from '../server/sim/content/enemies.js';
import { BOSS_KEYS } from '../server/sim/content/bosses.js';
import { makeBattle } from './helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const ACT3 = Object.fromEntries(fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => [path.basename(f, '.json'), JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))]));
const DEF = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'enemies.json'), 'utf8'));
const ADDED = Object.keys(ACT3.enemies).filter((k) => !DEF[k]);

/** New enemies still waiting for an official hand-written kit (their talent groups have no generic handler yet). */
const OFFICIAL = new Set([
  'enemy_1104_lfkght', 'enemy_1104_lfkght_3', 'enemy_1191_krgrg', 'enemy_1191_krgrg_2',
  'enemy_1213_mtrsnp', 'enemy_1216_cansld', 'enemy_1219_mtrbty', 'enemy_1224_dsuply', 'enemy_1224_dsuply_2',
  'enemy_1373_ltnhor', 'enemy_1373_ltnhor_2', 'enemy_1376_ltndru', 'enemy_1376_ltndru_2',
  'enemy_1388_wingnt', 'enemy_1388_wingnt_2', 'enemy_1405_boomer_2', 'enemy_1406_chghmr', 'enemy_1435_dsflys',
  'enemy_9024_acsgnt', 'enemy_9028_acfncb', 'enemy_9034_acblk', 'enemy_9040_accrit',
  'enemy_10003_trwlpl_2', 'enemy_10163_mnctur_2', 'enemy_10196_ubba', 'enemy_10196_ubba_2',
]);

after(() => setGameData(null));

test('every new act3 enemy spawns and ticks; the procedural set is pinned', () => {
  setGameData(ACT3);
  const h = makeBattle({
    data: new DataSource(ACT3), seed: 3, autoFinish: false,
    units: [{ chessId: 'chess_char_1_02_a', row: 10, col: 4 }],
    enemies: [{ key: 'enemy_1000_gopro_2', time: 0, pos: [6, 8] }],
  });
  h.step(2);
  const tally = { exact: 0, signature: 0, generic: 0, official: 0, boss: 0, stats: 0 };
  const unlisted = [];
  for (const key of ADDED) {
    const e = h.b.spawnEnemy(key, { pos: [6, 8] });
    assert.ok(e, `${key}: spawned`);
    h.step(1);
    const p = e.mem?.procedural;
    if (KITS[key] || STATS_ONLY[key] || BOSS_KEYS.includes(key)) {
      tally[STATS_ONLY[key] ? 'stats' : BOSS_KEYS.includes(key) ? 'boss' : 'exact'] += 1;
    } else if (p?.via === 'signature') tally.signature += 1;
    else if (p?.via === 'generic') tally.generic += 1;
    else {
      tally.official += 1;
      if (!OFFICIAL.has(key)) unlisted.push(key);
    }
    if (e.alive) h.b.kill(e, null);
    h.b.enemies.length = 0;
  }
  assert.deepEqual(h.b.errors ?? [], [], 'no handler error');
  assert.deepEqual(unlisted, [], 'a new uncovered enemy must be listed in OFFICIAL (or given a generic handler)');
  assert.ok(tally.signature >= 20, `signature reuse ${tally.signature}`);
  assert.ok(tally.generic >= 30, `generic groups ${tally.generic}`);
  assert.equal(tally.official, OFFICIAL.size, 'the official list stays exact');
});

test('a procedural enemy records how it was covered', () => {
  setGameData(ACT3);
  const h = makeBattle({ data: new DataSource(ACT3), seed: 3, autoFinish: false, units: [{ chessId: 'chess_char_1_02_a', row: 10, col: 4 }], enemies: [{ key: 'enemy_1000_gopro_2', time: 0, pos: [6, 8] }] });
  h.step(1);
  const e = h.b.spawnEnemy('enemy_1131_sbeast', { pos: [6, 8] });
  h.step(1);
  assert.equal(e.mem.procedural?.via, 'generic');
  assert.ok(e.mem.procedural.groups.includes('deathrattle'));
});
