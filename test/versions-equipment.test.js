// test/versions-equipment.test.js — 规程's separate equipment area (PRTS 卫戍协议·规程: 独立 5 格装备区;
// official constData.maxDeckEquipmentChessCnt): items are stored there instead of the hand, equip from it, and merge
// across it. The default 盟约 data has no such area (items keep sharing the hand).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, setData, resetData } from '../server/data.js';
import { makeMatch, give, DATA } from './match/harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
after(() => resetData());

const ITEM = 'chess_item_1_01_e_a';
const GOLDEN = 'chess_item_1_01_e_b';

function versionPrep() {
  const data = loadData(DIR, { log: quiet });
  setData(data);
  const h = makeMatch({ mode: 'solo', humans: 1, seed: 21, data });
  h.start();
  h.autoHumans();
  h.toPrep(1);
  return { h, ps: h.ps('p_0') };
}

test('规程: the equipment area has 5 slots and a bought item goes there', () => {
  const { ps } = versionPrep();
  assert.equal(ps.equipHand.length, 5);
  const handBefore = ps.hand.filter(Boolean).length;
  ps.shop.slots = [{ kind: 'item', id: ITEM, basePrice: 2, sold: false }];
  ps.funds = 5;
  assert.deepEqual(ps.buy(0), { ok: true });
  assert.ok(ps.equipHand.some((p) => p && p.id === ITEM), 'the item is in the equipment area');
  assert.equal(ps.hand.filter(Boolean).length, handBefore, 'the hand is untouched');
});

test('规程: equipping takes the item from the equipment area', () => {
  const { h, ps } = versionPrep();
  const chess = give(h.m, ps, 'chess_char_1_01_a', 'hand', 0);
  const item = ps.acquireItem(ITEM);
  assert.ok(item && ps.equipHand.some((p) => p && p.uid === item.uid));
  assert.deepEqual(ps.equip(item.uid, chess.uid), { ok: true });
  assert.equal(ps.find(item.uid).area, 'equipped');
  assert.ok(!ps.equipHand.some((p) => p && p.uid === item.uid));
});

test('规程: two identical items merge into the golden one inside the equipment area', () => {
  const { ps } = versionPrep();
  ps.acquireItem(ITEM);
  const second = ps.acquireItem(ITEM);
  assert.ok(second, 'the second copy was acquired');
  const items = ps.equipHand.filter(Boolean);
  assert.equal(items.length, 1, 'merged into one piece');
  assert.equal(items[0].id, GOLDEN);
});

test('规程: Ironhide carries 4 / 6 items (official equipSlotNum); other operators 2', () => {
  const data = loadData(DIR, { log: quiet });
  setData(data);
  const h = makeMatch({ mode: 'solo', humans: 1, seed: 23, data });
  h.start();
  h.autoHumans();
  h.toPrep(1);
  const ps = h.ps('p_0');
  assert.equal(h.m.gd.equipSlotsOf('chess_char_5_22_a'), 4);
  assert.equal(h.m.gd.equipSlotsOf('chess_char_5_22_b'), 6);
  assert.equal(h.m.gd.equipSlotsOf('chess_char_1_01_a'), 2);
  const ids = Object.keys(data.items)
    .filter((id) => { const it = data.items[id]; return it.itemType === 'EQUIP' && !it.isGolden && !String(it.kind || '').startsWith('consume'); })
    .slice(0, 8);
  const iron = give(h.m, ps, 'chess_char_5_22_a', 'hand');
  for (const id of ids.slice(0, 4)) {
    const it = ps.acquireItem(id);
    assert.ok(it, `${id} acquired`);
    assert.deepEqual(ps.equip(it.uid, iron.uid), { ok: true }, id);
  }
  assert.equal(iron.items.length, 4, 'the fourth item fits Ironhide');
  const normal = give(h.m, ps, 'chess_char_1_01_a', 'hand');
  for (const id of ids.slice(4, 7)) {
    const it = ps.acquireItem(id);
    assert.ok(it, `${id} acquired`);
    ps.equip(it.uid, normal.uid);
  }
  assert.equal(normal.items.length, 2, 'a two-slot operator replaces the oldest');
});

test('the default 盟约 match keeps items in the hand (no equipment area)', () => {
  const h = makeMatch({ mode: 'solo', humans: 1, seed: 22, fake: true, data: DATA }).start();
  h.toPrep(1);
  const ps = h.ps('p_0');
  assert.equal(ps.equipHand.length, 0);
  const item = ps.acquireItem(ITEM);
  assert.ok(item && ps.hand.some((p) => p && p.uid === item.uid));
});
