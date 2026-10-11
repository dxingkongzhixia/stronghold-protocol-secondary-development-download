// 本局禁用 bonds (the mode's static inactiveBondIdList). The ban only stops them being OFFERED (server/match/pool.js
// excludes them from the per-match draw / draft / bots). It must NOT make an otherwise-active bond inert: computeBonds
// counts every bond, so a banned bond whose members reach its threshold IS active and takes effect (the owner's rule,
// 2026-10-11), while one below its threshold stays inert (its layers still ride into the battle, §27). bondList marks
// an inactive banned bond `off: true` for the strip's grey 本局禁用 disc; an active one reads like any active bond.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameData } from '../../server/match/gamedata.js';
import { computeBonds, bondList, bondSnapshot, bondsWithGains, offBondCounts } from '../../server/match/bondsMeta.js';
import { PlayerState } from '../../server/match/PlayerState.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import { DATA } from './harness.js';

const funny = new GameData(DATA, 'mode_single_funny');
const open = new GameData(DATA, 'mode_multi_normal');
let uid = 1;
const piece = (id) => ({ uid: uid++, kind: 'chess', id, items: [] });
const state = ({ board = [], hand = [], layers = {}, bondCountBonus } = {}) => {
  const b = new Map();
  board.forEach((p, i) => b.set(`${9 + (i % 4)},${2 + Math.floor(i / 4)}`, p));
  const h = new Array(10).fill(null);
  hand.forEach((p, i) => { h[9 - i] = p; });
  return { board: b, hand: h, layers, bondCountBonus };
};
const members = (bond, n) => Object.values(DATA.chess)
  .filter((c) => c.visible && !c.isGolden && c.bonds.includes(bond))
  .slice(0, n)
  .map((c) => c.chessId);

const INVESTOR = members('investShip', 2);
const RAIDER = members('raidShip', 1);
const SKILLFUL = members('skillfulShip', 2);
const ARCANE = members('arcaneShip', 3);
const YAN = members('yanShip', 1);

// a player-state stub with computeBonds + battleBonds (PlayerState.prototype methods) for the battle-input cases
const stub = (gd, ps, pendingLayerGains = null) => ({
  gd, ...ps, pendingLayerGains,
  bonds: computeBonds(gd, ps),
  bondsView() { return bondsWithGains(this.bonds, this.pendingLayerGains); },
});

test('标准模拟: a 本局禁用 bond below its threshold is computed INACTIVE, an enabled bond is unchanged', () => {
  assert.equal(INVESTOR.length, 2);
  assert.equal(RAIDER.length, 1);
  const ps = state({
    board: [piece(RAIDER[0]), piece(YAN[0])],
    hand: [piece(INVESTOR[0])],
    layers: { investShip: 12, raidShip: 4, lateranoShip: 9 },
  });
  const bonds = computeBonds(funny, ps);
  // the ban does not omit them any more — every bond is computed, so a banned one can activate by count (below)
  assert.equal(bonds.investShip.count, 1, '投资人 counts its hand member');
  assert.equal(bonds.investShip.active, false, 'threshold 3: one member is not enough');
  assert.equal(bonds.raidShip.active, false, 'threshold 2: one member is not enough');
  assert.equal(bonds.lateranoShip.count, 0);
  assert.equal(bonds.lateranoShip.active, false);
  assert.equal(bonds.investShip.layers, 12, 'layers persist whatever the activation');
  assert.equal(bonds.raidShip.layers, 4);
  assert.equal(bonds.lateranoShip.layers, 9);
  assert.equal(bonds.yanShip.active, false, 'an enabled bond below its threshold is unchanged');
  // the battle input now carries the inactive banned bonds (count / layers), but `active: false` ⇒ nothing activates
  const snap = bondSnapshot(bonds);
  assert.deepEqual(snap.investShip, { count: 1, active: false, tier: 0, layers: 12 });
  assert.deepEqual(snap.raidShip, { count: 1, active: false, tier: 0, layers: 4 });

  // offBondCounts still lists the banned bonds the player has members of (count > 0)
  const off = offBondCounts(funny, ps);
  assert.equal(off.investShip.count, 1);
  assert.equal(off.investShip.layers, 12);
  assert.equal(off.raidShip.count, 1);
  assert.ok(!('lateranoShip' in off), 'no members: not in offBondCounts (layers alone do not count)');

  const list = bondList(funny, bonds, { full: true, off });
  const invest = list.find((x) => x.bondId === 'investShip');
  const raid = list.find((x) => x.bondId === 'raidShip');
  assert.deepEqual(
    { count: invest.count, active: invest.active, tier: invest.tier, layers: invest.layers, off: invest.off, countsHand: invest.countsHand },
    { count: 1, active: false, tier: 0, layers: 12, off: true, countsHand: true },
  );
  assert.equal(raid.off, true);
  assert.equal(raid.active, false);
  assert.equal(raid.tier, 0);
  assert.equal(raid.countsHand, false);
  const laterano = list.find((x) => x.bondId === 'lateranoShip');
  assert.ok(laterano && laterano.off === true, 'a banned bond with layers but no members shows as a grey disc');
});

