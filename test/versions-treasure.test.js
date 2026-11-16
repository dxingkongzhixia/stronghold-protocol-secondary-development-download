// test/versions-treasure.test.js — 寻宝人's 模拟宝藏 (band_treasure): while the mark exists its tile cannot be deployed on
// (`band_treasure` skill text 「使所在格无法部署」). Only the treasure tag blocks; the other player-level marks do not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerState } from '../server/match/PlayerState.js';
import { Match } from '../server/match/Match.js';
import { PHASE } from '../shared/constants.js';
import { canPlace } from '../public/js/ui/gameLogic/placement.js';

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

test('client placement preview: m.private.treasureTiles refuses the same tile', () => {
  const ctx = {
    editable: true,
    pieces: new Map([[1, { piece: { kind: 'chess', id: 'chess_test_a', uid: 1 }, area: 'hand', idx: 0 }]]),
    boardAt: new Map(), handAt: new Map(), cap: 8, count: 0,
    deploy: { melee: new Set(['10,6', '10,7']), ranged: new Set() },
    treasureTiles: new Set(['10,6']),
    getChess: () => ({ position: 'MELEE' }), getToken: () => null, getItem: () => null, backups: null, priv: {},
  };
  assert.equal(canPlace(ctx, 1, { area: 'board', row: 10, col: 6 }).ok, false, 'the treasure tile');
  assert.equal(canPlace(ctx, 1, { area: 'board', row: 10, col: 7 }).ok, true, 'the next tile');
});

test('prep visibility: the 模拟宝藏 is a read-only unit on its tile', () => {
  const m = Object.create(Match.prototype);
  m.phase = PHASE.PREP;
  m.teamMedicGranted = () => false; // no reserve medic: the treasure must still show
  m.gd = { enemy: (id) => ({ name: '模拟宝藏', iconId: id, spine: id }) };
  const ps = { alive: true, seat: 0, playerId: 'p1', bandGlobal: [{ tag: 'treasure', row: 10, col: 6, enemyId: 'enemy_9038_achest' }] };
  const out = m.prepMapChars(ps);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].defId, out[0].x, out[0].y, out[0].kind, out[0].side], ['enemy_9038_achest', 6, 10, 'enemy', 'enemy']);
  assert.deepEqual(m.prepMapChars({ ...ps, bandGlobal: [] }), [], 'nothing without a treasure');
});
