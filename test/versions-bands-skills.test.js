// test/versions-bands-skills.test.js — act3 active band skills (B2): the g.bandSkill intent (availability, cost,
// cooldown, target, uses) and the meta handlers it drives (next-equipment discount, funds, shop refreshes, bond grants,
// dynamic costs). Handlers run through the real registry shape (bandMetaHandler) with the version data.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setGameData } from '../server/sim/content/support/index.js';
import { bandMetaHandler } from '../server/sim/content/bands/meta.js';
import { MatchIntents } from '../server/match/match/intents.js';
import { OK } from '../server/match/player/common.js';
import { validateC2S } from '../shared/protocol.js';
import { PHASE } from '../shared/constants.js';
import { makeBattle } from './helpers/battleHarness.js';
import { layerCapBonus } from '../server/sim/content/garrisons/battle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const V = Object.fromEntries(fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))
  .map((f) => [path.basename(f, '.json'), JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))]));
setGameData(V);
after(() => setGameData(null));

/** The handler context a band handler sees, over a small player state and the calls it makes. */
function ctxFor(ps, m, ev, calls) {
  const bondOf = (id) => {
    const s = String(id);
    for (const b of ['yanShip', 'ursusShip', 'kazimierzShip', 'lethaniaShip']) {
      if (s.includes(b.replace(/Ship$/, '').toLowerCase())) return [b];
    }
    return [];
  };
  return {
    round: m.round,
    shopLevel: () => ps.shop.level,
    gd: {
      maxShopLevel: 6,
      baseIdOf: (id) => String(id).replace(/^golden_/, ''),
      chess: (id) => ({ bonds: bondOf(id) }),
      item: (id) => (String(id).startsWith('item') ? { id } : null),
    },
    // deterministic: int(n) = n-1 (the top of every range), pick = first, shuffle = identity
    rng: { int: (n) => Math.max(0, n - 1), pick: (a) => a[0], shuffle: (a) => a.slice() },
    board: () => calls.board || [],
    hand: () => calls.hand || [],
    temp: () => calls.temp || [],
    piece: (uid) => (calls.pieces && calls.pieces[uid]) || (uid === 1 ? { uid, kind: 'chess', id: 'own_a', tier: 4, golden: false, items: [] } : null),
    shopSlots: () => ps.shop.slots.map((s) => (s ? { kind: s.kind, id: s.id, sold: !!s.sold } : null)),
    rollChess: (o = {}) => { calls.rolls.push(o); return calls.chessId ?? null; },
    rollItem: () => calls.itemId ?? null,
    grantChess: (id) => { calls.granted.push(id); return calls.grantFail ? null : { uid: 100 + calls.granted.length }; },
    grantItem: (id) => { calls.items.push(id); return { uid: 200 + calls.items.length }; },
    equipDirect: (itemUid, chessUid) => { calls.equipped.push([itemUid, chessUid]); return true; },
    promote: (uid) => { calls.promoted.push(uid); return calls.promote !== false; },
    sell: (uid) => { calls.sold.push(uid); return calls.sell !== false; },
    destroyPiece: (uid) => { calls.destroyed.push(uid); return calls.destroy !== false; },
    addBandMark: (uid, mark) => { calls.marks.push([uid, mark]); return calls.mark !== false; },
    triggerGarrisons: (uid, event) => { calls.garrison.push([uid, event]); return calls.garrisonRuns ?? 1; },
    garrisonsOf: () => calls.garrisons ?? [{ eventType: 'SERVER_PREP_FIN' }],
    pieceCounter: (uid, k) => (ps.pieceCounters && ps.pieceCounters[`${uid}:${k}`]) || 0,
    incPieceCounter: (uid, k, n = 1) => {
      ps.pieceCounters = ps.pieceCounters || {};
      const key = `${uid}:${k}`;
      ps.pieceCounters[key] = (ps.pieceCounters[key] || 0) + n;
      return ps.pieceCounters[key];
    },
    bonds: () => calls.bonds || {},
    bondActive: (id) => !!(calls.bonds && calls.bonds[id] && calls.bonds[id].active),
    addLayers: (bond, n, opts = {}) => { calls.layers.push([bond, n, opts.requireActive === true]); return n; },
    setShopSlot: (i, s) => { calls.slots.push([i, s]); return true; },
    modifyPrice: (d) => { ev.price = Math.max(0, (Number(ev.price) || 0) + d); },
    addFunds: (n) => { ps.funds += n; calls.funds += n; return n; },
    refreshShop: () => { calls.refreshed = (calls.refreshed || 0) + 1; return calls.refresh !== false; },
    counter: (k) => ps.counters[k] || 0,
    setCounter: (k, v) => { ps.counters[k] = v; return v; },
    incCounter: (k, n = 1) => { ps.counters[k] = (ps.counters[k] || 0) + n; return ps.counters[k]; },
  };
}

