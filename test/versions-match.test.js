// test/versions-match.test.js — an official version's data runs a whole match in the engine: the act3 autochess set is
// installed as the process data (server/match/host/entry.js does the same before creating a match), then info check,
// band / SP drafts, prep and a server-run battle reach the next prep with no engine error and every invariant intact.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, setData, resetData } from '../server/data.js';
import { makeMatch } from './match/harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const quiet = { info() {}, warn() {}, error() {}, debug() {} };

after(() => resetData());

test('an act3 match runs a battle on its own data and reaches the next prep without engine errors', () => {
  const data = loadData(DIR, { log: quiet });
  setData(data);
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 1, bots: 3, seed: 7, data });
  h.start();
  h.autoHumans();
  h.toPrep(1);
  for (const ps of h.m.players.values()) if (!ps.isBot && h.m.phase === 'PREP' && !ps.ready) h.m.handle(ps.playerId, { t: 'g.ready', ready: true });
  assert.ok(h.run(() => h.ended != null || h.m.phase === 'SETTLE'), `reached settle (${h.m.phase} R${h.m.round})`);
  assert.ok(h.run(() => h.ended != null || (h.m.phase === 'PREP' && h.m.round >= 2)), `reached PREP R2 (${h.m.phase} R${h.m.round}${h.ended ? ', ended' : ''})`);
  assert.deepEqual(h.logs.error, []);
  assert.equal(h.badFrames.length, 0);
  h.invariants();
});
