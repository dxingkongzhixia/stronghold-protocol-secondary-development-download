// test/ui/equip-area.test.js — 规程's equipment area: it is drawn on row 8's five tile_acbag tiles (the pads 盟约 uses
// for its temp row), so its pads are GEO.TEMP_*; the picker's targets are the board / hand operators with a free slot
// (g.equip).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equipTargets, equipItemOf, EQUIP_SLOT_COLS } from '../../public/js/ui/equipRow.js';
import { GEO } from '../../shared/constants.js';

const op = (uid, items = 0, kind = 'chess') => ({ uid, kind, id: 'c' + uid, items: Array.from({ length: items }, (_, i) => ({ uid: uid * 10 + i, id: 'item' })) });

test('the five equipment pads are row 8, cols 4–8 (the temp row geometry)', () => {
  assert.equal(GEO.TEMP_ROW, 8);
  assert.deepEqual([...EQUIP_SLOT_COLS], [4, 5, 6, 7, 8]);
  assert.equal(EQUIP_SLOT_COLS[0], GEO.TEMP_C0);
  assert.equal(EQUIP_SLOT_COLS.length, GEO.TEMP_SIZE);
});

test('the equipment item of a uid (规程 only; 盟约 has an empty area)', () => {
  const priv = { equipHand: [null, { uid: 7, kind: 'item', id: 'item_x' }, null, null, null] };
  assert.equal(equipItemOf(priv, 7)?.uid, 7);
  assert.equal(equipItemOf(priv, 8), null);
  assert.equal(equipItemOf(priv, '7'), null);
  assert.equal(equipItemOf({}, 7), null);
  assert.equal(equipItemOf(null, 7), null);
});

test('targets: board and hand operators with a free slot, in board-then-hand order', () => {
  const priv = {
    board: [op(1, 0), op(2, 2), op(3, 1)],
    hand: [null, op(4, 0), { uid: 5, kind: 'item', id: 'item_x' }, op(6, 2)],
  };
  assert.deepEqual(equipTargets(priv, 2).map((p) => p.uid), [1, 3, 4]);
  assert.deepEqual(equipTargets(priv, 3).map((p) => p.uid), [1, 2, 3, 4, 6], 'a third slot opens every carrier');
  assert.deepEqual(equipTargets({}, 2), []);
});