/** A match instance with only what the band-skill intent touches, plus the real handler of `bandId`. */
function fakeMatch(bandId, { funds = 20, slots } = {}) {
  const h = bandMetaHandler(bandId);
  const ps = {
    bandId,
    funds,
    ready: false,
    bandSkill: { uses: 0, total: 0, round: 0, cooldownUntil: 0 },
    shop: { level: 4, slots: slots ?? [{ kind: 'chess', id: 'base_x', basePrice: 1, sold: false }] },
    counters: {},
    board: new Map(),
    dirty() {},
    spend(n) { if (n > this.funds) return false; this.funds -= n; this.spent = (this.spent || 0) + n; return true; },
    _afterSpend(n) { this.afterSpent = (this.afterSpent || 0) + n; },
    find(uid) { return uid === 1 ? { piece: { kind: 'chess', uid: 1, id: 'own_a' } } : null; },
  };
  const calls = {
    rolls: [], granted: [], items: [], slots: [], board: [], funds: 0,
    promoted: [], sold: [], destroyed: [], marks: [], garrison: [], equipped: [], layers: [],
  };
  const m = Object.create(MatchIntents.prototype);
  m.phase = PHASE.PREP;
  m.round = 3;
  m.calls = calls;
  m.gd = { band: (id) => V.bands[id], baseIdOf: (id) => String(id).replace(/^golden_/, ''), maxShopLevel: 6 };
  m.markPublic = () => { m.marked = true; };
  m.dispatch = (p, hook, ev) => { const fn = h && h[hook]; if (fn) fn(ctxFor(p, m, ev, calls), ev); return ev; };
  return { m, ps, h, calls };
}

test('g.bandSkill is a protocol message with an optional target', () => {
  assert.equal(validateC2S({ t: 'g.bandSkill' }), null);
  assert.equal(validateC2S({ t: 'g.bandSkill', target: { kind: 'chess', uid: 1 } }), null);
  assert.equal(validateC2S({ t: 'g.bandSkill', target: { kind: 'noop' } }), null, 'shape only: the intent checks the type');
  assert.notEqual(validateC2S({ t: 'g.bandSkill', target: [] }), null);
  assert.notEqual(validateC2S({ t: 'g.bandSkill', target: 5 }), null);
});

test('g.bandSkill refuses a passive / targetless-only / out-of-phase use', () => {
  const passive = fakeMatch('band_smith');
  assert.equal(passive.m.useBandSkill(passive.ps, {}).error, 'BAD_TARGET');
  const price = fakeMatch('band_price');
  assert.equal(price.m.useBandSkill(price.ps, { target: { kind: 'chess', uid: 1 } }).error, 'BAD_TARGET');
  price.m.phase = PHASE.BATTLE;
  assert.equal(price.m.useBandSkill(price.ps, {}).error, 'WRONG_PHASE');
  price.m.phase = PHASE.PREP;
  price.ps.ready = true;
  assert.equal(price.m.useBandSkill(price.ps, {}).error, 'WRONG_PHASE');
});

