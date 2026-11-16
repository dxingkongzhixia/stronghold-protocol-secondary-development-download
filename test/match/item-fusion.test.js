// Official playtest 2026-11-14: acquiring a combination partner fuses an owned component, including one already
// equipped, into an unequipped result. A prep-end grant waits for the next prep start (deferMerge + pendingFusion)
// so it never takes an equipped partner off for the fight about to start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getVersionData } from '../../server/data.js';
import { GEO } from '../../shared/constants.js';
import { makeMatch, give, giveItem, legalTileFor } from './harness.js';

const data = getVersionData('act3autochess@V3_1', { log: { warn() {}, error() {}, info() {} } });
const pairs = Object.values(data.items).filter((r) => r.canFuse === true && r.id < r.fuseWith);
const OP = 'chess_char_1_11_a';
const pairIds = new Set(pairs.flatMap((r) => [r.id, r.fuseWith, r.fuseResult]));
const FILLERS = Object.values(data.items)
  .filter((i) => i.itemType === 'EQUIP' && !i.isGolden && !i.canFuse && !pairIds.has(i.id))
  .map((i) => i.id);

function setup(t) {
  const h = makeMatch({ data, mode: 'solo', modeId: 'mode_single_1', seed: 41, fake: true })
    .start().toPrep(1, { band: 'band_amiya' });
  t.after(() => { assert.equal(h.m.errorCount, 0); h.m.dispose(); });
  const ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean), ...ps.temp.filter(Boolean)]) {
    if (p && p.kind === 'chess') ps.returnCopies(p);
  }
  ps.board.clear();
  ps.hand.fill(null);
  ps.temp = new Array(GEO.TEMP_SIZE).fill(null);
  ps.equipHand.fill(null);
  ps._tempDue.clear();
  ps.offers = [];
  ps.funds = 50;
  ps.shop.level = 5;
  ps.recompute();
  return { m: h.m, ps };
}

/** Move an owned item to a specific container, or equip it on a carrier standing on the board / in the hand. */
function place(m, ps, piece, where) {
  const loc = ps.find(piece.uid);
  if (where === 'equip') return null;
  if (where === 'temp') {
    ps._detach(loc);
    ps.temp[0] = piece;
    return null;
  }
  if (where === 'hand') {
    ps._detach(loc);
    ps.hand[0] = piece;
    return null;
  }
  if (where === 'hidden') {
    ps._detach(loc);
    for (let i = 0; i < ps.equipHand.length; i++) ps.equipHand[i] = ps.newPiece('item', FILLERS[i]);
    for (let i = 0; i < GEO.TEMP_SIZE; i++) ps.temp[i] = ps.newPiece('item', FILLERS[ps.equipHand.length + i]);
    ps.stow(piece, { allowTemp: true });
    assert.ok(ps.find(piece.uid).idx >= GEO.TEMP_SIZE, 'the component waits in the hidden overflow');
    return null;
  }
  const carrier = where === 'board'
    ? give(m, ps, OP, 'board', legalTileFor(m, ps, OP))
    : give(m, ps, OP, 'hand');
  const eq = ps.equip(piece.uid, carrier.uid);
  assert.ok(eq.ok, eq.detail || eq.error);
  return carrier;
}

test('the 规程 carries the five official combination pairs, symmetric with an EQUIP result', () => {
  assert.equal(pairs.length, 5);
  for (const r of pairs) {
    const other = data.items[r.fuseWith];
    assert.ok(other, `${r.id}: partner ${r.fuseWith} exists`);
    assert.equal(other.fuseWith, r.id, `${r.id}: reciprocal partner`);
    assert.equal(other.fuseResult, r.fuseResult);
    assert.equal(r.fuseResult, other.fuseResult);
    assert.equal(data.items[r.fuseResult]?.itemType, 'EQUIP');
    assert.notEqual(data.items[r.fuseResult].isGolden === true && data.items[r.fuseResult].canFuse === true, true);
  }
});

for (const recipe of pairs) {
  for (const reverse of [false, true]) {
    for (const where of ['temp', 'equip', 'hand', 'board', 'bench', 'hidden']) {
      const [first, second] = reverse ? [recipe.fuseWith, recipe.id] : [recipe.id, recipe.fuseWith];
      test(`fusion on acquire: ${first} + ${second}, partner in ${where}`, (t) => {
        const { m, ps } = setup(t);
        const old = ps.acquireItem(first);
        assert.ok(old);
        const carrier = place(m, ps, old, where);
        const before = ps.stats.itemMerges;
        const merged = ps.acquireItem(second);
        assert.equal(merged.id, recipe.fuseResult);
        assert.equal(ps.find(old.uid), null);
        assert.equal(ps._itemLocations(second).length, 0);
        assert.notEqual(ps.find(merged.uid).area, 'equipped');
        assert.equal(ps.stats.itemMerges, before + 1);
        if (carrier) assert.deepEqual(carrier.items, [], 'a full carrier loses only the fused partner');
      });
    }
  }
}

test('shop purchase and a free reward both fuse instead of requiring an equip action', (t) => {
  const { ps } = setup(t);
  const r = pairs[0];
  ps.acquireItem(r.id);
  ps.shop.slots = [{ kind: 'item', id: r.fuseWith, basePrice: 3, sold: false }];
  assert.ok(ps.buy(0).ok);
  assert.equal(ps._itemLocations(r.fuseResult).length, 1);
  ps.acquireItem(r.id);
  ps.pushItemOffer([r.fuseWith]);
  assert.ok(ps.pickReward(0).ok);
  assert.equal(ps._itemLocations(r.fuseResult).length, 2);
});

