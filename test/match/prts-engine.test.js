import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getData } from '../../server/data.js';
import { GameData } from '../../server/match/gamedata.js';
import { setupMatchWaves } from '../../server/match/waves.js';
import { createRng } from '../../server/sim/rng.js';

const boss = (id, enemyKey, extra = {}) => ({ bossId: id, enemyKey, name: id, weight: 1, bloodPoint: { NORMAL: 1000 }, ...extra });

test('a content boss can own its hidden variant, overriding the random hidden draw', () => {
  const data = structuredClone(getData());
  const mode = data.config.modes.mode_single_normal;
  data.bosses.boss_x_test_prts = boss('boss_x_test_prts', 'enemy_1422_lrsldr', { hiddenBossId: 'boss_x_test_prts_hidden' });
  data.bosses.boss_x_test_prts_hidden = boss('boss_x_test_prts_hidden', 'enemy_1422_lrsldr');
  data.bosses.boss_x_test_other = boss('boss_x_test_other', 'enemy_1422_lrsldr');
  mode.hiddenRound = 15;
  mode.bossWeights = { boss_x_test_prts: 1 };
  mode.hiddenBossWeights = { boss_x_test_other: 100, boss_x_test_prts_hidden: 1 };
  const gd = new GameData(data, 'mode_single_normal');
  const setup = setupMatchWaves(gd, createRng(1234));
  assert.equal(setup.bossId, 'boss_x_test_prts');
  assert.equal(setup.hiddenBossId, 'boss_x_test_prts_hidden');
});

test('a band with bossIds is offered only in the matching leader room', () => {
  const data = structuredClone(getData());
  const band = data.bands.band_amiya;
  data.bands.band_x_test_prts = { ...band, bandId: 'band_x_test_prts', bossIds: ['boss_x_test_prts'] };
  const gd = new GameData(data, 'mode_single_normal');
  gd.bossId = 'boss_x_test_prts';
  assert.equal(gd.bandAllowed('band_x_test_prts'), true);
  gd.bossId = 'boss_x_test_other';
  assert.equal(gd.bandAllowed('band_x_test_prts'), false);
  assert.equal(gd.bandIds().includes('band_x_test_prts'), false);
});