test('内部货源: one use a round, the next equipment costs 1 less until bought', () => {
  const { m, ps, calls } = fakeMatch('band_price');
  assert.deepEqual(m.useBandSkill(ps, {}), OK);
  assert.equal(ps.counters['band:price:discounts'], 1);
  assert.equal(m.useBandSkill(ps, {}).error, 'BAD_TARGET', 'ROUND_RESET x1');
  const ev = { kind: 'item', id: 'item_a', price: 3 };
  m.dispatch(ps, 'onPrice', ev);
  assert.equal(ev.price, 2);
  const chess = { kind: 'chess', id: 'base_x', price: 3 };
  m.dispatch(ps, 'onPrice', chess);
  assert.equal(chess.price, 3, 'operators are not discounted');
  m.dispatch(ps, 'onBuy', { kind: 'item', slot: { id: 'item_a' } });
  const again = { kind: 'item', id: 'item_b', price: 3 };
  m.dispatch(ps, 'onPrice', again);
  assert.equal(again.price, 3, 'used up by the purchase');
  m.round = 4;
  assert.deepEqual(m.useBandSkill(ps, {}), OK, 'a new round restores it');

  // the discount never takes a price below 0
  m.round = 5;
  m.useBandSkill(ps, {});
  const cheap = { kind: 'item', id: 'item_c', price: 0 };
  m.dispatch(ps, 'onPrice', cheap);
  assert.equal(cheap.price, 0);
  assert.deepEqual(calls.slots, []);
});

test('私募基金: 1-6 funds, the cooldown is the amount gained', () => {
  const { m, ps } = fakeMatch('band_fund', { funds: 0 });
  assert.deepEqual(m.useBandSkill(ps, {}), OK);
  assert.equal(ps.funds, 6, 'the stub rolls the top of 1..6');
  assert.equal(ps.bandSkill.cooldownUntil, 3 + 6);
  assert.equal(m.useBandSkill(ps, {}).error, 'BAD_TARGET', 'cooling down');
  m.round = 8;
  assert.equal(m.useBandSkill(ps, {}).error, 'BAD_TARGET');
  m.round = 9;
  assert.deepEqual(m.useBandSkill(ps, {}), OK);
  assert.equal(ps.funds, 12);
});

test('人才锁定: one gold per use, three uses a round, no funds no use', () => {
  const { m, ps, calls } = fakeMatch('band_support', { funds: 0 });
  assert.equal(m.useBandSkill(ps, {}).error, 'NO_FUNDS');
  assert.equal(ps.bandSkill.uses, 0, 'a refused use is not consumed');
  ps.funds = 1;
  calls.chessId = 'base_t5';
  assert.deepEqual(m.useBandSkill(ps, {}), OK);
  assert.equal(ps.funds, 0);
  assert.equal(calls.refreshed, 1);
  assert.equal(ps.afterSpent, 1, 'onSpend sees the skill payment');
  assert.equal(calls.rolls[0].tier, 5, 'one tier above shop level 4');
  assert.deepEqual(calls.slots.at(-1)[1], { kind: 'chess', id: 'base_t5' });
  ps.funds = 1;
  assert.deepEqual(m.useBandSkill(ps, {}), OK);
  ps.funds = 1;
  assert.deepEqual(m.useBandSkill(ps, {}), OK, 'the third use');
  ps.funds = 1;
  assert.equal(m.useBandSkill(ps, {}).error, 'BAD_TARGET', 'ROUND_RESET x3');
});

test('专享情报: once a match, the refresh offers a deployed operator', () => {
  const { m, ps, calls } = fakeMatch('band_high', { funds: 3 });
  calls.board = [{ kind: 'chess', uid: 2, id: 'golden_own_b' }, { kind: 'chess', uid: 3, id: 'own_b' }];
  assert.deepEqual(m.useBandSkill(ps, {}), OK);
  assert.equal(calls.refreshed, 1);
  assert.deepEqual(calls.slots.at(-1)[1], { kind: 'chess', id: 'own_b' }, 'base id, one slot');
  assert.equal(ps.funds, 0);
  m.round = 4;
  ps.funds = 3;
  assert.equal(m.useBandSkill(ps, {}).error, 'BAD_TARGET', 'ALL_LIMIT x1');
});

