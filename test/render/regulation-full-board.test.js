// test/render/regulation-full-board.test.js — 规程's field is one board with both halves: the preview pen lives outside
// the 19×21 grid (enemy_place_rect cols 21–27), so the prep/normal view builds the right lane too and the camera frames
// it. The default 盟约 field keeps its old left-half-only prep area.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardArea, fullField } from '../../public/js/render/app/view.js';
import { penZones } from '../../public/js/render/pen.js';

const stage = (rect) => ({ id: 's', config: rect ? { enemy_place_rect: rect } : {}, rows: [], tiles: {} });
const has = (area, r0, r1, c0, c1) => area.some((a) => a.r0 === r0 && a.r1 === r1 && a.c0 === c0 && a.c1 === c1);

test('规程: the pen outside the grid marks a full board, and both halves are built for prep and normal', () => {
  const s = stage('((8,21),(12,27))');
  assert.equal(fullField(s), true);
  const prep = boardArea('prep', s);
  assert.ok(has(prep, 6, 13, 0, 10), 'the own half');
  assert.ok(has(prep, 6, 13, 11, 20), 'the right lane is the same board, not a teammate');
  const normal = boardArea('normal', s);
  assert.ok(has(normal, 6, 13, 11, 20), 'the battle sees the right lane too');
  assert.equal(penZones(s).rect.c0, 21);
  assert.deepEqual(penZones(s).zones.map((z) => z.anchor), [[9, 21], [12, 21]]);
});

test('盟约: no custom rect, the prep/normal view keeps the left half only', () => {
  for (const s of [stage(null), stage('((14,7),(18,13))')]) {
    assert.equal(fullField(s), false);
    assert.equal(has(boardArea('prep', s), 6, 13, 11, 20), false);
    assert.equal(has(boardArea('normal', s), 6, 13, 11, 20), false);
  }
  assert.equal(fullField(null), false);
});
