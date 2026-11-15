// test/ui/equipment-report.test.js — 规程's 装备报告 tab model (public/js/ui/enemyDrawer.js equipmentReport): the separate
// equipment area and each board / hand / temp operator's equipped items. The version build writes economy.equipHandSize
// (5); the default 盟约 config has none, so its drawer keeps the two tabs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { equipmentReport } from '../../public/js/ui/enemyDrawer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const op = (uid, items = 0) => ({ uid, kind: 'chess', id: `c${uid}`, items: Array.from({ length: items }, (_, i) => ({ uid: uid * 10 + i, id: `item_${uid}_${i}` })) });

test('the report lists the equipment area, then holders in board → hand → temp order', () => {
  const priv = {
    equipHand: [{ uid: 90, kind: 'item', id: 'item_a' }, null, { uid: 91, kind: 'item', id: 'item_b' }],
    board: [op(1, 0), op(2, 2)],
    hand: [op(3, 1), null, { uid: 4, kind: 'item', id: 'item_x' }],
    temp: [op(5, 1)],
  };
  const { area, holders, equipped } = equipmentReport(priv);
  assert.deepEqual(area.map((x) => x.uid), [90, 91]);
  assert.deepEqual(holders.map((h) => h.piece.uid), [2, 3, 5]);
  assert.equal(equipped, 4);
  assert.deepEqual(holders[0].items.map((x) => x.uid), [20, 21]);
});

test('empty / missing fields make an empty report', () => {
  assert.deepEqual(equipmentReport({}), { area: [], holders: [], equipped: 0 });
  assert.deepEqual(equipmentReport(null), { area: [], holders: [], equipped: 0 });
});

test('only the version config carries the equipment area size (the tab gate)', () => {
  assert.equal(load('data/versions/act3autochess-v3_1/config.json').economy.equipHandSize, 5);
  assert.equal(load('data/config.json').economy?.equipHandSize ?? 0, 0);
});