test('广交豪杰: two 炎 refreshes a round, one gold each', () => {
  const { m, ps, calls } = fakeMatch('band_yan', { funds: 2 });
  calls.chessId = 'yan_a';
  assert.deepEqual(m.useBandSkill(ps, {}), OK);
  assert.equal(calls.refreshed, 1);
  assert.deepEqual(calls.slots.at(-1), [0, { kind: 'chess', id: 'yan_a' }]);
  assert.deepEqual(m.useBandSkill(ps, {}), OK);
  assert.equal(m.useBandSkill(ps, {}).error, 'BAD_TARGET');
  assert.equal(ps.funds, 0);
});

test('打包速递: every shop operator for free, cost 9 falling by 1 at each prep end', () => {
  const slots = [
    { kind: 'chess', id: 'base_a', basePrice: 1, sold: false },
    { kind: 'chess', id: 'base_b', basePrice: 1, sold: false },
    { kind: 'item', id: 'item_a', basePrice: 2, sold: false },
  ];
  const { m, ps, calls } = fakeMatch('band_closeout', { funds: 9, slots });
  const price = () => { const ev = { cost: 9 }; m.dispatch(ps, 'onBandSkillPrice', ev); return ev.cost; };
  assert.equal(price(), 9);
  for (let r = 0; r < 3; r++) m.dispatch(ps, 'onPrepEnd', {});
  assert.equal(price(), 6, 'each prep end lowers the cost by delta 1');
  assert.deepEqual(m.useBandSkill(ps, {}), OK);
  assert.deepEqual(calls.granted, ['base_a', 'base_b'], 'operators only');
  assert.deepEqual(calls.slots, [[0, null], [1, null]], 'their slots empty');
  assert.equal(ps.funds, 3);
  assert.equal(price(), 9, 'a use resets the cost');
  const broke = fakeMatch('band_closeout', { funds: 8 });
  assert.equal(broke.m.useBandSkill(broke.ps, {}).error, 'NO_FUNDS');
  assert.equal(broke.ps.funds, 8);
});

test('骑士团长: delta 2 and a 卡西米尔 operator per use', () => {
  const { m, ps, calls } = fakeMatch('band_kazimier', { funds: 6 });
  calls.chessId = 'base_kaz';
  const price = () => { const ev = { cost: 6 }; m.dispatch(ps, 'onBandSkillPrice', ev); return ev.cost; };
  m.dispatch(ps, 'onPrepEnd', {});
  m.dispatch(ps, 'onPrepEnd', {});
  assert.equal(price(), 2);
  assert.deepEqual(m.useBandSkill(ps, {}), OK);
  assert.deepEqual(calls.granted, ['base_kaz']);
  assert.equal(ps.funds, 4);
  assert.equal(price(), 6);
});

test('流动乐章: the cost rises by 1 for good after every use', () => {
  const { m, ps, calls } = fakeMatch('band_lethania', { funds: 5 });
  calls.chessId = 'base_let';
  const price = () => { const ev = { cost: 1 }; m.dispatch(ps, 'onBandSkillPrice', ev); return ev.cost; };
  assert.deepEqual(m.useBandSkill(ps, {}), OK);
  assert.equal(ps.funds, 4);
  assert.equal(price(), 2, 'the next use costs 2');
  m.round = 4;
  assert.deepEqual(m.useBandSkill(ps, {}), OK);
  assert.equal(ps.funds, 2);
  assert.equal(price(), 3);
});

test('无惧风雪: each 乌萨斯 purchase lowers the cost by 1 until a use resets it', () => {
  const { m, ps, calls } = fakeMatch('band_ursus', { funds: 5 });
  calls.chessId = 'base_ursus';
  const price = () => { const ev = { cost: 5 }; m.dispatch(ps, 'onBandSkillPrice', ev); return ev.cost; };
  const buy = (id) => m.dispatch(ps, 'onBuy', { kind: 'chess', slot: { id } });
  buy('base_ursus');
  buy('base_ursus');
  buy('base_other');
  assert.equal(price(), 3, 'two 乌萨斯 purchases, the other one does not count');
  assert.deepEqual(m.useBandSkill(ps, {}), OK);
  assert.equal(ps.funds, 2);
  assert.equal(price(), 5, 'reset by the use');
});

