// The 联防 (unite) field is drawn on the ROUND's own stage, opened to both halves — the same full arena the round's
// players played on (owner decision: GitHub #41's escaped map, a narrow road, is not used).
// server/match/match/unitePhase.js `_uniteOpts.stageId` is the match stage; screens/game.js sets that stage on the
// field view (no field-on-its-own-map override). This pins the client-side setup that must not be blank:
//   * the camera kind is 'unite' (never a fall-through to 'normal', whose rect is half the map);
//   * the drawn rows / 3D area cover the field rows (rows 6–13, the whole 19×21 map);
//   * the round stage has drawn tiles in those rows for BOTH boards (2D tiles layer + 3D classification) —
//     a board with 0 tiles is the reported symptom;
//   * the two escaped map records (data only — the escape wave's source levels) and every battle stage still resolve
//     every glyph / tileKey to renderer art.
// The field/stage selection itself (screens/game.js) needs a live view; the geometry below is what it feeds.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GEO } from '../../shared/constants.js';
import { parseStage } from '../../public/js/render/tiles.js';
import { classifyStage, buildBoard, AREAS, ROWS, COLS } from '../../public/js/render/board3d/layout.js';
import { SURFACES } from '../../public/js/render/board3d/atlas.js';
import { GLYPH, TILEKEY_GLYPH } from '../../public/js/render/style.js';
import { MATERIALS } from '../../public/js/render/textures.js';
import { viewKind, boardArea, bandFor, fieldRows } from '../../public/js/render/app/view.js';
import { Battle } from '../../server/sim/Battle.js';
import { DataSource } from '../../server/sim/simdata.js';
import { fieldStageId } from '../../public/js/battle/runner.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stages = JSON.parse(readFileSync(path.join(ROOT, 'data/stages.json'), 'utf8'));

/** Drawn tiles of the 2D tiles layer for a band/field (render/tiles.js parseStage → the board's own grid). */
const drawn2D = (stage, band, field) => parseStage(stage, band, field).flat().filter((t) => t.drawn).length;
/** Drawn tiles of the 3D board for the unite area (board3d/layout.js classifyStage). */
function drawn3D(stage) {
  const g = classifyStage(stage, AREAS.unite);
  let n = 0;
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c] && g[r][c].drawn) n++;
  return n;
}

describe('联防 board (the unite field draws the round\'s full arena)', () => {
  // the stage the 联防 round uses: the match's own battle stage (one of the mode's stages), not an escaped map
  for (const id of ['act2autochess_m01', 'act1autochess_m01']) {
    test(`${id} (the round's stage): camera, rows/area and both boards produce tiles`, () => {
      const stage = stages[id];
      assert.ok(stage, `${id} is in data/stages.json`);
      assert.notEqual(stage.kind, 'unite');

      // the camera the client asks for (screens/game.js setCam(field.kind)); a 'normal' fall-through frames half the map
      assert.equal(viewKind('unite', { rect: { ...GEO.UNITE_RECT } }), 'unite');
      assert.deepEqual(GEO.UNITE_RECT, { r0: 9, r1: 12, c0: 0, c1: 20 }, 'the ‹ › overview rect spans both halves');
      assert.deepEqual(fieldRows('unite'), [6, 13], 'the 2D board draws the field rows');
      assert.deepEqual(bandFor('unite'), [6, 13], 'the 2D board band is the field rows');
      const area = boardArea('unite');
      assert.ok(area.length > 0, 'boardArea("unite") builds the joined halves (never empty)');
      assert.equal(area[0].c1, 20, 'the 3D area spans the whole width (cols 0–20)');
      assert.deepEqual(stage.size, [ROWS, COLS], 'the whole 19×21 map');

      // a blank board is exactly 0 drawn tiles; the full arena has floor in rows 6–13 for both boards
      assert.ok(drawn2D(stage, [6, 13], [6, 13]) > 0, 'the 2D tiles layer draws the arena');
      assert.ok(drawn2D(stage, [9, 12], [9, 12]) > 0, 'the 2D board draws the framed field rows');
      assert.ok(drawn3D(stage) > 0, 'the 3D board builds the arena');
    });
  }

  test('the escaped map records still exist (data only) and are the escape wave\'s source levels', () => {
    for (const id of ['act1autochess_escaped_single', 'act1autochess_escaped_multi']) {
      const s = stages[id];
      assert.ok(s, `${id} record is in data/stages.json`);
      assert.equal(s.kind, 'unite');
      assert.equal(s.active, false, 'a record, not a drawable battlefield');
      assert.equal(s.rows.length, ROWS);
      // row 9 is the road the escaped template's routes cross; the two halves join at col 10
      assert.equal(s.rows[9][10], 'S', 'the join tile (9,10)');
      assert.ok(s.deployTiles && s.deployTiles.normal && s.deployTiles.normal.melee.length > 0, 'deployable tiles exist');
    }
  });

  // A viewer whose battle stage is unresolved: the requested id must survive so the client still resolves the match /
  // field data (a spectator whose first field is the 联防 had no earlier board to keep). The old Battle fallback rewrote
  // the requested stage id to 'empty', so the field meta named no drawable stage and the viewer saw no board.
  test('a viewer whose battle stage is unresolved still draws the board (the requested id is kept)', () => {
    const stageId = 'act2autochess_m01';
    const stage = stages[stageId];
    // a data source that cannot resolve the requested stage (the viewer's stage data is missing/partial)
    const without = { ...stages };
    delete without[stageId];
    const battle = new Battle({ kind: 'unite', stageId, rect: { ...GEO.UNITE_RECT }, content: 'none', data: new DataSource({ stages: without }, null) });
    assert.equal(battle.stageId, stageId, 'the requested stage id is preserved, NOT rewritten to "empty"');
    assert.equal(battle.stageResolved, false, 'the sim knows its own geometry did not resolve');
    assert.deepEqual(battle.stage.rows, [], 'the unresolved battle itself has no geometry (the reported blank field)');

    // the field the client receives still names the requested stage
    assert.equal(battle.fieldMeta().stageId, stageId, 'fieldMeta().stageId names the stage');
    // the runner's field stage: the field meta wins, the spec is the fallback, never the 'empty' sentinel
    assert.equal(fieldStageId({ stageId: 'empty' }, { stageId }), stageId, 'unresolved sim → the spec stage');
    assert.equal(fieldStageId({ stageId }, { stageId: 'other' }), stageId, 'the field meta wins');
    assert.equal(fieldStageId({ stageId: 'empty' }, {}), null, 'no stage named anywhere → none');
    // and the board the client builds from that id is the stage, not an empty one
    const resolved = stages[fieldStageId(battle.fieldMeta(), { stageId })];
    assert.deepEqual(resolved.rows, stage.rows, 'the field stage id resolves to the stage');
    assert.ok(drawn2D(resolved, [6, 13], [6, 13]) > 0, 'the 2D board draws the resolved stage');
    assert.ok(drawn3D(resolved) > 0, 'the 3D board builds the resolved stage');
  });

  test('a genuinely stage-less battle keeps the "empty" fallback (no requested id to keep)', () => {
    const battle = new Battle({ kind: 'normal', content: 'none', data: new DataSource({ stages: {} }, null) });
    assert.equal(battle.stageId, 'empty', 'no stage requested → the empty sentinel stays');
    assert.equal(battle.stageResolved, false);
  });
});

