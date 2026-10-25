// 成就统计 (ui/achievementModel.js + ui/achievements.js): the panel's aggregates are derived from the same match
// records the stats page reads, so the tests feed plain record rows and check what the panel shows — what counts,
// what is left out (modded / test / an empty quit), and the small pure helpers (the peak-bond record, the 2×3 bond
// list, a bond's operators, the server+local record union). No browser, no storage.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  achievementStats, achievementsOf, bondOperators, recordBonds, mergeRecords, ACHIEVEMENTS, HEX_TITLES,
} from '../../public/js/ui/achievementModel.js';

const lineup = [{ id: 'chess_char_1_01_a', tier: 6, items: [] }, { id: 'chess_char_1_02_a', tier: 3, items: ['item_1'] }];
const bonds = [
  { bondId: 'yanShip', layers: 3, active: true },
  { bondId: 'sargonShip', layers: 5, active: true },
  { bondId: 'victoriaShip', layers: 2, active: false },
];

/**
 * A settled/quit record with one player row (the shape shared/stats.js normalizes to).
 * @param {number} n @param {{ [k: string]: any }} [o] @param {{ [k: string]: any }} [p]
 */
function rec(n, o = {}, p = {}) {
  const player = {
    playerId: 'p1', seat: 0, name: '博士', isBot: false, left: false, alive: true, victory: true, roundsPassed: 10,
    eliminatedRound: null, lp: 3, bandId: 'band_a', title: { id: 'comment_1' }, trophies: 0,
    lineup, bonds, stats: { kills: 100, bossDamage: 1000, perfectRounds: 2, merges: 3, gold: 50 },
    ...p,
  };
  return {
    id: `r${n}`, t: 1000 - n, v: 2, end: 'settled', victory: true, roundsPassed: 10, hiddenReached: false,
    hiddenCleared: false, difficulty: 'FUNNY', modeId: 'mode_multi_1', roomMode: 'coop', durationMs: 1.8e6,
    content: null, selfId: 'p1', players: [player], ...o,
  };
}

