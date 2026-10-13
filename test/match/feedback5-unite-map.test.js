// The 联防 (unite) field is fought on the ROUND's own stage, opened to both halves (GEO.UNITE_RECT) — the same full
// arena the round's players played on. Owner decision: GitHub #41's escaped map (act1autochess_escaped_single / _multi,
// a narrow road) is NOT used; server/match/match/unitePhase.js `_uniteOpts.stageId` is the round's stage. The leaked
// enemies still come from the escaped template's wave/routes (server/match/waves.js buildUniteWave; escaped_single
// enters at col 10, escaped_multi at col 18 through the checkpoint (9,10)), so they still spawn, break through and leak
// on the full arena. This pins: the stage IS the match stage (1 and 2 helpers, both combat modes), the helpers' pieces
// on their prep tiles (the first of two shifted 8 columns), the escaped routes still spawn and cross the arena, and the
// m.field a spectator receives names that stage (screens/game.js draws it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEO, PHASE } from '../../shared/constants.js';
import { Battle } from '../../server/sim/Battle.js';
import { createBattleFromSpec } from '../../server/sim/spec.js';
import { DataSource } from '../../server/sim/simdata.js';
import { FakeBattle } from './fakeBattle.js';
import { DATA, makeMatch, give, chessOfTier, legalTileFor, checkInvariants } from './harness.js';

/** A real battle that only ends by its time limit (the check follows the enemies, whatever the helpers do). */
class NoFinish extends Battle {
  constructor(o) { super({ ...o, autoFinish: false }); }
}

const CRATE = 'trap_1105_accrate';
/** 战场#01's active 阻隔工事 on the 联防 rows: three on the left half (#001–#003), three on the right half (#101–#103). */
const M01_CRATES = [[10, 5], [10, 6], [10, 13], [10, 14], [11, 5], [11, 13]];
const tileOf = (ps, piece) => [...ps.board.entries()].find(([, p]) => p === piece)[0].split(',').map(Number);
const startOf = (r) => r.start ?? [r.startPosition?.row, r.startPosition?.col];

/**
 * Co-op on `stageId` (战场#01's row 9 is walled off at cols 5–7: "##Err###rrSrr###rrS##"): p_0 leaks 3 enemies, the other
 * players are perfect — 1 helper with 2 humans, 2 helpers with 3. Each helper fields one ranged operator on the first
 * legal tile in reading order (战场#01: the 围墙 (12,3)).
 */
function scenario({ humans, clientCombat, stageId = 'act1autochess_m01', data = DATA, seed = 4101 + humans }) {
  const h = makeMatch({
    mode: 'coop', humans, seed, fake: true, clientCombat, data,
    script: (b) => (b.kind === 'normal' ? { leaks: { p_0: 3 } } : {}),
  }).start();
  const m = h.m;
  h.toPrep(1);
  h.setStage(stageId);
  const ranged = chessOfTier(1, (c) => c.position === 'RANGED').filter((x) => m.pool.has(x));
  const helpers = [];
  for (let i = 1; i < humans; i++) {
    const ps = h.ps(`p_${i}`);
    const id = ranged[i];
    helpers.push({ ps, piece: give(m, ps, id, 'board', legalTileFor(m, ps, id)) });
  }
  h.drive(() => m.phase === PHASE.UNITE);
  return { h, m, helpers };
}

/** The 联防 field's spec / options as the match built them, and a real battle over them. */
function uniteField(m, clientCombat) {
  if (clientCombat) {
    const f = m.fields[0];
    return { opts: f.spec, battle: createBattleFromSpec(f.spec, new DataSource(DATA, null), { BattleClass: NoFinish, recordEvents: false }) };
  }
  const u = FakeBattle.instances.find((b) => b.kind === 'unite');
  return { opts: u.opts, battle: new NoFinish({ ...u.opts, data: m.ds, logger: { warn() {}, error() {}, info() {}, debug() {} } }) };
}