test('精巧设计: one new equipment replaces an item slot', () => {
  const slots = [{ kind: 'chess', id: 'base_a', basePrice: 1, sold: false }, { kind: 'item', id: 'item_a', basePrice: 2, sold: false }];
  const { m, ps, calls } = fakeMatch('band_equipment', { funds: 0, slots });
  calls.itemId = 'item_new';
  assert.deepEqual(m.useBandSkill(ps, {}), OK);
  assert.deepEqual(calls.slots.at(-1), [1, { kind: 'item', id: 'item_new' }]);
  assert.deepEqual(m.useBandSkill(ps, {}), OK);
  assert.equal(m.useBandSkill(ps, {}).error, 'BAD_TARGET', 'ROUND_RESET x2');
});

test('a handler that finds nothing does not charge or consume the use', () => {
  const { m, ps } = fakeMatch('band_lethania', { funds: 5 });
  const ev = { cost: 1 };
  m.dispatch(ps, 'onBandSkillPrice', ev);
  assert.equal(m.useBandSkill(ps, {}).error, 'BAD_TARGET', 'no 莱塔尼亚 operator in the pool');
  assert.equal(ps.funds, 5);
  assert.equal(ps.bandSkill.uses, 0);
});

test('the target a skill type names is checked before its handler runs', () => {
  // band_survive is COMMON_CHESS (its handler is B3): the target must be a board chess of this player
  const { m, ps } = fakeMatch('band_survive', { funds: 0 });
  assert.equal(m.useBandSkill(ps, {}).error, 'BAD_TARGET');
  assert.equal(m.useBandSkill(ps, { target: { kind: 'chess', uid: 99 } }).error, 'BAD_TARGET');
  // band_transfer is SHOP_SLOT: its slot index must be a live shop slot
  const tr = fakeMatch('band_transfer', { funds: 0, slots: [{ kind: 'chess', id: 'base_a', basePrice: 1, sold: false }] });
  const sk = V.bands.band_transfer.skill;
  assert.equal(tr.m.bandSkillTargetError(tr.ps, sk, { kind: 'shop', slot: 0 }), null);
  assert.equal(tr.m.bandSkillTargetError(tr.ps, sk, { kind: 'shop', slot: 5 }), 'BAD_TARGET');
  assert.equal(tr.m.bandSkillTargetError(tr.ps, sk, null), 'BAD_TARGET');
  assert.equal(tr.m.useBandSkill(tr.ps, { target: { kind: 'shop', slot: 0 } }).error, 'BAD_TARGET',
    'the target is valid, but its handler (B4) is not implemented yet');
});


// ---- B3: skills that operate on one operator ----------------------------------------------------------------

test('至纯凝结: promotes the target, once a match', () => {
  const { m, ps, calls } = fakeMatch('band_upgrade');
  assert.deepEqual(m.useBandSkill(ps, { target: { kind: 'chess', uid: 1 } }), OK);
  assert.deepEqual(calls.promoted, [1]);
  m.round = 4;
  assert.equal(m.useBandSkill(ps, { target: { kind: 'chess', uid: 1 } }).error, 'BAD_TARGET', 'ALL_LIMIT x1');
  assert.equal(m.useBandSkill(ps, { target: { kind: 'chess', uid: 99 } }).error, 'BAD_TARGET', 'not this player’s');
});

test('幻画为真: a copy of the target and of its equipment', () => {
  const { m, ps, calls } = fakeMatch('band_copy');
  calls.pieces = { 1: { uid: 1, kind: 'chess', id: 'golden_own_a', tier: 5, golden: true, items: [{ uid: 11, id: 'item_a' }] } };
  assert.deepEqual(m.useBandSkill(ps, { target: { kind: 'chess', uid: 1 } }), OK);
  assert.deepEqual(calls.granted, ['golden_own_a'], 'the elite state comes with the id');
  assert.deepEqual(calls.items, ['item_a']);
  assert.deepEqual(calls.equipped, [[201, 101]], 'the copy wears the copy');
});

test('御守之力: runs the target’s gain traits now', () => {
  const { m, ps, calls } = fakeMatch('band_gain');
  assert.deepEqual(m.useBandSkill(ps, { target: { kind: 'chess', uid: 1 } }), OK);
  assert.deepEqual(calls.garrison, [[1, 'SERVER_GAIN']]);
  calls.garrisonRuns = 0;
  m.round = 4;
  assert.equal(m.useBandSkill(ps, { target: { kind: 'chess', uid: 1 } }).error, 'BAD_TARGET', 'no trait ran');
  assert.equal(ps.bandSkill.uses, 0, 'a refused use is not consumed');
});