describe('成就统计 aggregates (achievementStats)', () => {
  test('empty history: every achievement at zero, nothing achieved', () => {
    const s = achievementStats([]);
    assert.equal(s.count, 0);
    assert.equal(s.achieved, 0);
    assert.equal(s.achievements.length, ACHIEVEMENTS.length);
    assert.equal(s.achievements.length, 30);
    assert.ok(s.achievements.every((a) => !a.done && a.current === 0 && a.frac === 0));
    assert.equal(s.best, null);
    assert.deepEqual(s.modes.coop, { games: 0, wins: 0, hard: 0 });
  });

  test('counts a settled match, a quit that cleared a round, not an empty quit / a modded / a test match', () => {
    const s = achievementStats([
      rec(1),
      rec(2, { end: 'quit', victory: false }, { victory: false, roundsPassed: 1 }),
      rec(3, { end: 'quit', victory: false }, { victory: false, roundsPassed: 0, alive: true }),
      rec(4, { content: { cs: 'cs_1', plugins: ['x@1'] } }),
      rec(5, { test: true }),
    ]);
    assert.equal(s.count, 2);
    assert.equal(s.modes.coop.games, 2);
    assert.equal(s.modes.coop.wins, 1);
  });

  test('the 含插件对局 switch: the modded count is reported, and withModded counts it', () => {
    const rows = [rec(1), rec(2, { content: { cs: 'cs_1', plugins: ['x@1'] } })];
    const off = achievementStats(rows);
    assert.equal(off.count, 1, 'unofficial matches stay out by default');
    assert.equal(off.modded, 1, 'the switch reports how many matches it governs');
    const on = achievementStats(rows, { withModded: true });
    assert.equal(on.count, 2, 'the switch takes them in');
    assert.equal(on.modded, 1);
    assert.equal(on.modes.coop.games, 2);
  });

  test('wins, clears per difficulty, hours, hidden core and hidden-core-in-ABYSS', () => {
    const s = achievementStats([
      rec(1, { difficulty: 'HARD', hiddenCleared: true, durationMs: 7.2e6 }, { victory: true }),
      rec(2, { difficulty: 'ABYSS', hiddenCleared: true, durationMs: 2.88e7 }, { victory: true }),
      rec(3, { difficulty: 'FUNNY', hiddenCleared: false }, { victory: false, alive: false, roundsPassed: 4 }),
    ]);
    const by = Object.fromEntries(s.achievements.map((a) => [a.id, a]));
    assert.equal(s.modes.coop.games, 3);
    assert.equal(s.modes.coop.wins, 2);
    assert.equal(s.modes.coop.hard, 2, 'HARD and ABYSS wins are 绝境突破, FUNNY is not');
    assert.ok(by.clear_HARD.done && by.clear_ABYSS.done && !by.clear_FUNNY.done);
    assert.equal(by.hidden_1.done, true);
    assert.equal(by.hidden_10.current, 2, 'two hidden cores, 2 of 10');
    assert.equal(by.hidden_abyss.current, 1);
    assert.equal(by.hours_10.current, 10, '2 h + 8 h');
    assert.equal(by.hours_10.done, true);
    assert.equal(by.games_1.done, true);
    assert.equal(by.games_10.done, false);
  });

  test('combat totals and the per-match maxima read the settled stat blocks only', () => {
    const s = achievementStats([
      rec(1, {}, { stats: { kills: 600, bossDamage: 5e5, perfectRounds: 5, merges: 4, gold: 120 } }),
      rec(2, {}, { stats: { kills: 400, bossDamage: 6e5, perfectRounds: 3, merges: 6, gold: 80 } }),
      rec(3, { end: 'quit', victory: false }, { victory: false, roundsPassed: 2, stats: { kills: 9999, gold: 999 } }),
    ]);
    assert.deepEqual(s.maxima, { gold: 120, merges: 6, kills: 600 });
    const by = Object.fromEntries(s.achievements.map((a) => [a.id, a]));
    assert.equal(by.kills_1000.current, 1000);
    assert.equal(by.boss_1m.current, 1_000_000, 'progress is clamped to the goal');
    assert.equal(by.merges_200.current, 10);
    const d = s.achievements.find((a) => a.id === 'kills_1000');
    assert.equal(d.frac, 1);
    assert.equal(d.done, true);
  });

  test('trophies, titles (only the six 评语) and the strategy kinds', () => {
    const s = achievementStats([
      rec(1, {}, { trophies: 4, title: { id: 'comment_3' }, bandId: 'band_a' }),
      rec(2, {}, { trophies: 2, title: { id: 'comment_3' }, bandId: 'band_b' }),
      rec(3, {}, { trophies: 1, title: { id: 'comment_9' }, bandId: 'band_b' }), // not one of the six
    ]);
    assert.equal(s.trophies, 7);
    assert.equal(s.titles.comment_3, 2);
    assert.equal(s.topBands[0].bandId, 'band_b');
    assert.equal(s.topBands[0].games, 2);
    assert.equal(HEX_TITLES.length, 6);
    const by = Object.fromEntries(s.achievements.map((a) => [a.id, a]));
    assert.equal(by.titles_6.current, 1);
    assert.equal(by.bands_10.current, 2);
  });

  test('the peak-bond record ignores compact rows and bonds whose layers are never shown', () => {
    const s = achievementStats([
      rec(1, {}, { bonds: [{ bondId: 'yanShip', layers: 5, active: true }, { bondId: 'sargonShip', layers: 2, active: true }] }),
      rec(2, {}, { bonds: [{ bondId: 'victoriaShip', layers: 8, active: true }] }),
    ], { hiddenLayers: (id) => id === 'victoriaShip' });
    assert.equal(s.best.bondId, 'yanShip');
    assert.equal(s.best.layers, 5);
    // the compact row keeps counts but offers no lineup/bond record
    const compact = achievementStats([rec(3, { compact: true }, { bonds: [] })]);
    assert.equal(compact.best, null);
    assert.equal(compact.count, 1);
    assert.equal(compact.detailed, 0);
  });

  test('the same record id twice counts once (the server and the local copy)', () => {
    const s = achievementStats([rec(1), rec(1), rec(2)]);
    assert.equal(s.count, 2);
  });
});

