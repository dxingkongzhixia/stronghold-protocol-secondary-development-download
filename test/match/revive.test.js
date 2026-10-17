// test/match/revive.test.js — 分血救援 (REVIVE, owner 2026-10-17; retuned to 1 LP). In co-op a teammate whose 目标生命值
// hits 0 is DOWNED (board / hand / funds frozen, spectating) instead of eliminated; ANY living human teammate may hand
// over ONE of his own LP in 休整期 and that single point brings him back with LP 1. Rescue is voluntary (nobody owes it),
// each teammate may give at most one point per downing, and the same player can be rescued at most REVIVE.MAX times.
// Bots and solo keep the old permanent elimination; once no living human is left every body is eliminated for good.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { REVIVE } from '../../shared/constants.js';

const clean = () => ({ leaked: [], perfect: true, coins: 0, layerGains: {}, killed: 0, damageDealt: 0 });

/** Drop `id` to `lp` and resolve one settle with exactly one counted leak, so the LP bar hits 0. */
function settleToZero(h, id, lp = 1) {
  const ps = h.ps(id);
  ps.lp = lp;
  h.m.lastResults = new Map(h.m.order.map((p) => [p.playerId, clean()]));
  h.m.lastResults.set(id, { ...clean(), perfect: false, leaked: [{ enemyKey: 'enemy_1422_lrsldr', counted: true }] });
  h.m.settle(null, null);
  return ps;
}

function coopTwo() {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 11, fake: true });
  h.start();
  h.toPrep(1);
  return h;
}

function coopFour() {
  const h = makeMatch({ mode: 'coop', humans: 4, seed: 21, fake: true });
  h.start();
  h.toPrep(1);
  return h;
}

test('co-op: LP 0 downs a human with a living human teammate instead of eliminating him (board kept)', () => {
  const h = coopTwo();
  const p0 = h.ps('p_0');
  const pieces = p0.board.size;
  settleToZero(h, 'p_0');
  assert.equal(p0.alive, false, 'not alive');
  assert.equal(p0.downed, true, 'downed, not eliminated');
  assert.equal(p0.lp, 0);
  assert.equal(p0.eliminatedRound, null, 'elimination is not final yet');
  assert.equal(p0.reviveNeed, REVIVE.NEED, 'one point is enough');
  assert.equal(p0.revivePool, 0);
  assert.equal(p0.board.size, pieces, 'the board is frozen, never cleared');
  assert.ok(h.m.publicView().players.find((p) => p.playerId === 'p_0').downed, 'the room sees him downed');
  h.invariants();
});