test('a deferred prep-end grant keeps the equipped partner until the next prep releases it', (t) => {
  const { m, ps } = setup(t);
  const r = pairs[0];
  const carrier = give(m, ps, OP, 'hand');
  const old = ps.acquireItem(r.id);
  assert.ok(ps.equip(old.uid, carrier.uid).ok);
  for (let i = 0; i < GEO.TEMP_SIZE; i++) giveItem(m, ps, FILLERS[i], 'temp', i);
  const gained = ps.acquireItem(r.fuseWith, { deferMerge: true });
  assert.equal(gained.id, r.fuseWith);
  assert.equal(gained.deferMerge, true);
  assert.equal(gained.pendingFusion, true);
  assert.deepEqual(carrier.items.map((it) => it.id), [r.id]);
  assert.equal(ps._itemLocations(r.fuseResult).length, 0);
  ps.checkItemMerges();
  assert.equal(ps.find(old.uid)?.piece, old, 'a merge scan that does not release the mark leaves the partner equipped');
  assert.equal(gained.deferMerge, true);
  assert.equal(ps._itemLocations(r.fuseResult).length, 0);
  const before = ps.stats.itemMerges;
  ps.checkItemMerges({ releaseDeferred: true });
  assert.deepEqual(carrier.items, []);
  assert.equal(ps.stats.itemMerges, before + 1);
  const merged = ps._itemLocations(r.fuseResult)[0].piece;
  assert.equal(merged.deferMerge, undefined);
  assert.equal(merged.pendingFusion, undefined);
  assert.equal(ps.find(gained.uid), null);
  assert.notEqual(ps.find(merged.uid).area, 'equipped');
});

test('no item pool means no combination and no throw', (t) => {
  const { m, ps } = setup(t);
  const r = pairs[0];
  const old = ps.acquireItem(r.id);
  const incoming = ps.acquireItem(r.fuseWith, { deferMerge: true });
  assert.equal(incoming.pendingFusion, true);
  const pool = m.itemPool;
  m.itemPool = null;
  try {
    assert.equal(ps._itemFusionPartner(r.id), null);
    assert.equal(ps._itemFusionPartner(r.fuseWith), null);
    ps.checkItemMerges({ releaseDeferred: true });
    assert.equal(ps.find(old.uid)?.piece, old);
    assert.equal(ps.find(incoming.uid)?.piece, incoming);
    assert.equal(ps._itemLocations(r.fuseResult).length, 0);
  } finally {
    m.itemPool = pool;
  }
});

test('a full row with a visible partner has room for its result and emits no temp-overflow notice', (t) => {
  const { m, ps } = setup(t);
  const r = pairs[0];
  const component = ps.acquireItem(r.id);
  assert.ok(component);
  for (let i = 0; i < ps.equipHand.length - 1; i++) ps.equipHand[i] = ps.newPiece('item', FILLERS[i]);
  for (let i = 0; i < GEO.TEMP_SIZE; i++) ps.temp[i] = ps.newPiece('item', FILLERS[ps.equipHand.length + i]);
  const notices = [];
  const toast = m.toast.bind(m);
  m.toast = (...args) => { notices.push(args); return toast(...args); };
  const result = ps.acquireItem(r.fuseWith);
  assert.ok(ps.find(result.uid).idx < ps.equipHand.length);
  assert.equal(ps.find(result.uid).area, 'equip');
  assert.equal(notices.length, 0);
});

test('fusion hooks see the complete inventory and fire one merge, one gain and no equip', (t) => {
  const { m, ps } = setup(t);
  const r = pairs[0];
  const old = ps.acquireItem(r.id);
  const seen = [];
  const dispatch = m.dispatch.bind(m), item = m.dispatchItem.bind(m);
  const check = (hook) => {
    assert.equal(ps._itemLocations(r.id).length, 0);
    assert.equal(ps._itemLocations(r.fuseWith).length, 0);
    assert.equal(ps._itemLocations(r.fuseResult).length, 1);
    seen.push(hook);
  };
  m.dispatch = (owner, hook, ev, ...rest) => {
    if (owner === ps && ['onMerge', 'onGain'].includes(hook)) { check(hook); assert.equal(ev.piece.id, r.fuseResult); }
    return dispatch(owner, hook, ev, ...rest);
  };
  m.dispatchItem = (owner, it, holder, hook, ev) => {
    if (owner === ps) check(hook);
    return item(owner, it, holder, hook, ev);
  };
  const result = ps.acquireItem(r.fuseWith);
  assert.equal(ps.find(old.uid), null);
  assert.equal(ps.find(result.uid).area, 'equip');
  assert.deepEqual(seen, ['onDestroy', 'onDestroy', 'onMerge', 'onGain']);
});

for (const fault of ['missing result', 'result stock']) {
  test(`fusion keeps both components when ${fault} is unavailable`, (t) => {
    const { m, ps } = setup(t);
    const r = pairs[0];
    const old = ps.acquireItem(r.id);
    const item = m.gd.item.bind(m.gd), canGain = m.itemPool.canGain.bind(m.itemPool);
    if (fault === 'missing result') m.gd.item = (id) => (id === r.fuseResult ? null : item(id));
    else m.itemPool.canGain = (id) => (id === r.fuseResult ? false : canGain(id));
    const before = ps.stats.itemMerges;
    const incoming = ps.acquireItem(r.fuseWith);
    assert.equal(incoming.id, r.fuseWith);
    assert.ok(ps.find(old.uid));
    assert.ok(ps.find(incoming.uid));
    assert.equal(ps.stats.itemMerges, before);
  });
}
