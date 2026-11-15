// test/versions-modes.test.js — an official version's modes (act3 autochess config.modes): all 26 carry a coherent round
// table (templates, boss/hidden rounds, spRounds, enemy scale, stages), the lobby's difficulty maps to the version's
// official mode ids (officialModeId: the solo ladder is mode_single_1 … 20), and representative modes run a match to PREP.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, setData, resetData } from '../server/data.js';
import { officialModeId } from '../shared/versions.js';
import { makeMatch } from './match/harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
const data = loadData(DIR, { log: quiet });

after(() => resetData());

test('all 26 modes have a coherent round table, stages and enemy scale', () => {
  const modes = data.config.modes;
  assert.equal(Object.keys(modes).length, 26);
  const diffs = ['FUNNY', 'NORMAL', 'HARD', 'ABYSS'];
  for (const d of diffs) assert.ok(officialModeId(data.config, 'coop', d) in modes, `coop ${d}`);
  assert.deepEqual(diffs.map((d) => officialModeId(data.config, 'solo', d)), ['mode_single_1', 'mode_single_5', 'mode_single_9', 'mode_single_15']);
  assert.equal(officialModeId(data.config, 'solo', 'FUNNY'), 'mode_single_1', 'the solo ladder starts at level 1');
  for (const [id, m] of Object.entries(modes)) {
    assert.ok(m.lastRound >= 4 && m.lastRound <= 20, `${id}: lastRound`);
    assert.ok(m.bossRound >= 4 && m.bossRound <= m.lastRound, `${id}: bossRound`);
    if (m.hiddenRound != null) assert.equal(m.hiddenRound, m.bossRound + 1, `${id}: hiddenRound`);
    assert.ok(Array.isArray(m.stages) && m.stages.length > 0, `${id}: stages`);
    for (const s of m.stages) assert.ok(data.stages[s], `${id}: stage ${s} exists`);
    for (let r = 1; r <= m.lastRound; r++) {
      const rd = m.rounds?.[String(r)];
      assert.ok(rd, `${id}: round ${r}`);
      if (rd.template) assert.ok(data.waves[rd.template], `${id} R${r}: template ${rd.template}`);
      else {
        assert.ok(rd.bossTemplates && Object.keys(rd.bossTemplates).length, `${id} R${r}: boss templates`);
        for (const w of Object.values(rd.bossTemplates)) assert.ok(data.waves[w], `${id} R${r}: boss template ${w}`);
      }
      assert.ok(m.enemyScale?.[String(r)], `${id} R${r}: enemy scale`);
    }
    for (const r of m.spRounds || []) assert.ok(r >= 1 && r <= m.lastRound, `${id}: spRound ${r}`);
  }
});

test('representative modes run a match to PREP with their own rounds, stages and mode id', () => {
  setData(data);
  const modes = data.config.modes;
  const cases = [
    { modeId: 'mode_single_funny', mode: 'solo', humans: 1, bots: 0 },
    { modeId: 'mode_single_1', mode: 'solo', humans: 1, bots: 0 },
    { modeId: 'mode_single_9', mode: 'solo', humans: 1, bots: 0 },
    { modeId: 'mode_multi_abyss', mode: 'coop', humans: 1, bots: 3 },
  ];
  for (const c of cases) {
    const m = modes[c.modeId];
    const h = makeMatch({ data, mode: c.mode, difficulty: m.difficulty, modeId: c.modeId, humans: c.humans, bots: c.bots, seed: 7 });
    h.start();
    h.autoHumans();
    h.toPrep(1);
    assert.equal(h.m.modeId, c.modeId);
    assert.equal(h.m.gd.lastRound, m.lastRound, `${c.modeId}: lastRound`);
    assert.equal(h.m.gd.bossRound, m.bossRound, `${c.modeId}: bossRound`);
    assert.equal(h.m.gd.hiddenRound, m.hiddenRound ?? null, `${c.modeId}: hiddenRound`);
    assert.deepEqual(h.m.gd.spRounds(), m.spRounds || [], `${c.modeId}: spRounds`);
    assert.ok(m.stages.includes(h.m.stageId), `${c.modeId}: stage ${h.m.stageId} of the mode`);
    h.invariants();
  }
});
