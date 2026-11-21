// Owner-reported original-game recording (2026-11-12, upstream round 83 #969): moving a summoner keeps its placed
// summons on tiles its final range still covers — identity, facing and stack counts unchanged; only the summons the
// final placement range excludes go back onto their stack. The old PRTS help ("移动干员时，其所属召唤物全部退场并重置至
// 手牌区") still describes recalling all of them; the recordings outrank it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, makeMatch, give, checkInvariants } from './harness.js';

const board = (row, col) => ({ area: 'board', row, col });
const move = (h, piece, to, dir = 'RIGHT') => h.m.handle('p_0', { t: 'g.move', uid: piece.uid, to, dir });
const stackOf = (ps, owner) => [...ps.hand, ...ps.temp].find((p) => p?.kind === 'token' && p.ownerUid === owner.uid);

function prep(t) {
  const h = makeMatch({ mode: 'solo', seed: 11, seats: [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }] }).start();
  t.after(() => h.m.dispose());
  h.toPrep(1);
  h.setStage('act2autochess_m04');
  return { h, ps: h.ps('p_0') };
}

/** A chess record's normal form, handed to the player. */
function owner(h, ps, charId) {
  const rec = Object.values(ps.gd.raw.chess).find((r) => r.charId === charId && !r.isGolden);
  assert.ok(rec, charId);
  return give(h.m, ps, rec.chessId);
}

test('凯瑟琳: an unrestricted summon keeps identity, facing and stack counts when its owner moves', (t) => {
  const { h, ps } = prep(t);
  const DEVICE = 'token_10041_cathy_catsld';
  const cath = owner(h, ps, 'char_4162_cathy');
  const melee = [...ps.deployMap()].filter(([, cls]) => cls === 'melee').map(([k]) => k.split(',').map(Number));
  assert.ok(melee.length >= 4, 'four melee tiles');
  assert.deepEqual(move(h, cath, board(...melee[0])), { ok: true });
  const stack = stackOf(ps, cath);
  assert.ok(stack && stack.count >= 2, 'the device stack is in the hand');
  assert.deepEqual(move(h, stack, board(...melee[1]), 'LEFT'), { ok: true });
  const key = melee[1].join(',');
  const placed = ps.board.get(key);
  assert.ok(placed && placed.kind === 'token' && placed.id === DEVICE);
  const before = structuredClone(placed);
  const remaining = stack.count;
  assert.deepEqual(move(h, cath, board(...melee[2]), 'UP'), { ok: true });
  assert.equal(ps.board.get(key), placed, 'the placed device stayed');
  assert.deepEqual(placed, before, 'identity, facing and count unchanged');
  assert.equal(stackOf(ps, cath)?.count, remaining, 'the unplaced stack gained no copy');
  const input = ps.battleInput({ side: 'L', colOffset: 0 });
  const token = input.units.find((u) => u.uid === placed.uid);
  assert.equal(token.ownerUid, cath.uid);
  assert.deepEqual([token.row, token.col, token.dir], [...melee[1], 'LEFT']);
  const view = ps.privateView().board.find((p) => p.uid === placed.uid);
  assert.deepEqual([view.ownerUid, view.row, view.col, view.dir, view.count], [cath.uid, ...melee[1], 'LEFT', 1]);
  checkInvariants(h.m);
});

test('伺夜: a range-bound wolf stays on a still-valid tile after moving, and returns exactly once when the final range excludes it', (t) => {
  const { h, ps } = prep(t);
  const WOLF = 'token_10028_vigil_wolf';
  const vigil = owner(h, ps, 'char_427_vigil');
  assert.deepEqual(move(h, vigil, board(10, 4)), { ok: true });
  assert.deepEqual(move(h, stackOf(ps, vigil), board(11, 5), 'DOWN'), { ok: true });
  const wolf = ps.board.get('11,5');
  assert.equal(wolf?.id, WOLF);
  assert.deepEqual(move(h, vigil, board(10, 3)), { ok: true });
  assert.equal(ps.board.get('11,5'), wolf, 'still inside the new range');
  assert.equal(wolf.dir, 'DOWN');
  assert.equal(stackOf(ps, vigil), undefined);
  checkInvariants(h.m);
  assert.deepEqual(move(h, vigil, board(10, 7)), { ok: true });
  assert.equal(ps.board.get('11,5'), undefined);
  assert.equal(stackOf(ps, vigil), wolf, 'the invalid summon returned exactly once');
  assert.equal(wolf.count, 1);
  checkInvariants(h.m);
});
