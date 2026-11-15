// test/versions-band-egir.test.js — 规程's 阿戈尔 second direction in a real version match: with the band and 6
// distinct Egir operators on the board, battleInput() carries the bench-summon mark (the sim side is
// test/content/bands_replace.test.js). Process data is the version's, as server/match/host/entry.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, setData, resetData } from '../server/data.js';
import { makeMatch, give } from './match/harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
after(() => resetData());

test('battleInput attaches 阿戈尔\'s bench mark with 6 distinct members and the band', () => {
  const data = loadData(DIR, { log: quiet });
  setData(data);
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 1, bots: 3, seed: 7, data });
  h.start();
  h.autoHumans();
  h.toPrep(1);
  const ps = h.ps('p_0');
  ps.bandId = 'band_egir';
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean), ...ps.temp.filter(Boolean)]) if (p && p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear();
  ps.hand.fill(null);
  ps.temp.fill(null);
  const egir = Object.values(data.chess).filter((c) => c.visible && !c.isGolden && (c.bonds || []).includes('egirShip')).map((c) => c.chessId);
  assert.ok(egir.length >= 7, 'the version has enough distinct Egir operators');
  const spots = [[10, 4], [10, 5], [10, 6], [11, 4], [11, 5], [11, 6]];
  for (let i = 0; i < 6; i++) give(h.m, ps, egir[i], 'board', spots[i]);
  give(h.m, ps, egir[6], 'hand', 0);
  ps.recompute();
  const mark = (ps.battleInput().bandMarks || []).find((x) => x.tag === 'egir_bench');
  assert.ok(mark, 'the mark is attached');
  assert.equal(mark.count, 3);
  assert.equal(mark.summon.chessId, egir[6]);

  // five distinct members: no second direction
  for (const [key, piece] of ps.board) {
    if (piece && piece.id === egir[5]) { ps.returnCopies(piece); ps.board.delete(key); }
  }
  ps.recompute();
  assert.equal((ps.battleInput().bandMarks || []).some((x) => x.tag === 'egir_bench'), false);
});
