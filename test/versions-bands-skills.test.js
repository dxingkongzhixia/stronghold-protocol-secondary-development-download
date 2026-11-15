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
import { bandSkillStages, activeBandSkillStage } from '../shared/bandSkill.js';

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
    for (const b of ['yanShip', 'ursusShip', 'kazimierzShip', 'lethaniaShip', 'sargonShip']) {
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
      goldenIdOf: (id) => `golden_${String(id).replace(/^golden_/, '')}`,
      isGolden: (id) => /^golden_/.test(String(id)),
      tierOf: (id) => (V.chess[id] && V.chess[id].tier) || 1,
      chess: (id) => ({ bonds: bondOf(id) }),
      item: (id) => V.items[id] ?? null,
      effect: (id) => V.effects[id] ?? null,
      equipPerChess: 2,
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
    addBandGlobal: (mark) => { calls.globals.push(mark); return calls.global !== false; },
    promotionReward: () => { calls.rewards.push(1); return calls.reward !== false; },
    shopUpDiscount: (v) => { calls.discounts.push(v); return calls.discount !== false; },
    transform: (uid, id) => { calls.transforms.push([uid, id]); return { id }; },
    offerItems: (ids) => { calls.offers.push(ids); return true; },
    pieceBonds: (uid) => (calls.pieceBonds && calls.pieceBonds[uid]) || [],
    teammates: () => calls.teammates || [],
    player: (id) => (calls.players && calls.players[id]) || null,
    seat: 0,
    lp: () => (calls.lp ?? 20),
    maxLp: () => 30,
    setLp: (v) => { calls.lp = v; return v; },
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
    stats: () => ps.stats || {},
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
    bonds: {},
    stats: { gold: 0 },
    board: new Map(),
    dirty() {},
    spend(n) { if (n > this.funds) return false; this.funds -= n; this.spent = (this.spent || 0) + n; return true; },
    _afterSpend(n) { this.afterSpent = (this.afterSpent || 0) + n; },
    find(uid) { return uid === 1 ? { piece: { kind: 'chess', uid: 1, id: 'own_a' } } : null; },
  };
  const calls = {
    rolls: [], granted: [], items: [], slots: [], board: [], funds: 0,
    promoted: [], sold: [], destroyed: [], marks: [], garrison: [], equipped: [], layers: [], globals: [],
    rewards: [], discounts: [], transforms: [], offers: [],
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


// ---- B3b: the battle marks of skill_mark_char_inst_tag, and the unlock chain -----------------------------------

test('the chain picks the stage in force (round / shop level / bond members)', () => {
  const shield = bandSkillStages(V.bands.band_shield);
  assert.equal(shield.length, 2);
  assert.equal(activeBandSkillStage({ round: 6 }, shield).effectId, 'aceffect_band_37');
  assert.equal(activeBandSkillStage({ round: 7 }, shield).effectId, 'aceffect_band_38');
  const iberia = bandSkillStages(V.bands.band_iberia);
  assert.equal(activeBandSkillStage({ bonds: { iberiaShip: { count: 3 } } }, iberia).skill.type, 'NONE');
  assert.equal(activeBandSkillStage({ bonds: { iberiaShip: { count: 4 } } }, iberia).skill.type, 'ACTIVE');
  const takecare = bandSkillStages(V.bands.band_takecare);
  assert.equal(takecare.length, 3);
  assert.equal(activeBandSkillStage({ shopLevel: 2 }, takecare).skill.type, 'PASSIVE');
  assert.equal(activeBandSkillStage({ shopLevel: 3 }, takecare).skill.type, 'PASSIVE');
});

test('the four inst-tag skills mark the target from the official effect records', () => {
  const cases = [
    ['band_survive', { tag: 'revive', count: 2, startDead: true }],
    ['band_evolve', { tag: 'battle_upgrade' }],
    ['band_breakaway', { tag: 'knockdown_summon' }],
  ];
  for (const [band, want] of cases) {
    const f = fakeMatch(band);
    assert.deepEqual(f.m.useBandSkill(f.ps, { target: { kind: 'chess', uid: 1 } }), OK, band);
    assert.deepEqual(f.calls.marks, [[1, want]], band);
  }
});

test('药枚实验 upgrades at round 7 (20 % → 35 %)', () => {
  const early = fakeMatch('band_shield');
  early.m.round = 6;
  assert.deepEqual(early.m.useBandSkill(early.ps, { target: { kind: 'chess', uid: 1 } }), OK);
  assert.deepEqual(early.calls.marks, [[1, { tag: 'shield_on_attack', prob: 0.2, cap: 1 }]]);
  const late = fakeMatch('band_shield');
  late.m.round = 7;
  assert.deepEqual(late.m.useBandSkill(late.ps, { target: { kind: 'chess', uid: 1 } }), OK);
  assert.deepEqual(late.calls.marks, [[1, { tag: 'shield_on_attack', prob: 0.35, cap: 1 }]]);
});

test('出航时刻 is locked below 4 伊比利亚 members, then replaces a shop card twice a round', () => {
  const f = fakeMatch('band_iberia');
  f.calls.chessId = 'iberia_a';
  assert.equal(f.m.useBandSkill(f.ps, { target: { kind: 'shop', slot: 0 } }).error, 'BAD_TARGET', 'locked');
  f.ps.bonds = { iberiaShip: { count: 4, active: true } };
  f.calls.bonds = f.ps.bonds;
  assert.deepEqual(f.m.useBandSkill(f.ps, { target: { kind: 'shop', slot: 0 } }), OK);
  assert.deepEqual(f.calls.slots.at(-1), [0, { kind: 'chess', id: 'iberia_a' }]);
  assert.equal(f.ps.funds, 19, 'cost 1');
  assert.deepEqual(f.m.useBandSkill(f.ps, { target: { kind: 'shop', slot: 0 } }), OK);
  assert.equal(f.m.useBandSkill(f.ps, { target: { kind: 'shop', slot: 0 } }).error, 'BAD_TARGET', '2 a round');
});


// ---- B4: tile and shop-card skills ----------------------------------------------------------------------------

test('纸片替身: a shop card becomes another operator of its tier', () => {
  const f = fakeMatch('band_transfer');
  f.calls.chessId = 'base_other';
  assert.deepEqual(f.m.useBandSkill(f.ps, { target: { kind: 'shop', slot: 0 } }), OK);
  assert.equal(f.calls.rolls[0].tier, 1);
  assert.deepEqual(f.calls.slots.at(-1), [0, { kind: 'chess', id: 'base_other' }]);
  assert.deepEqual(f.m.useBandSkill(f.ps, { target: { kind: 'shop', slot: 0 } }), OK, 'ROUND_RESET x2');
  assert.equal(f.m.useBandSkill(f.ps, { target: { kind: 'shop', slot: 0 } }).error, 'BAD_TARGET');
});

test('溃心领域: marks the chosen tile with the official fear duration, one use until R4', () => {
  const f = fakeMatch('band_dance');
  f.m.round = 3;
  assert.deepEqual(f.m.useBandSkill(f.ps, { target: { kind: 'tile', row: 10, col: 5 } }), OK);
  assert.deepEqual(f.calls.globals, [{ tag: 'fear_tile', row: 10, col: 5, fear: 3 }]);
  assert.equal(f.m.useBandSkill(f.ps, { target: { kind: 'tile', row: 11, col: 6 } }).error, 'BAD_TARGET', 'x1 before R4');
  f.m.round = 4;
  assert.deepEqual(f.m.useBandSkill(f.ps, { target: { kind: 'tile', row: 11, col: 6 } }), OK);
  assert.deepEqual(f.m.useBandSkill(f.ps, { target: { kind: 'tile', row: 11, col: 7 } }), OK, 'R4 → x2');
  assert.equal(f.m.useBandSkill(f.ps, { target: { kind: 'tile', row: 11, col: 8 } }).error, 'BAD_TARGET');
});

test('宝藏探机: the tile mark carries the official chest and its coin; a 3-round cooldown', () => {
  const f = fakeMatch('band_treasure', { funds: 1 });
  assert.deepEqual(f.m.useBandSkill(f.ps, { target: { kind: 'tile', row: 10, col: 6 } }), OK);
  assert.deepEqual(f.calls.globals, [{ tag: 'treasure', row: 10, col: 6, enemyId: 'enemy_9038_achest', coin: 1 }]);
  assert.equal(f.ps.funds, 0, 'cost 1');
  assert.equal(f.ps.bandSkill.cooldownUntil, 3 + 3);
  assert.equal(f.m.useBandSkill(f.ps, { target: { kind: 'tile', row: 10, col: 7 } }).error, 'BAD_TARGET', 'cooling down');
  f.m.round = 6;
  f.ps.funds = 1;
  assert.deepEqual(f.m.useBandSkill(f.ps, { target: { kind: 'tile', row: 10, col: 7 } }), OK);
});

test('电气化！: destroys the shop equipment and lends it to the field next battle', () => {
  const passive = Object.values(V.items).find((x) => x.itemType === 'EQUIP' && x.kind === 'passive' && !x.isGolden);
  assert.ok(passive, 'a plain equipment exists');
  const f = fakeMatch('band_pudd', { funds: 1, slots: [{ kind: 'item', id: passive.id, basePrice: 2, sold: false }] });
  assert.deepEqual(f.m.useBandSkill(f.ps, { target: { kind: 'shop', slot: 0 } }), OK);
  assert.deepEqual(f.calls.globals, [{ tag: 'lend_equip', itemId: passive.id, slots: 2 }]);
  assert.deepEqual(f.calls.slots.at(-1), [0, null], 'destroyed at once');
  assert.equal(f.ps.funds, 0);
});

test('电气化！ refuses equipment that destroys itself on equip', () => {
  const consume = Object.values(V.items).find((x) => String(x.kind || '').startsWith('consume_on_equip') && x.itemType === 'EQUIP' && !x.isGolden);
  assert.ok(consume, 'a consume-on-equip item exists');
  const f = fakeMatch('band_pudd', { funds: 1, slots: [{ kind: 'item', id: consume.id, basePrice: 1, sold: false }] });
  assert.equal(f.m.useBandSkill(f.ps, { target: { kind: 'shop', slot: 0 } }).error, 'BAD_TARGET');
  assert.deepEqual(f.calls.globals, []);
  assert.equal(f.ps.funds, 1, 'not charged');
});


// ---- B5: no-key skills and the remaining prep passives ---------------------------------------------------------

test('条文修正: every active bond of the target gains 9 layers, cooldown 3', () => {
  const f = fakeMatch('band_jenga');
  f.m.round = 4;
  f.calls.pieceBonds = { 1: ['yanShip', 'miraShip'] };
  f.calls.bonds = { yanShip: { active: true }, miraShip: { active: false } };
  assert.deepEqual(f.m.useBandSkill(f.ps, { target: { kind: 'chess', uid: 1 } }), OK);
  assert.deepEqual(f.calls.layers, [['yanShip', 9, true]]);
  assert.equal(f.ps.bandSkill.cooldownUntil, 4 + 3);
  assert.equal(f.m.useBandSkill(f.ps, { target: { kind: 'chess', uid: 1 } }).error, 'BAD_TARGET', 'cooling down');
});

test('条文修正 is locked before round 4', () => {
  const f = fakeMatch('band_jenga');
  f.m.round = 3;
  assert.equal(f.m.useBandSkill(f.ps, { target: { kind: 'chess', uid: 1 } }).error, 'BAD_TARGET');
});

test('不稳定要素: the target becomes a random operator one tier higher', () => {
  const f = fakeMatch('band_mess');
  f.m.round = 4;
  f.calls.chessId = 'tier_up';
  f.calls.pieces = { 1: { uid: 1, kind: 'chess', id: 'own_a', tier: 3, golden: false, items: [] } };
  assert.deepEqual(f.m.useBandSkill(f.ps, { target: { kind: 'chess', uid: 1 } }), OK);
  assert.equal(f.calls.rolls[0].tier, 4);
  assert.deepEqual(f.calls.transforms, [[1, 'tier_up']]);
});

test('不稳定要素 does nothing at tier 6', () => {
  const f = fakeMatch('band_mess');
  f.m.round = 4;
  f.calls.pieces = { 1: { uid: 1, kind: 'chess', id: 'own_a', tier: 6, golden: false, items: [] } };
  assert.equal(f.m.useBandSkill(f.ps, { target: { kind: 'chess', uid: 1 } }).error, 'BAD_TARGET');
  assert.deepEqual(f.calls.transforms, []);
});

test('献身护卫: LP drops to the lowest player, the loss pays (cap 10), the prep end heals them', () => {
  const f = fakeMatch('band_protect');
  f.m.round = 4;
  const mate = { seat: 1, lpValue: 12, lp() { return this.lpValue; }, alive: () => true, setLp(v) { this.lpValue = v; return v; } };
  f.calls.lp = 20;
  f.calls.teammates = [mate];
  assert.deepEqual(f.m.useBandSkill(f.ps, {}), OK);
  assert.equal(f.calls.lp, 12, 'own LP matched the lowest');
  assert.equal(f.ps.funds, 28, '+8 funds (the loss)');
  assert.equal(f.ps.counters['band:protect:seat'], 1);
  f.m.dispatch(f.ps, 'onPrepEnd', {});
  assert.equal(mate.lp(), 20, 'healed by the same amount');
});

test('最佳品味: takes 1 shop operator at 60 spent, 2 at 120', () => {
  const one = fakeMatch('band_rich', { slots: [
    { kind: 'chess', id: 'base_a', basePrice: 1, sold: false },
    { kind: 'chess', id: 'base_b', basePrice: 1, sold: false },
  ] });
  one.ps.stats.gold = 60;
  assert.deepEqual(one.m.useBandSkill(one.ps, {}), OK);
  assert.equal(one.calls.granted.length, 1);
  const two = fakeMatch('band_rich', { slots: [
    { kind: 'chess', id: 'base_a', basePrice: 1, sold: false },
    { kind: 'chess', id: 'base_b', basePrice: 1, sold: false },
  ] });
  two.ps.stats.gold = 120;
  assert.deepEqual(two.m.useBandSkill(two.ps, {}), OK);
  assert.equal(two.calls.granted.length, 2);
  const locked = fakeMatch('band_rich');
  locked.ps.stats.gold = 59;
  assert.equal(locked.m.useBandSkill(locked.ps, {}).error, 'BAD_TARGET', 'locked below 60');
});

test('二重奏: the round first elite merge offers one more promotion reward', () => {
  const f = fakeMatch('band_bonus');
  f.m.dispatch(f.ps, 'onMerge', { kind: 'chess' });
  f.m.dispatch(f.ps, 'onMerge', { kind: 'chess' });
  assert.equal(f.calls.rewards.length, 1);
  f.m.round = 4;
  f.m.dispatch(f.ps, 'onMerge', { kind: 'chess' });
  assert.equal(f.calls.rewards.length, 2, 'a new round offers it again');
});

test('精巧设计: the round first equipment merge offers 3 items', () => {
  const f = fakeMatch('band_equipment');
  f.calls.itemId = 'item_new';
  f.m.dispatch(f.ps, 'onMerge', { kind: 'item' });
  f.m.dispatch(f.ps, 'onMerge', { kind: 'item' });
  const ids = f.calls.offers.flat();
  assert.ok(ids.length >= 1 && ids.length <= 3);
  assert.equal(f.calls.offers.length, 1, 'once a round');
});

test('沙洲梦魇: every 3 萨尔贡 gained earns -3 on the current level upgrade', () => {
  const f = fakeMatch('band_sargon');
  for (let i = 0; i < 3; i++) f.m.dispatch(f.ps, 'onGain', { piece: { kind: 'chess', id: 'base_sargon' }, kind: 'chess' });
  assert.deepEqual(f.calls.discounts, [3]);
  for (let i = 0; i < 3; i++) f.m.dispatch(f.ps, 'onGain', { piece: { kind: 'chess', id: 'base_sargon' }, kind: 'chess' });
  assert.deepEqual(f.calls.discounts, [3, 3], 'every 3 gains');
});
