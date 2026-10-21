import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getData } from '../../server/data.js';
import { GameData } from '../../server/match/gamedata.js';
import { setupMatchWaves } from '../../server/match/waves.js';
import { createRng } from '../../server/sim/rng.js';
import { PHASE } from '../../shared/constants.js';
import { makeMatch } from './harness.js';

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

test('a band grantUnit grants one special chess to every human, once, and it cannot be sold', () => {
  const data = structuredClone(getData());
  data.bands.band_x_test_touch = {
    ...data.bands.band_amiya, bandId: 'band_x_test_touch', name: 'Test Touch',
    grants: { team: true, grantUnit: { charId: 'char_1052_kalts2', skill: 2, skillLocked: true } },
  };
  const h = makeMatch({ mode: 'coop', humans: 2, data }).start();
  const m = h.m;
  for (const ps of m.players.values()) if (!ps.isBot) m.handle(ps.playerId, { t: 'g.infoReady' });
  h.run(() => m.phase === PHASE.BAND_DRAFT);
  assert.equal(m.phase, PHASE.BAND_DRAFT);
  const p0 = h.ps('p_0'), p1 = h.ps('p_1');
  assert.deepEqual(m._applyBand(p0, 'band_x_test_touch'), undefined);
  const special = (ps) => [...ps.hand, ...ps.temp, ...ps.board.values()].filter((x) => x?.meta?.special === 'band:band_x_test_touch');
  assert.equal(special(p0).length, 1);
  assert.equal(special(p1).length, 1);
  assert.equal(special(p0)[0].id, 'chess_char_1052_kalts2_a');
  assert.equal(special(p0)[0].unsellable, true);
  m._applyBand(p1, 'band_x_test_touch');
  assert.equal(special(p0).length, 1);
  assert.equal(special(p1).length, 1);
  m.dispose();
});

test('an amedicSlot grant starts on Touch\'s stage slot instead of in the hand', () => {
  const data = structuredClone(getData());
  data.bands.band_x_test_touch = {
    ...data.bands.band_amiya, bandId: 'band_x_test_touch', name: 'Test Touch slot',
    grants: { team: false, grantUnit: { charId: 'char_1052_kalts2', placement: 'amedicSlot' } },
  };
  const h = makeMatch({ mode: 'coop', humans: 1, data }).start();
  const m = h.m, ps = h.ps('p_0');
  m.handle('p_0', { t: 'g.infoReady' });
  h.run(() => m.phase === PHASE.BAND_DRAFT);
  assert.equal(m._applyBand(ps, 'band_x_test_touch'), undefined);
  const slot = m.amedicSlot();
  assert.ok(slot, 'the stage has the reserve-medic slot');
  const key = `${slot.pos[0]},${slot.pos[1]}`;
  assert.equal(ps.board.get(key)?.meta?.special, 'band:band_x_test_touch');
  ps.recompute();
  assert.equal(ps.board.get(key)?.meta?.special, 'band:band_x_test_touch', 'the stage slot is exempt from eviction');
  assert.equal([...ps.hand, ...ps.temp].some((p) => p?.meta?.special === 'band:band_x_test_touch'), false);
  assert.deepEqual(m.prepMapChars(ps), [], 'the reserve medic is not drawn under the grant');
  ps.board.delete(key);
  ps.recompute();
  assert.deepEqual(m.prepMapChars(ps), [], 'moving the grant does not bring the reserve medic back');
  m.dispose();
});

test('a hidden grantUnit chess is not in the shop pool but still fills the stage slot', () => {
  const data = structuredClone(getData());
  const base = data.chess.chess_char_1052_kalts2_a;
  data.chess.chess_char_hidden_test_a = {
    ...base, chessId: 'chess_char_hidden_test_a', baseId: 'chess_char_hidden_test_a', goldenId: 'chess_char_hidden_test_b',
    charId: 'char_hidden_test', name: 'Hidden special', isGolden: false, visible: false, isHidden: true, isDiy: false,
    backup: { ...base.backup, charId: 'char_hidden_test' },
  };
  data.bands.band_x_test_hidden = {
    ...data.bands.band_amiya, bandId: 'band_x_test_hidden', name: 'Test hidden grant',
    grants: { team: false, grantUnit: { charId: 'char_hidden_test', placement: 'amedicSlot' } },
  };
  const h = makeMatch({ mode: 'coop', humans: 1, data }).start();
  const m = h.m, ps = h.ps('p_0');
  m.handle('p_0', { t: 'g.infoReady' });
  h.run(() => m.phase === PHASE.BAND_DRAFT);
  assert.equal(m._applyBand(ps, 'band_x_test_hidden'), undefined);
  const slot = m.amedicSlot();
  assert.equal(ps.board.get(`${slot.pos[0]},${slot.pos[1]}`)?.id, 'chess_char_hidden_test_a', 'the hidden grant still reaches the stage slot');
  assert.equal(m.gd.visibleChess.includes('chess_char_hidden_test_a'), false, 'the hidden grant is not a shop-pool chess');
  assert.equal([...ps.hand, ...ps.temp].some((p) => p?.id === 'chess_char_hidden_test_a'), false);
  m.dispose();
});

