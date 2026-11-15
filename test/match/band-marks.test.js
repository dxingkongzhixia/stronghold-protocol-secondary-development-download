// test/match/band-marks.test.js — the battle input a band-skill mark changes (PlayerState.bandMarks → battleInput):
// 全场聚焦 fields the elite form, 消解空间 resolves the hand's rightmost operator into the summon, and the marks
// last for one round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, give } from './harness.js';

function prep() {
  const h = makeMatch({ mode: 'solo', humans: 1, seed: 7, fake: true }).start();
  h.toPrep(1);
  const ps = h.ps('p_0');
  ps.bandMarks = {};
  return { h, m: h.m, ps };
}

test('battle_upgrade fields the elite form for the battle', () => {
  const { m, ps } = prep();
  const piece = give(m, ps, 'chess_char_1_01_a', 'board', [10, 4]);
  const golden = m.gd.goldenIdOf(piece.id);
  assert.ok(m.gd.chess(golden), 'the elite record exists');
  ps.addBandMark(piece.uid, { tag: 'battle_upgrade' });
  const u = ps.battleInput().units.find((x) => x.uid === piece.uid);
  assert.equal(u.chessId, golden);
  assert.equal(u.marks[0].tag, 'battle_upgrade');
  // the owned piece is unchanged: the upgrade lasts one battle
  assert.equal(piece.id, 'chess_char_1_01_a');
});

test('knockdown_summon carries the hand\'s rightmost operator', () => {
  const { m, ps } = prep();
  const piece = give(m, ps, 'chess_char_1_01_a', 'board', [10, 4]);
  const bench = give(m, ps, 'chess_char_1_01_a', 'hand', 0);
  ps.addBandMark(piece.uid, { tag: 'knockdown_summon' });
  const u = ps.battleInput().units.find((x) => x.uid === piece.uid);
  assert.equal(u.marks[0].summon.chessId, bench.id);
  assert.ok(u.marks[0].summon.skillIndex === null || Number.isInteger(u.marks[0].summon.skillIndex)
    || u.marks[0].summon.diy || u.marks[0].summon.standIn, 'its loadout travels along');
  assert.notEqual(u.marks[0].summon.uid, piece.uid);
});

test('a shop-upgrade discount is taken once, off the current level', () => {
  const { ps } = prep();
  ps.shop.level = 2;
  ps.shop.upgradePrice = 5;
  ps.funds = 10;
  ps.shopUpDiscount = { value: 3, level: 2 };
  assert.deepEqual(ps.levelUp(), { ok: true });
  assert.equal(ps.funds, 8, '5 - 3');
  assert.equal(ps.shopUpDiscount.value, 0, 'spent');
  assert.equal(ps.shop.level, 3);
});

test('player-level marks travel in battleInput and are spent at the next round start', () => {
  const { h, ps } = prep();
  ps.addBandGlobal({ tag: 'fear_tile', row: 10, col: 5, fear: 3 });
  ps.addBandGlobal({ tag: 'treasure', row: 10, col: 6, enemyId: 'enemy_9038_achest', coin: 1 });
  assert.deepEqual(ps.battleInput().bandMarks.map((m) => m.tag), ['fear_tile', 'treasure']);
  h.toPrep(2);
  assert.equal(ps.battleInput().bandMarks, undefined);
});

test('the marks are spent at the next round start', () => {
  const { h, m, ps } = prep();
  const piece = give(m, ps, 'chess_char_1_01_a', 'board', [10, 4]);
  ps.addBandMark(piece.uid, { tag: 'battle_upgrade' });
  assert.ok(ps.bandMarks[piece.uid]);
  h.toPrep(2);
  assert.equal(ps.bandMarks[piece.uid], undefined);
  assert.equal(ps.battleInput().units.find((x) => x.uid === piece.uid).chessId, piece.id, 'the base form again');
});