describe('achievement progress rows (achievementsOf)', () => {
  test('current is clamped to the goal, done at or past it, frac in [0, 1]', () => {
    const rows = achievementsOf({ games: 12, hours: 0, wins: 0, hidden: 0, hiddenAbyss: 0, clears: {}, sums: {}, modes: { solo: { games: 0, wins: 0, hard: 0 }, coop: { games: 0, wins: 0, hard: 0 } }, trophies: 0, bandKinds: 0, titleKinds: 0 });
    const g1 = rows.find((a) => a.id === 'games_1');
    const g10 = rows.find((a) => a.id === 'games_10');
    assert.deepEqual([g1.current, g1.done, g1.frac], [1, true, 1]);
    assert.deepEqual([g10.current, g10.done], [10, true]);
    const g50 = rows.find((a) => a.id === 'games_50');
    assert.deepEqual([g50.current, g50.done, Math.round(g50.frac * 100)], [12, false, 24]);
  });
});

describe('the record helpers', () => {
  test('recordBonds: active first, then layers, at most six, a noStack bond marked hidden', () => {
    const list = recordBonds([
      { bondId: 'a', layers: 1, active: false }, { bondId: 'b', layers: 2, active: true },
      { bondId: 'c', layers: 9, active: false }, { bondId: 'd', layers: 0, active: false },
      { bondId: 'e', layers: 3, active: true }, { bondId: 'f', layers: 4, active: false },
      { bondId: 'g', layers: 5, active: false },
    ], (id) => id === 'c');
    assert.equal(list.length, 6);
    assert.deepEqual(list.map((b) => b.bondId), ['e', 'b', 'g', 'f', 'a', 'c'], 'active first, then layers, hidden last');
    assert.equal(list.find((b) => b.bondId === 'c').hidden, true);
    assert.equal(list.find((b) => b.bondId === 'd'), undefined, '0 layers and inactive is not a record');
  });

  test('bondOperators: plain records only, one per operator, by tier', () => {
    const chess = [
      { chessId: 'c5', charId: 'op_c', tier: 5, bonds: ['b'] },
      { chessId: 'c1', charId: 'op_a', tier: 1, bonds: ['b'] },
      { chessId: 'c1g', charId: 'op_a', tier: 1, bonds: ['b'], isGolden: true },
      { chessId: 'c2', charId: 'op_a', tier: 2, bonds: ['b'] }, // the same operator, a higher tier
      { chessId: 'c3', charId: 'op_b', tier: 3, bonds: ['b'], isHidden: true },
      { chessId: 'c4', charId: 'op_d', tier: 4, bonds: ['other'] },
      { chessId: 'c6', charId: 'op_e', tier: 6, bonds: ['b'], isDiy: true },
    ];
    assert.deepEqual(bondOperators(chess, 'b').map((c) => c.chessId), ['c1', 'c5'], 'op_a appears once (its lower tier)');
  });

  test('mergeRecords: one row per id, newest first, server rows and local rows together', () => {
    const merged = mergeRecords([{ id: 'a', t: 100 }, { id: 'c', t: 300 }], [{ id: 'a', t: 100 }, { id: 'b', t: 200 }]);
    assert.deepEqual(merged.map((r) => r.id), ['c', 'b', 'a']);
    assert.equal(mergeRecords(null, null).length, 0);
  });
});