test('eliteGate upgrades a granted special unit only with enough other elites', () => {
  const data = structuredClone(getData());
  data.bands.band_x_test_touch = {
    ...data.bands.band_amiya, bandId: 'band_x_test_touch',
    grants: { team: false, grantUnit: { charId: 'char_1052_kalts2' }, eliteGate: { others: 2, at: 'battleStart' } },
  };
  const h = makeMatch({ mode: 'coop', humans: 1, data }).start();
  const m = h.m, ps = h.ps('p_0');
  m.handle('p_0', { t: 'g.infoReady' });
  h.run(() => m.phase === PHASE.BAND_DRAFT);
  m._applyBand(ps, 'band_x_test_touch');
  const special = [...ps.hand, ...ps.temp].find((x) => x?.meta?.special === 'band:band_x_test_touch');
  assert.ok(special);
  ps.board.set('9,3', special);
  ps.board.set('9,4', ps.newPiece('chess', 'chess_char_1052_kalts2_b'));
  m.applyBandEliteGate(ps);
  assert.equal(special.id, 'chess_char_1052_kalts2_a', 'one other elite is not enough');
  ps.board.set('9,5', ps.newPiece('chess', 'chess_char_1052_kalts2_b'));
  m.applyBandEliteGate(ps);
  assert.equal(special.id, 'chess_char_1052_kalts2_b');
  m.dispose();
});

test('restEndBondLayers grants active-bond layers once and respects maxCount', () => {
  const data = structuredClone(getData());
  data.bands.band_x_test_touch = {
    ...data.bands.band_amiya, bandId: 'band_x_test_touch',
    grants: { team: false, grantUnit: { charId: 'char_1052_kalts2' }, restEndBondLayers: { layers: 3, activeOnly: true, cap: 'maxCount' } },
  };
  const h = makeMatch({ mode: 'coop', humans: 1, data }).start();
  const m = h.m, ps = h.ps('p_0');
  m.handle('p_0', { t: 'g.infoReady' });
  h.run(() => m.phase === PHASE.BAND_DRAFT);
  m._applyBand(ps, 'band_x_test_touch');
  const special = [...ps.hand, ...ps.temp].find((x) => x?.meta?.special === 'band:band_x_test_touch');
  ps.board.set('9,3', special);
  ps.bonds = { deputShip: { active: true } };
  ps.layers = { deputShip: 0 };
  m.applyBandRestLayers(ps);
  const cap = data.bonds.deputShip.maxCount;
  assert.equal(ps.layers.deputShip, Math.min(3, cap ?? 3));
  m.dispose();
});

test('restEndRandomChess grants count random operators in the 1-4 tier range', () => {
  const data = structuredClone(getData());
  data.bands.band_x_test_touch = {
    ...data.bands.band_amiya, bandId: 'band_x_test_touch',
    grants: { team: false, restEndRandomChess: { minTier: 1, maxTier: 4, count: 1 } },
  };
  const h = makeMatch({ mode: 'coop', humans: 1, data }).start();
  const m = h.m, ps = h.ps('p_0');
  m.handle('p_0', { t: 'g.infoReady' });
  h.run(() => m.phase === PHASE.BAND_DRAFT);
  m._applyBand(ps, 'band_x_test_touch');
  const before = ps.allChess().length;
  const got = m.applyBandRestRandomChess(ps);
  assert.equal(got.length, 1);
  assert.ok(ps.allChess().length >= before + 1);
  assert.ok(ps.gd.tierOf(got[0].id) >= 1 && ps.gd.tierOf(got[0].id) <= 4, 'tier 1-4 only');
  assert.ok(!String(got[0].id).startsWith('char_x_'), 'the plugin special unit is not in the random pool');
  m.dispose();
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