test('强制休整: the target’s prep-end traits run once more at this prep end', () => {
  const { m, ps, calls } = fakeMatch('band_prepfin');
  calls.board = [{ uid: 1, kind: 'chess', id: 'own_a' }];
  assert.deepEqual(m.useBandSkill(ps, { target: { kind: 'chess', uid: 1 } }), OK);
  assert.equal(ps.pieceCounters['1:band:prepfin'], 1);
  m.dispatch(ps, 'onPrepEnd', { round: 3 });
  assert.deepEqual(calls.garrison, [[1, 'SERVER_PREP_FIN']]);
  assert.equal(ps.pieceCounters['1:band:prepfin'], 0, 'spent: a second prep end adds nothing');
  m.dispatch(ps, 'onPrepEnd', { round: 3 });
  assert.equal(calls.garrison.length, 1);
});

test('东之极道: sells the target and layers every active bond by its tier', () => {
  const { m, ps, calls } = fakeMatch('band_sell');
  calls.bonds = { yanShip: { active: true }, miraShip: { active: false } };
  assert.deepEqual(m.useBandSkill(ps, { target: { kind: 'chess', uid: 1 } }), OK);
  assert.deepEqual(calls.sold, [1]);
  assert.deepEqual(calls.layers, [['yanShip', 4, true]], 'tier 4, active bonds only');
});

test('黑白相易: removes the target and gains a 炎 operator of no higher tier', () => {
  const { m, ps, calls } = fakeMatch('band_yan2', { funds: 1 });
  calls.chessId = 'yan_b';
  calls.pieces = { 1: { uid: 1, kind: 'chess', id: 'own_a', tier: 3, golden: false, items: [] } };
  assert.deepEqual(m.useBandSkill(ps, { target: { kind: 'chess', uid: 1 } }), OK);
  assert.deepEqual(calls.destroyed, [1]);
  assert.equal(calls.rolls[0].bond, 'yanShip');
  assert.equal(calls.rolls[0].maxTier, 3);
  assert.deepEqual(calls.granted, ['yan_b']);
  assert.equal(ps.funds, 0, 'cost 1');
});

test('黑白相易: an empty pool does not remove the operator', () => {
  const { m, ps, calls } = fakeMatch('band_yan2', { funds: 1 });
  calls.pieces = { 1: { uid: 1, kind: 'chess', id: 'own_a', tier: 3, golden: false, items: [] } };
  assert.equal(m.useBandSkill(ps, { target: { kind: 'chess', uid: 1 } }).error, 'BAD_TARGET');
  assert.deepEqual(calls.destroyed, []);
  assert.equal(ps.funds, 1);
});

test('正直教官: marks the target with a layer cap equal to the round', () => {
  const { m, ps, calls } = fakeMatch('band_limit');
  m.round = 5;
  assert.deepEqual(m.useBandSkill(ps, { target: { kind: 'chess', uid: 1 } }), OK);
  assert.deepEqual(calls.marks, [[1, { tag: 'layer_cap', bonus: 5 }]]);
});

test('the layer-cap mark reaches the battle unit, and raises the garrison cap', () => {
  const h = makeBattle({
    players: [{
      playerId: 'p1', seat: 0, bonds: [], bandId: null,
      units: [{ uid: 7, kind: 'chess', chessId: 'chess_char_1_01_a', row: 10, col: 5, marks: [{ tag: 'layer_cap', bonus: 4 }] }],
    }],
  });
  h.step(1);
  assert.deepEqual(h.allies().find((u) => u.uid === 7).marks, [{ tag: 'layer_cap', bonus: 4 }]);
  assert.equal(layerCapBonus({ marks: [{ tag: 'layer_cap', bonus: 4 }, { tag: 'layer_cap', bonus: 2 }, { tag: 'other', bonus: 9 }] }), 6);
  assert.equal(layerCapBonus({}), 0);
});