for (const clientCombat of [true, false]) {
  test(`联防 with 1 helper (${clientCombat ? 'client-side combat' : 'server-run'}): the ROUND's stage — enemies enter at col 10 and cross the full arena`, () => {
    const { m, helpers } = scenario({ humans: 2, clientCombat });
    assert.deepEqual(m.unitePlan.helpers.map((p) => p.playerId), ['p_1']);
    const { opts, battle: b } = uniteField(m, clientCombat);
    assert.equal(opts.stageId, m.stageId, "the 联防 field is the round's own stage, not an escaped map");
    assert.equal(opts.stageId, 'act1autochess_m01');
    assert.deepEqual(opts.rect, GEO.UNITE_RECT, 'the whole 19×21 map\'s field rows (both halves)');
    assert.equal(b.stage.id, m.stageId, "the battle runs on the match's stage");
    // the escape/break-through wave: every escaped_single route starts at col 10
    assert.ok(opts.routes.every((r) => (r.start ?? [r.startPosition?.row, r.startPosition?.col])[1] === 10));
    // the helper's piece stands on its prep tile (a lone helper keeps colOffset 0)
    b.step();
    assert.deepEqual(crates(b), M01_CRATES, 'the 阻隔工事 of both halves stand (0.2.0: none)');
    // the helper's piece on its prep tile — the same 围墙 it stood on in prep
    const { ps, piece } = helpers[0];
    const [r, c] = tileOf(ps, piece);
    assert.deepEqual([r, c], [12, 3]);
    const u = b.allyUnits.find((x) => x.uid === piece.uid && x.ownerId === 'p_1');
    assert.deepEqual([u.tileR, u.tileC], [r, c]);
    // a leaked walker crosses the round arena's field rows (the break-through/leak mechanic still works)
    const crossed = new Set();
    while (b.time < 60 && !b.finished) {
      b.step();
      for (const e of b.enemies) if (e.alive && e.motion !== 'FLY') seen.add(`${Math.round(e.y)},${Math.round(e.x)}`);
    }
    assert.ok(['9,8', '9,9', '9,10'].some((k) => crossed.has(k)), `a walker on row 9 cols 8–10 (${[...crossed].sort().join(' ')})`);
    assert.equal(b.errorCount || 0, 0);
    checkInvariants(m);
    m.dispose();
  });

  test(`联防 with 2 helpers (${label}): the round's battlefield — the first helper on the right half (+8 columns) on the same 围墙 as in prep, crates on both halves, every viewer gets the match stage`, () => {
    const { h, m, helpers } = scenario({ humans: 3, clientCombat });
    const order = m.unitePlan.helpers.map((p) => p.playerId);
    assert.equal(order.length, 2);
    const { opts, battle: b } = uniteField(m, clientCombat);
    assert.equal(opts.stageId, 'act1autochess_m01', 'the match stage (0.2.0: act1autochess_escaped_multi)');
    assert.deepEqual(opts.players.map((p) => [p.playerId, p.colOffset]), [[order[0], 8], [order[1], 0]]);
    assert.ok(opts.routes.every((r) => startOf(r)[1] === 18), 'escaped_multi\'s routes enter at col 18');
    assert.ok(opts.routes.filter((r) => r.motion === 'WALK').every((r) => r.checkpoints.some(([rr, cc]) => rr === 9 && cc === 10)), 'walkers pass (9,10)');
    assert.deepEqual(b.stage.rows, m.stage.rows);
    b.step();
    assert.deepEqual(crates(b), M01_CRATES, 'the 阻隔工事 of both halves stand (0.2.0: none)');
    for (const { ps, piece } of helpers) {
      const [r, c] = tileOf(ps, piece);
      const u = b.allyUnits.find((x) => x.uid === piece.uid && x.ownerId === ps.playerId);
      const off = ps.playerId === order[0] ? 8 : 0;
      assert.deepEqual([u.tileR, u.tileC], [r, c + off], `${ps.playerId}: its prep tile${off ? ' on the right half' : ''}`);
      // the stage's right half is its left half + 8 columns: the shifted helper stands on the tile kind it prepared on
      assert.equal(b.grid.tile(r, c + off).key, m.stage.tiles[m.stage.rows[r][c]].tileKey, `${ps.playerId}: the prep tile's kind`);
      assert.equal(b.grid.tile(r, c + off).key, 'tile_fence_bound', `${ps.playerId}: 战场#01's 围墙 (0.2.0: road)`);
    }
    // what the other browsers are given: the 联防 field names the match stage, the one their boards are drawn on
    if (clientCombat) {
      const start = h.lastTo('p_0', 'b.start');
      assert.equal(start && start.spec && start.spec.stageId, m.stageId, 'the leaker simulates the 联防 spec on the match stage');
    } else {
      m.handle('p_0', { t: 'g.watch', fieldId: 'u' });
      const meta = h.lastTo('p_0', 'm.field');
      assert.equal(meta && meta.stageId, m.stageId, 'a watcher\'s m.field names the match stage');
    }
    assert.equal(m.publicView().stageId, 'act1autochess_m01');
    checkInvariants(m);
    m.dispose();
  });
}

