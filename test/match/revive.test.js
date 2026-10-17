// test/match/revive.test.js — 分血救援 (REVIVE, owner 2026-10-17): in co-op a teammate whose 目标生命值 hits 0 is DOWNED
// (board / hand / funds frozen, spectating) instead of eliminated; the surviving humans hand over their own LP in
// 休整期 and the pooled LP brings him back on the spot. Bots and solo keep the old permanent elimination.
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

test('co-op: LP 0 downs a human with a living human teammate instead of eliminating him (board kept)', () => {
  const h = coopTwo();
  const p0 = h.ps('p_0');
  const funds = p0.funds;
  const pieces = p0.board.size;
  settleToZero(h, 'p_0');
  assert.equal(p0.alive, false, 'not alive');
  assert.equal(p0.downed, true, 'downed, not eliminated');
  assert.equal(p0.lp, 0);
  assert.equal(p0.eliminatedRound, null, 'elimination is not final yet');
  assert.equal(p0.reviveNeed, REVIVE.NEED, 'the first rescue needs the base pool');
  assert.equal(p0.revivePool, 0);
  assert.equal(p0.board.size, pieces, 'the board is frozen, never cleared');
  assert.equal(p0.funds, funds, 'funds are frozen too');
  assert.ok(h.m.publicView().players.find((p) => p.playerId === 'p_0').downed, 'the room sees him downed');
  h.invariants();
});

test('分血 during 休整期 fills the pool and revives him on the spot with the paid LP', () => {
  const h = coopTwo();
  const p0 = h.ps('p_0');
  const p1 = h.ps('p_1');
  settleToZero(h, 'p_0');
  h.toPrep(2);
  const lp1 = p1.lp;
  assert.deepEqual(h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' }), { ok: true });
  assert.equal(p1.lp, lp1 - REVIVE.DONATE, 'the donor pays');
  assert.equal(p0.revivePool, REVIVE.DONATE);
  assert.equal(p0.alive, false, 'half a pool brings nobody back');
  assert.deepEqual(h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' }), { ok: true });
  assert.equal(p0.alive, true, 'a full pool revives at once');
  assert.equal(p0.downed, false);
  assert.equal(p0.lp, REVIVE.NEED, 'he comes back with exactly the paid LP');
  assert.equal(p0.revivesUsed, 1);
  assert.equal(p0.revivePool, 0);
  assert.equal(p0.reviveNeed, 0);
  assert.ok(h.lastTo('p_0', 'm.private'), 'the revived player gets his own view again');
  h.invariants();
});

test('the donor never drops below the floor; the pool refuses overflow; wrong phase / target / donor are refused', () => {
  const h = coopTwo();
  const p0 = h.ps('p_0');
  const p1 = h.ps('p_1');
  settleToZero(h, 'p_0');
  h.toPrep(2);
  p1.lp = REVIVE.FLOOR + REVIVE.DONATE - 1;
  assert.equal(h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' }).error, 'NO_FUNDS', 'the donor keeps the floor');
  assert.equal(p1.lp, REVIVE.FLOOR + REVIVE.DONATE - 1, 'nothing moved');
  p1.lp = 20;
  assert.equal(h.m.handle('p_0', { t: 'g.shareHp', target: 'p_1' }).error, 'ELIMINATED', 'a downed player cannot donate');
  assert.equal(h.m.handle('p_1', { t: 'g.shareHp', target: 'p_1' }).error, 'BAD_TARGET', 'not himself');
  h.m.phase = 'COMBAT';
  assert.equal(h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' }).error, 'WRONG_PHASE', '休整期 only');
  h.m.phase = 'PREP';
  // both shares land, then the pool is full and further shares are refused
  h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' });
  h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' });
  assert.equal(p0.alive, true);
  assert.equal(h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' }).error, 'BAD_TARGET', 'a living teammate is no revive target');
  h.invariants();
});

test('a second rescue of the same player costs NEED + NEED_STEP; a third downs him for good', () => {
  const h = coopTwo();
  const p0 = h.ps('p_0');
  const p1 = h.ps('p_1');
  p1.lp = 30;
  settleToZero(h, 'p_0');
  h.toPrep(2);
  h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' });
  h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' });
  assert.equal(p0.revivesUsed, 1);
  settleToZero(h, 'p_0');
  h.toPrep(3);
  assert.equal(p0.reviveNeed, REVIVE.NEED + REVIVE.NEED_STEP, 'the second rescue costs more');
  for (let i = 0; i < 3; i++) h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' });
  assert.equal(p0.alive, false, '12 < 14: still down');
  assert.equal(p0.revivePool, 12);
  p1.lp = 30;
  h.m.handle('p_1', { t: 'g.shareHp', target: 'p_0' });
  assert.equal(p0.alive, true);
  assert.equal(p0.revivesUsed, 2);
  // the third time MAX stops the down: he is eliminated outright
  settleToZero(h, 'p_0');
  assert.equal(p0.downed, false);
  assert.equal(p0.alive, false);
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

test('a simultaneous wipe still ends the match: only the first downed can be saved, nobody is left to pay', () => {
  const h = coopTwo();
  const p0 = h.ps('p_0');
  const p1 = h.ps('p_1');
  for (const id of ['p_0', 'p_1']) {
    h.ps(id).lp = 1;
  }
  h.m.lastResults = new Map(h.m.order.map((p) => [p.playerId, { ...clean(), perfect: false, leaked: [{ enemyKey: 'enemy_1422_lrsldr', counted: true }] }]));
  h.m.settle(null, null);
  assert.equal(p0.downed, true, 'the first one goes down while the other is still alive');
  assert.equal(p1.downed, false, 'then nobody is left to pay for him');
  assert.equal(p1.alive, false);
  h.run(() => h.ended != null);
  assert.ok(h.ended, 'the match ends');
});
