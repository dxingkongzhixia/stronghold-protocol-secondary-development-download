// test/versions-treasure.test.js — 寻宝人's 模拟宝藏 (band_treasure): while the mark exists its tile cannot be deployed on
// (`band_treasure` skill text 「使所在格无法部署」). Only the treasure tag blocks; the other player-level marks do not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerState } from '../server/match/PlayerState.js';

function player(marks) {
  const ps = Object.create(PlayerState.prototype);
  ps.bandGlobal = marks;
  ps.deployMap = () => new Map([['10,6', 'melee'], ['10,7', 'melee']]);
  ps._placementOf = () => 'melee';
  ps.summonRange = () => null;
  ps.summonExcluded = () => null;
  return ps;
}
const piece = { kind: 'chess', id: 'chess_test_a' };

test('寻宝人: the 模拟宝藏 tile refuses every placement; other tiles stay free', () => {
  const ps = player([{ tag: 'treasure', row: 10, col: 6, enemyId: 'enemy_9038_achest', coin: 1 }]);
  assert.equal(ps._treasureTile(10, 6), true);
  assert.equal(ps._legal(piece, 10, 6), false, 'the treasure tile is blocked');
  assert.equal(ps._legal(piece, 10, 7), true, 'the next tile is free');
});

test('another player-level mark (a fear tile) does not block placement', () => {
  const ps = player([{ tag: 'fear_tile', row: 10, col: 6, fear: 3 }]);
  assert.equal(ps._treasureTile(10, 6), false);
  assert.equal(ps._legal(piece, 10, 6), true);
});