test("联防 with 2 helpers: the ROUND's stage — the first helper on the right half (col + 8), enemies enter at col 18 through (9,10); the client draws the round's map", () => {
  const { h, m, helpers } = scenario({ humans: 3, clientCombat: false });
  const order = m.unitePlan.helpers.map((p) => p.playerId);
  assert.equal(order.length, 2);
  const { opts, battle: b } = uniteField(m, false);
  assert.equal(opts.stageId, m.stageId);
  assert.equal(opts.stageId, 'act1autochess_m01');
  assert.equal(b.stage.id, 'act1autochess_m01');
  assert.deepEqual(opts.players.map((p) => [p.playerId, p.colOffset]), [[order[0], 8], [order[1], 0]]);
  assert.ok(opts.routes.every((r) => r.start[1] === 18), 'every route enters at col 18');
  assert.ok(opts.routes.filter((r) => r.motion === 'WALK').every((r) => r.checkpoints.some(([rr, cc]) => rr === 9 && cc === 10)), 'walkers pass (9,10)');
  b.step();
  for (const { ps, piece } of helpers) {
    const [r, c] = [...ps.board.entries()].find(([, p]) => p === piece)[0].split(',').map(Number);
    const u = b.allyUnits.find((x) => x.uid === piece.uid && x.ownerId === ps.playerId);
    const off = ps.playerId === order[0] ? 8 : 0;
    assert.deepEqual([u.tileR, u.tileC], [r, c + off], `${ps.playerId}: its prep tile${off ? ' on the right half' : ''}`);
    assert.notEqual(b.stage.rows[r][c + off], '#', 'a deployable tile of the round arena');
  }
  // what a watching browser receives: the m.field of the 联防 carries the round's stage (the client draws it)
  m.handle('p_0', { t: 'g.watch', fieldId: 'u' });
  const meta = h.lastTo('p_0', 'm.field');
  assert.equal(meta && meta.stageId, 'act1autochess_m01');
  assert.equal(m.stageId, 'act1autochess_m01', "the match stage (m.public stageId, the boards) is the 联防 field's stage");
  checkInvariants(m);
  m.dispose();
});

test("data that lacks the escaped map records still fields the 联防 on the round's stage", () => {
  const stages = Object.fromEntries(Object.entries(DATA.stages).filter(([, s]) => s.kind !== 'unite'));
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 4199, fake: true, data: { ...DATA, stages }, script: (b) => (b.kind === 'normal' ? { leaks: { p_0: 2 } } : {}) }).start();
  const m = h.m;
  h.toPrep(1);
  const ps = h.ps('p_1');
  const id = chessOfTier(1, (c) => c.position === 'RANGED').find((x) => m.pool.has(x));
  give(m, ps, id, 'board', legalTileFor(m, ps, id));
  h.drive(() => m.phase === PHASE.UNITE);
  assert.equal(FakeBattle.instances.find((b) => b.kind === 'unite').opts.stageId, m.stageId);
  m.dispose();
});