test('the owner rule: a 本局禁用 bond whose members reach its threshold IS active and its battle input says so', () => {
  // 灵巧 threshold 2; 奥术 threshold 2 (tier 2 at 3)
  const sk = computeBonds(funny, state({ board: SKILLFUL.map(piece) }));
  assert.equal(sk.skillfulShip.count, 2);
  assert.equal(sk.skillfulShip.active, true, 'two 灵巧 members activate the banned bond');
  assert.equal(sk.skillfulShip.tier, 1);
  const arc = computeBonds(funny, state({ board: ARCANE.map(piece) }));
  assert.equal(arc.arcaneShip.active, true, 'three 奥术 members activate it at tier 2');
  assert.equal(arc.arcaneShip.tier, 2);

  // the battle input carries `active: true` ⇒ the sim applies the effect (every bond effect gates on tier ≥ 1)
  const snap = PlayerState.prototype.battleBonds.call(stub(funny, state({ board: SKILLFUL.map(piece) })), false);
  assert.equal(snap.skillfulShip.active, true);
  assert.equal(snap.skillfulShip.tier, 1);

  // and the effect really does fire in a battle built from that input (灵巧's aura: a `bond:skillfulShip` buff)
  const h = makeBattle({
    defs: { chess: { sk_a: chessRec({ id: 'sk_a', bonds: ['skillfulShip'], profession: 'WARRIOR', skill: null }) } },
    units: [{ chessId: 'sk_a', row: 10, col: 3 }],
    bonds: { skillfulShip: snap.skillfulShip },
  });
  h.step();
  assert.ok(h.unit('sk_a').buffs.some((b) => String(b.key) === 'bond:skillfulShip'), 'an activated banned bond takes effect');
});

test('the owner rule: a 本局禁用 bond below its threshold is inert; its layers still ride into the battle (§27)', () => {
  const ps = state({ board: [piece(SKILLFUL[0])], layers: { skillfulShip: 7 } });
  const b0 = computeBonds(funny, ps);
  assert.equal(b0.skillfulShip.count, 1);
  assert.equal(b0.skillfulShip.active, false, 'one 灵巧 member of a 2-threshold bond: still inert');
  const s = stub(funny, ps);
  const snap = PlayerState.prototype.battleBonds.call(s, false);
  assert.deepEqual(snap.skillfulShip, { count: 1, active: false, tier: 0, layers: 7 }, 'the layers ride along, inactive');
  // 联防 `reached`: the pending in-battle gains are added
  const reached = PlayerState.prototype.battleBonds.call({ ...s, pendingLayerGains: { skillfulShip: 5 } }, true);
  assert.equal(reached.skillfulShip.layers, 12);
  assert.equal(reached.skillfulShip.active, false);
  const h = makeBattle({
    defs: { chess: { sk_a: chessRec({ id: 'sk_a', bonds: ['skillfulShip'], profession: 'WARRIOR', skill: null }) } },
    units: [{ chessId: 'sk_a', row: 10, col: 3 }],
    bonds: { skillfulShip: snap.skillfulShip },
  });
  h.step();
  assert.ok(!h.unit('sk_a').buffs.some((b) => String(b.key) === 'bond:skillfulShip'), 'an unactivated banned bond does nothing');
});

test('a BOARD_AND_DECK off bond counts the hand, not the temporary slots, and not twice', () => {
  const [a, b] = INVESTOR;
  const handOnly = offBondCounts(funny, state({ hand: [piece(a), piece(b)] }));
  assert.equal(handOnly.investShip.count, 2);
  assert.ok(!('raidShip' in (handOnly || {})), '突袭 in nobody\'s hand: a board bond with no board member is omitted');
  const raidHand = offBondCounts(funny, state({ hand: [piece(RAIDER[0])] }));
  assert.equal(raidHand, null, '突袭 does not count a hand member');
  const both = offBondCounts(funny, state({ board: [piece(a)], hand: [piece(a), piece(DATA.chess[a].goldenId)] }));
  assert.equal(both.investShip.count, 1, 'normal and elite of one operator, board and hand, count once');
  const tempOnly = { board: new Map(), hand: new Array(10).fill(null), layers: {}, temp: [piece(a)] };
  assert.equal(offBondCounts(funny, tempOnly), null, 'the 5 temporary slots never count');
});

test('a mode with an empty inactive set returns null, and those bonds stay in computeBonds', () => {
  assert.equal(open.modeInactiveBonds.size, 0);
  const ps = state({ board: [piece(RAIDER[0])], hand: [piece(INVESTOR[0])] });
  assert.equal(offBondCounts(open, ps), null);
  const bonds = computeBonds(open, ps);
  assert.equal(bonds.investShip.count, 1);
  assert.equal(bonds.raidShip.count, 1);
  assert.equal(bondList(open, bonds).some((x) => x.off), false);
});
