// test/versions-config-rules.test.js — pins the 规程 rules reviewed against the official tables / recordings: the Hidden
// Core thresholds and gates, the leader round's shared pool and overtime drain, and 联防's "no layer gains". Behaviour is
// covered by test/versions-hidden-core.test.js, test/versions-boss-top.test.js and test/match/finalAssault.test.js; this
// file keeps the numbers the match engine reads from config.json from drifting.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, setData, resetData } from '../server/data.js';
import { makeMatch } from './match/harness.js';
import { hiddenEligible } from '../server/match/finalAssault.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
const ACT3 = loadData(DIR, { log: quiet });
after(() => resetData());

test('规程 config: Hidden Core 350 / 1200, after R14, solo NORMAL+ / co-op HARD+', () => {
  assert.deepEqual(ACT3.config.hiddenCore, {
    single: 350, multi: 1200, minTeamLpExclusive: 1, difficulties: ['NORMAL', 'HARD', 'ABYSS'], checkedAfterRound: 14,
    soloDifficulties: ['NORMAL', 'HARD', 'ABYSS'], multiDifficulties: ['HARD', 'ABYSS'],
  });
  setData(ACT3);
  const solo = makeMatch({ mode: 'solo', humans: 1, seed: 61, data: ACT3, modeId: 'mode_single_5' });
  assert.equal(hiddenEligible(solo.m.gd, { layerSum: 351, teamLp: 5 }), true);
  assert.equal(hiddenEligible(solo.m.gd, { layerSum: 350, teamLp: 5 }), false);
  assert.equal(hiddenEligible(solo.m.gd, { layerSum: 999, teamLp: 1 }), false, 'team LP must stay above 1');
  const coop = makeMatch({ mode: 'coop', humans: 2, seed: 62, data: ACT3, modeId: 'mode_multi_hard' });
  assert.equal(hiddenEligible(coop.m.gd, { layerSum: 1201, teamLp: 5 }), true);
  assert.equal(hiddenEligible(coop.m.gd, { layerSum: 1200, teamLp: 5 }), false);
});

test('规程 config: one shared leader pool, overtime drains 1 LP/s after 150 s, 联防 gains no layers', () => {
  assert.equal(ACT3.config.bossHpScale.perPlayer, true);
  assert.equal(ACT3.config.bossHpScale.unaffectedByEnemyScale, true);
  assert.equal(ACT3.config.bossOvertimeAfter, 150);
  assert.equal(ACT3.config.bossOvertimeDrainPerSec, 1);
  // 联防: no IN_BATTLE layer gains, but HP/SP/positions carry and leaked enemies keep full HP
  assert.equal(ACT3.config.unite.layerGainsEnabled, false);
  assert.equal(ACT3.config.unite.keepsHpSpPositions, true);
  assert.equal(ACT3.config.unite.leakedEnemyFullHp, true);
  assert.equal(ACT3.config.finalAssault.layerGainsEnabled, false);
});
