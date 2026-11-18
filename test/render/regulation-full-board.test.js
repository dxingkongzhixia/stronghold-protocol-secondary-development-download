// 规程's preview pen is the official one: rows 14–18, cols 7–13 (PEN_RECT) inside the 19×21 grid, taken from the level's
// sub_03 rows 7–11. The prep/pen cameras build that pen block (AREAS.normal's rows 13–18 area) and the pen's own glyphs
// carry its two gates; the ten stages match the mainline field: row 8 holds only the five equipment pads and no stage
// overrides enemy_place_rect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boardArea, restView } from '../../public/js/render/app/view.js';
import { PEN_RECT, penZones } from '../../public/js/render/pen.js';

const stages = JSON.parse(readFileSync(new URL('../../data/versions/act3autochess-v3_1/stages.json', import.meta.url), 'utf8'));
const MAPS = Object.keys(stages).filter((k) => /^act3autochess_m\d+$/.test(k)).sort();

test('规程 maps: five equipment pads in row 8, the official pen in rows 14–18, no custom rect', () => {
  assert.equal(MAPS.length, 10);
  for (const id of MAPS) {
    const s = stages[id];
    assert.equal(s.config?.enemy_place_rect, undefined, id + ': no enemy_place_rect');
    assert.equal(s.rows[8], '####AAAAA############', id + ': row 8 is the five tile_acbag pads');
    assert.equal(s.rows[14], '#######fffffff#######', id + ': pen floor');
    assert.equal(s.rows[15], '#######Sffffff#######', id + ': pen gate row');
    assert.equal(s.rows[16], '#######ppppppp#######', id + ': pen row not placeable');
    assert.equal(s.rows[17], '#######fffffff#######', id + ': pen floor');
    assert.equal(s.rows[18], '#######Sffffff#######', id + ': pen gate row');
    assert.equal(s.tiles.p?.bb?.previewNotAlloed, 1, id + ': the pen row forbids placement');
    assert.deepEqual(penZones(s).rect, PEN_RECT, id + ': the default pen rect');
    assert.deepEqual(penZones(s).zones.map((z) => z.anchor), [[15, 7], [18, 7]], id + ': the pen gates');
  }
});

test('prep builds the pen block with the field, a battle the field alone', () => {
  assert.equal(restView('prep').pen, true);
  assert.equal(restView('normal').pen, false);
  assert.ok(boardArea('prep').some((a) => a.r0 === 13 && a.r1 === 18), 'the prep camera builds the pen block');
  assert.equal(boardArea('normal').some((a) => a.r1 === 18), false, 'a battle builds the field alone');
});

test('规程: both halves in every view, the official pen only with prep / pen', () => {
  const has = (area, r0, r1, c0, c1) => area.some((a) => a.r0 === r0 && a.r1 === r1 && a.c0 === c0 && a.c1 === c1);
  const prep = boardArea('prep', true);
  assert.ok(has(prep, 6, 13, 0, 20), 'the whole battlefield, both halves');
  assert.ok(has(prep, 13, 18, 6, 14), 'the official preview pen');
  const battle = boardArea('normal', true);
  assert.ok(has(battle, 6, 13, 0, 20), 'a battle keeps both halves');
  assert.equal(battle.some((a) => a.r1 > 13), false, 'a battle never builds the pen');
  assert.deepEqual(restView('prep', true).area, prep);
  // 盟约 is untouched: its prep keeps the own half only (plus the pen behind the upper gate)
  assert.equal(boardArea('prep').some((a) => a.c1 > 10 && a.r1 <= 13), false);
});
