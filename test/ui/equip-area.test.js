// test/ui/equip-area.test.js — 规程's equipment drawer (public/js/ui/equipArea.js): its targets are the board / hand
// operators with a free equipment slot (g.equip), and the drawer renders nothing without m.private.equipHand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equipTargets, equipRowRect } from '../../public/js/ui/equipArea.js';

const op = (uid, items = 0, kind = 'chess') => ({ uid, kind, id: 'c' + uid, items: Array.from({ length: items }, (_, i) => ({ uid: uid * 10 + i, id: 'item' })) });

test('the equipment row rect: the five tile_acbag tiles, in the view’s client space', () => {
  const rows = Array.from({ length: 19 }, (_, r) => (r === 8 ? '####AAAAA###fffffff##' : '#'.repeat(21)));
  const stage = { rows, tiles: { A: { tileKey: 'tile_acbag' }, '#': { tileKey: 'tile_forbidden' }, f: { tileKey: 'tile_floor' } } };
  const view = { tileScreen: (r, c) => ({ x: 100 + c * 10, y: 200 + r * 10, s: 10 }) };
  assert.deepEqual(equipRowRect(stage, view), { left: 135, top: 275, width: 50, height: 10, row: 8, c0: 4, c1: 8 });
  assert.equal(equipRowRect(stage, null), null, 'no view: the fallback drawer keeps its old place');
  assert.equal(equipRowRect({ rows, tiles: { A: { tileKey: 'tile_road' } } }, view), null, 'no equipment tiles');
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
