// test/versions-hidden-core.test.js — 规程's Hidden Core (PRTS 卫戍协议·规程 §隐秘核心: solo ⟨规程等级5⟩+ or co-op
// ⟨险境模拟⟩+, after passing round 14 with the layer condition; clearing it is optional). Version data, real modes.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, setData, resetData } from '../server/data.js';
import { makeMatch } from './match/harness.js';
import { hiddenEligible } from '../server/match/finalAssault.js';
import { PHASE } from '../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
after(() => resetData());
const BOSS_SCRIPT = (b) => (b.kind === 'boss' || b.kind === 'hidden' ? { bossDps: 1e9 } : {});

test('规程 Hidden Core gates: solo level 5+, co-op 险境+ (NORMAL co-op is out)', () => {
  const data = loadData(DIR, { log: quiet });
  setData(data);
  const solo = makeMatch({ mode: 'solo', humans: 1, seed: 31, data, modeId: 'mode_single_5' });
  assert.equal(solo.m.gd.isSolo, true);
  assert.equal(solo.m.gd.difficulty, 'NORMAL');
  assert.equal(solo.m.gd.hiddenRound, 15);
  assert.equal(hiddenEligible(solo.m.gd, { layerSum: 351, teamLp: 5 }), true);
  assert.equal(hiddenEligible(solo.m.gd, { layerSum: 350, teamLp: 5 }), false);

  const coopNormal = makeMatch({ mode: 'coop', humans: 2, seed: 32, data, modeId: 'mode_multi_normal' });
  assert.equal(coopNormal.m.gd.isSolo, false);
  assert.equal(hiddenEligible(coopNormal.m.gd, { layerSum: 5000, teamLp: 99 }), false, 'co-op NORMAL has no Hidden Core');

  const coopHard = makeMatch({ mode: 'coop', humans: 2, seed: 33, data, modeId: 'mode_multi_hard' });
  assert.equal(hiddenEligible(coopHard.m.gd, { layerSum: 1201, teamLp: 5 }), true);
  assert.equal(hiddenEligible(coopHard.m.gd, { layerSum: 1200, teamLp: 5 }), false);
});

test('规程 solo level 5: a won round 14 with enough layers opens R15 and the Hidden Core', () => {
  const data = loadData(DIR, { log: quiet });
  setData(data);
  const h = makeMatch({ mode: 'solo', humans: 1, seed: 34, data, modeId: 'mode_single_5', fake: true, script: BOSS_SCRIPT }).start();
  h.autoHumans();
  const m = h.m;
  h.drive(() => m.phase === PHASE.PREP && m.round === 14);
  const ps = h.ps('p_0');
  ps.bondCountBonus.yanShip = 3;
  ps.layers.yanShip = 360;
  ps.recompute();
  h.drive(() => m.phase === PHASE.FINAL_ASSAULT);
  assert.equal(m.hiddenLayerSum, 360);
  h.drive(() => m.phase === PHASE.PREP && m.round === 15);
  h.drive(() => m.phase === PHASE.HIDDEN_CORE);
  const end = h.runToEnd();
  assert.equal(end.victory, true);
  assert.equal(end.hiddenReached, true);
  assert.equal(end.hiddenCleared, true);
  assert.equal(end.roundsPassed, 15);
  m.dispose();
});

test('规程 co-op NORMAL: a won round 14 goes straight to the result (no Hidden Core)', () => {
  const data = loadData(DIR, { log: quiet });
  setData(data);
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 35, data, modeId: 'mode_multi_normal', fake: true, script: BOSS_SCRIPT }).start();
  h.autoHumans();
  const m = h.m;
  h.drive(() => m.phase === PHASE.PREP && m.round === 14);
  for (const p of m.players.values()) { p.layers.yanShip = 700; p.recompute(); }
  h.drive(() => m.phase === PHASE.FINAL_ASSAULT);
  const end = h.runToEnd();
  assert.equal(end.victory, true);
  assert.notEqual(end.hiddenReached, true);
  assert.equal(end.roundsPassed, 14);
  m.dispose();
});

test('规程 co-op 险境: the same win opens the Hidden Core at 1200 layers', () => {
  const data = loadData(DIR, { log: quiet });
  setData(data);
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 36, data, modeId: 'mode_multi_hard', fake: true, script: BOSS_SCRIPT }).start();
  h.autoHumans();
  const m = h.m;
  h.drive(() => m.phase === PHASE.PREP && m.round === 14);
  for (const p of m.players.values()) { p.bondCountBonus.yanShip = 3; p.layers.yanShip = 700; p.recompute(); }
  h.drive(() => m.phase === PHASE.FINAL_ASSAULT);
  assert.equal(m.hiddenLayerSum, 1400);
  h.drive(() => m.phase === PHASE.HIDDEN_CORE);
  const end = h.runToEnd();
  assert.equal(end.victory, true);
  assert.equal(end.hiddenReached, true);
  m.dispose();
});