test('ONE point from a teammate revives him at once with LP 1', () => {
  const h = coopTwo();
  const p0 = h.ps('p_0');
  const p1 = h.ps('p_1');
  settleToZero(h, 'p_0');
  h.toPrep(2);
  const lp1 = p1.lp;
  assert.deepEqual(h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' }), { ok: true });
  assert.equal(p1.lp, lp1 - REVIVE.DONATE, 'the donor pays exactly one');
  assert.equal(p0.alive, true, 'a single point is enough');
  assert.equal(p0.downed, false);
  assert.equal(p0.lp, 1, 'he comes back with 1 LP');
  assert.equal(p0.revivesUsed, 1);
  assert.equal(p0.revivePool, 0);
  assert.equal(p0.reviveNeed, 0);
  assert.ok(h.lastTo('p_0', 'm.private'), 'the revived player gets his own view again');
  h.invariants();
});

test('one point per teammate per downing; the floor keeps a donor alive; wrong phase / target / donor are refused', () => {
  const h = coopTwo();
  const p0 = h.ps('p_0');
  const p1 = h.ps('p_1');
  settleToZero(h, 'p_0');
  h.toPrep(2);
  // the per-donor cap (need is 1 in production, so it is exercised on a 3-point pool)
  p0.reviveNeed = 3;
  assert.deepEqual(h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' }), { ok: true });
  assert.equal(p0.alive, false, '2 points still missing');
  assert.equal(h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' }).error, 'ALREADY', 'the same teammate cannot pay twice');
  assert.equal(p0.revivePool, REVIVE.DONATE);
  p0.reviveNeed = REVIVE.NEED;
  p0.revivePool = 0;
  p0.reviveGivers = [];
  // the floor
  p1.lp = REVIVE.FLOOR;
  assert.equal(h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' }).error, 'NO_FUNDS', 'the donor keeps the floor');
  assert.equal(p1.lp, REVIVE.FLOOR, 'nothing moved');
  p1.lp = REVIVE.FLOOR + REVIVE.DONATE;
  assert.equal(h.m.handle('p_0', { t: 'g.shareHp', target: 'p_1' }).error, 'ELIMINATED', 'a downed player cannot donate');
  assert.equal(h.m.handle('p_1', { t: 'g.shareHp', target: 'p_1' }).error, 'BAD_TARGET', 'not himself');
  h.m.phase = 'COMBAT';
  assert.equal(h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' }).error, 'WRONG_PHASE', '休整期 only');
  h.m.phase = 'PREP';
  assert.deepEqual(h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' }), { ok: true });
  assert.equal(p0.alive, true);
  assert.equal(p0.lp, 1);
  assert.equal(h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' }).error, 'BAD_TARGET', 'a living teammate is no revive target');
  h.invariants();
});

test('a player can be rescued REVIVE.MAX times; the third down is final', () => {
  const h = coopTwo();
  const p0 = h.ps('p_0');
  const p1 = h.ps('p_1');
  p1.lp = 30;
  for (let i = 0; i < REVIVE.MAX; i++) {
    settleToZero(h, 'p_0');
    h.toPrep(2 + i);
    assert.deepEqual(h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' }), { ok: true }, `rescue ${i + 1}`);
    assert.equal(p0.alive, true);
    assert.equal(p0.revivesUsed, i + 1);
    p1.lp = 30;
  }
  settleToZero(h, 'p_0');
  assert.equal(p0.downed, false, 'the third down is not rescuable any more');
  assert.equal(p0.eliminatedRound, h.m.round);
  h.invariants();
});

test('solo and a co-op room without another human never down (the old elimination stays)', () => {
  for (const opts of [{ mode: 'solo', humans: 1 }, { mode: 'coop', humans: 1, bots: 1 }]) {
    const h = makeMatch({ ...opts, seed: 3, fake: true });
    h.start();
    h.toPrep(1);
    const p0 = h.ps('p_0');
    settleToZero(h, 'p_0');
    assert.equal(p0.downed, false, `${opts.mode}: no rescuer → eliminated`);
    assert.equal(p0.eliminatedRound, h.m.round);
    h.invariants();
  }
});

test('no rescue once the Final Assault took its teamLp snapshot', () => {
  const h = coopTwo();
  const p0 = h.ps('p_0');
  settleToZero(h, 'p_0');
  h.toPrep(2);
  h.m.teamLp = 40; // what startFinalAssault records
  assert.equal(h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' }).error, 'WRONG_PHASE');
  assert.equal(p0.revivePool, 0);
  h.invariants();
});

test('a simultaneous 2-player wipe eliminates both: nobody is left to pay, so no body stays rescuable', () => {
  const h = coopTwo();
  const p0 = h.ps('p_0');
  const p1 = h.ps('p_1');
  for (const id of ['p_0', 'p_1']) h.ps(id).lp = 1;
  h.m.lastResults = new Map(h.m.order.map((p) => [p.playerId, { ...clean(), perfect: false, leaked: [{ enemyKey: 'enemy_1422_lrsldr', counted: true }] }]));
  h.m.settle(null, null);
  assert.equal(p0.alive, false);
  assert.equal(p1.alive, false);
  assert.equal(p0.downed, false, 'the first one goes down only while someone could still pay');
  assert.equal(p1.downed, false);
  assert.equal(p0.eliminatedRound, 1, 'credited to the round they fell');
  h.run(() => h.ended != null);
  assert.ok(h.ended, 'the match ends');
});

// ---- 4-player rooms (the usual size) -----------------------------------------------------------------------------

test('4 players: rescue is VOLUNTARY — nobody pays and the downed player simply stays downed (board frozen)', () => {
  const h = coopFour();
  const p0 = h.ps('p_0');
  const piece = [...p0.hand.filter(Boolean), ...p0.board.values()][0] || null;
  settleToZero(h, 'p_0');
  assert.equal(p0.downed, true);
  h.toPrep(2);
  h.toPrep(3, { ready: true });
  assert.equal(p0.downed, true, 'two rounds later: still downed, nothing forced');
  assert.equal(p0.alive, false);
  assert.equal(p0.revivePool, 0, 'nobody paid a point');
  assert.equal(p0.reviveNeed, REVIVE.NEED);
  if (piece) assert.ok([...p0.hand.filter(Boolean), ...p0.board.values()].some((p) => p.uid === piece.uid), 'his pieces are still his');
  for (const id of ['p_1', 'p_2', 'p_3']) assert.ok(h.ps(id).alive, `${id} kept playing`);
  assert.equal(h.m.publicView().players.find((p) => p.playerId === 'p_0').downed, true);
  h.invariants();
});

test('4 players: ANY single survivor can pay the one point; two downed players are saved by different donors', () => {
  const h = coopFour();
  const p0 = h.ps('p_0');
  const p1 = h.ps('p_1');
  const p2 = h.ps('p_2');
  const p3 = h.ps('p_3');
  for (const p of [p0, p1, p2, p3]) p.lp = 30;
  settleToZero(h, 'p_0');
  h.toPrep(2);
  assert.deepEqual(h.m.handle('p_3', { t: 'g.shareHp', target: 'p_0' }), { ok: true }, 'the last survivor alone is enough');
  assert.equal(p0.alive, true);
  assert.equal(p0.lp, 1);
  assert.equal(p3.lp, 29);
  settleToZero(h, 'p_1');
  h.toPrep(3);
  assert.equal(p1.downed, true, 'the first helper goes down later');
  assert.deepEqual(h.m.handle('p_2', { t: 'g.shareHp', target: 'p_1' }), { ok: true });
  assert.equal(p1.alive, true, 'a second, independent rescue');
  assert.equal(p1.lp, 1);
  assert.equal(p0.alive, true);
  assert.equal(p2.lp, 29);
  h.invariants();
});

test('4 players: a full wipe eliminates the three others too — no “downed” body is left when nobody can pay', () => {
  const h = coopFour();
  for (const id of ['p_0', 'p_1', 'p_2', 'p_3']) h.ps(id).lp = 1;
  h.m.lastResults = new Map(h.m.order.map((p) => [p.playerId, { ...clean(), perfect: false, leaked: [{ enemyKey: 'enemy_1422_lrsldr', counted: true }] }]));
  h.m.settle(null, null);
  const m = h.m;
  assert.ok(m.order.every((p) => !p.alive), 'everyone is out');
  assert.ok(m.order.every((p) => !p.downed), 'and nobody is left in the rescuable state');
  assert.ok(m.order.every((p) => p.eliminatedRound === 1), 'all credited to the round they fell');
  h.run(() => h.ended != null);
  assert.equal(h.ended.reason, 'eliminated');
  assert.ok(h.ended.players.every((p) => p.alive === false && p.roundsPassed === 0));
  h.invariants();
});

test('4 players: two downed, and when the rescuers fall too every body is eliminated (none left hanging)', () => {
  const h = coopFour();
  const [p0, p1, p2, p3] = ['p_0', 'p_1', 'p_2', 'p_3'].map((id) => h.ps(id));
  for (const p of [p0, p1, p2, p3]) p.lp = 30;
  // one down per round: p0 in R1, p1 in R2
  settleToZero(h, 'p_0');
  h.toPrep(2);
  assert.equal(p0.downed, true);
  assert.equal(p1.alive, true);
  settleToZero(h, 'p_1');
  h.toPrep(3);
  assert.equal(p1.downed, true, 'two bodies, two living rescuers (p2, p3)');
  // save p0 with p2 only; p1 stays down — nobody owes him a rescue
  h.m.handle('p_2', { t: 'g.shareHp', target: 'p_0' });
  assert.equal(p0.alive, true);
  assert.equal(p0.lp, 1);
  assert.equal(p1.downed, true, 'p1 is still waiting');
  // both rescuers fall in one settle (p0 is at 1 LP and takes no leak), then p0 falls too → nobody can pay any more
  for (const id of ['p_2', 'p_3']) h.ps(id).lp = 1;
  h.m.lastResults = new Map(h.m.order.map((p) => [p.playerId, clean()]));
  for (const id of ['p_2', 'p_3']) h.m.lastResults.set(id, { ...clean(), perfect: false, leaked: [{ enemyKey: 'enemy_1422_lrsldr', counted: true }] });
  h.m.settle(null, null);
  assert.equal(p2.downed, true, 'p0 is still up, so p2 can wait for a rescue');
  assert.equal(p3.downed, true);
  h.toPrep(4);
  h.ps('p_0').lp = 1;
  h.m.lastResults = new Map(h.m.order.map((p) => [p.playerId, { ...clean(), perfect: false, leaked: [{ enemyKey: 'enemy_1422_lrsldr', counted: true }] }]));
  h.m.settle(null, null);
  assert.equal(p0.alive, false);
  assert.ok([p0, p1, p2, p3].every((p) => !p.downed), 'no rescuable body survives the last living human');
  assert.equal(p1.eliminatedRound, 2, 'credited to the round he fell');
  assert.equal(p2.eliminatedRound, 3);
  assert.equal(p3.eliminatedRound, 3);
  h.run(() => h.ended != null);
  assert.ok(h.ended);
  h.invariants();
});