// Every glyph / tileKey the 联防 round can draw must resolve through render/style.js GLYPH / TILEKEY_GLYPH to a 2D
// MATERIALS material AND a 3D SURFACES surface, and the 3D unite area must build real geometry. This covers BOTH the
// stage the round now uses (the battle stages) and the escaped map records (the escape wave's source levels): a
// mapping gap would show the reported "board renders but the terrain content is missing (units still drawn)".
describe('联防 round: every stage it can draw resolves to renderer art', () => {
  const ids = [...Object.keys(stages).filter((id) => stages[id].kind !== 'unite'), 'act1autochess_escaped_single', 'act1autochess_escaped_multi'];
  for (const id of ids) {
    test(`${id}: row glyphs and legend tileKeys resolve to 2D + 3D art; the 3D unite area builds terrain`, () => {
      const s = stages[id];
      const chars = new Set();
      for (const row of s.rows) for (const ch of row) chars.add(ch);
      for (const ch of chars) {
        assert.ok(GLYPH[ch], `${id}: row glyph ${JSON.stringify(ch)} is in GLYPH`);
        assert.ok(MATERIALS.includes(GLYPH[ch].mat), `${id}: ${ch} → 2D material ${GLYPH[ch].mat}`);
      }
      for (const [ch, def] of Object.entries(s.tiles)) {
        const mapped = GLYPH[ch] ? ch : TILEKEY_GLYPH[def.tileKey];
        assert.ok(mapped && GLYPH[mapped], `${id}: legend ${JSON.stringify(ch)} (${def.tileKey}) maps to a glyph`);
        assert.ok(MATERIALS.includes(GLYPH[mapped].mat), `${id}: legend ${JSON.stringify(ch)} → 2D material`);
      }
      const G = classifyStage(s, AREAS.unite);
      let drawn = 0;
      for (const row of G) for (const t of row) if (t.drawn) { drawn++; assert.ok(SURFACES[t.surf], `${id}: ${t.r},${t.c} → 3D surface ${t.surf}`); }
      assert.ok(drawn > 0, `${id}: the 3D unite area classifies drawn tiles`);
      const b = buildBoard(s, { area: AREAS.unite });
      assert.ok(b.buckets.board.vertexCount > 0, `${id}: the 3D board builds terrain vertices`);
      assert.ok(b.gates.length > 0, `${id}: gates are built`);
    });
  }
});
