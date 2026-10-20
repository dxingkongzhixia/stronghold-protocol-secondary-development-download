// Generic deploy lock (PRTS 限制写入): the highest-cost hand pieces are barred from the battlefield for a while,
// while hand moves / withdrawing / merging and already-deployed pieces stay legal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERR } from '../../shared/constants.js';
import { DATA, makeMatch, give, legalTileFor, chessOfTier, checkInvariants } from './harness.js';

function prepMatch() {
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 11 }).start();
  h.toPrep(1);
  h.setStage('act2autochess_m01');
  const ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean), ...ps.temp.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear();
  ps.hand.fill(null);
  ps.temp.fill(null);
  ps.deployLocks.clear();
  ps.pendingDeployLocks.length = 0;
  ps.recompute();
  return { h, m: h.m, ps };
}

const cost = (id) => Number(DATA.chess[id]?.stats?.cost) || 0;

test('the lock picks the highest-cost hand pieces and refuses only their placement', () => {
  const { m, ps } = prepMatch();
  const ids = chessOfTier(1).filter((id) => m.pool.has(id)).sort((a, b) => cost(b) - cost(a));
  assert.ok(ids.length >= 3);
  const highId = ids[0];
  const lowId = ids.find((id) => cost(id) < cost(highId));
  assert.ok(lowId, 'a strictly cheaper operator');
  const high = give(m, ps, highId);
  const low = give(m, ps, lowId);
  const board = give(m, ps, ids[2], 'board', legalTileFor(m, ps, ids[2]));

  const locked = ps.lockDeployTopCost(1, 10);
  assert.deepEqual(locked, [high.uid]);
  assert.equal(ps.deployLocked(high), true);
  assert.equal(ps.deployLocked(low), false);

  const tile = legalTileFor(m, ps, ids[0]);
  const r = m.handle('p_0', { t: 'g.move', uid: high.uid, to: { area: 'board', row: tile[0], col: tile[1] } });
  assert.equal(r.error, ERR.BAD_TARGET, 'the locked operator cannot be deployed');
  assert.equal(r.detail, 'deploy locked');
  assert.deepEqual(m.handle('p_0', { t: 'g.move', uid: low.uid, to: { area: 'board', row: tile[0], col: tile[1] } }), { ok: true });

  // already-deployed pieces are not affected; hand-internal moves and selling stay legal
  assert.equal(ps.board.get(`${tile[0]},${tile[1]}`).uid, low.uid);
  assert.deepEqual(m.handle('p_0', { t: 'g.move', uid: board.uid, to: { area: 'hand', idx: 9 } }), { ok: true });
  assert.equal(ps.deployLocked(board), false);
  assert.deepEqual(m.handle('p_0', { t: 'g.move', uid: high.uid, to: { area: 'hand', idx: 8 } }), { ok: true });
  assert.deepEqual(m.handle('p_0', { t: 'g.move', uid: high.uid, to: { area: 'board', row: tile[0], col: tile[1] } }).error, ERR.BAD_TARGET);
  checkInvariants(m);
  m.dispose();
});

test('the boss prep hook reads the boss record and locks each player', () => {
  const { m, ps } = prepMatch();
  const ids = chessOfTier(1).filter((id) => m.pool.has(id)).sort((a, b) => cost(b) - cost(a));
  const high = give(m, ps, ids[0]);
  const oldBoss = m.gd.boss;
  const oldEnemy = m.gd.enemy;
  const oldRound = m.round;
  const oldBossId = m.bossId;
  try {
    m.round = m.gd.bossRound;
    m.bossId = 'test_boss';
    m.gd.boss = () => ({ enemyKey: 'enemy_test_protocol' });
    m.gd.enemy = () => ({ protocol: { deployLock: { count: 1, duration: 10 } } });
    m.applyBossDeployLocks([ps]);
    assert.equal(ps.deployLocked(high), true);
  } finally {
    m.gd.boss = oldBoss;
    m.gd.enemy = oldEnemy;
    m.round = oldRound;
    m.bossId = oldBossId;
  }
  checkInvariants(m);
  m.dispose();
});

test('locks expire on the match clock and can be queued for the next prep', () => {
  const { m, ps } = prepMatch();
  const ids = chessOfTier(1).filter((id) => m.pool.has(id));
  const a = give(m, ps, ids[0]);
  const b = give(m, ps, ids[1], 'temp', 0);

  const t0 = m.sched.now();
  assert.deepEqual(ps.lockDeployTopCost(2, 1, t0), [a.uid, b.uid].sort((x, y) => x - y));
  assert.equal(ps.deployLocked(a, t0 + 500), true);
  assert.equal(ps.deployLocked(a, t0 + 1001), false);

  ps.queueDeployLock(1, 5);
  assert.equal(ps.pendingDeployLocks.length, 1);
  const got = ps.applyPendingDeployLocks(t0 + 2000);
  assert.equal(got.length, 1);
  assert.equal(ps.pendingDeployLocks.length, 0);
  assert.equal(ps.deployLocked(got[0] ? ps.find(got[0]).piece : null, t0 + 2001), true);
  checkInvariants(m);
  m.dispose();
});
