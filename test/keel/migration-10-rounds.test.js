// test/keel/migration-10-rounds.test.js — old content set vs Keel: the same 10 rounds, public frames and result.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHASE } from '../../shared/constants.js';
import { getData } from '../../server/data.js';
import { loadKeelPlugin } from '../../server/keel/room-source.js';
import { readPluginFolder } from '../../server/plugins/registry.js';
import { createContentSets } from '../../server/plugins/contentSets.js';
import { makeMatch } from '../match/harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ID = 'prts-kaltsit';
const DIR = path.join(ROOT, 'plugins', ID);

async function oldData(data) {
  const vanilla = { manifest: data.assets, baseManifest: data.assets, sha256: 'golden' };
  const read = await readPluginFolder(DIR, { vanilla });
  assert.deepEqual(read.problems, []);
  const registry = { plugin: (key) => (key === ID ? read.plugin : null), onScan: () => null };
  const contents = createContentSets({ registry, vanillaData: data, log: { info() {}, warn() {}, error() {} }, maxSets: () => 4 });
  const resolved = contents.resolve([ID], { scope: 'room' });
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  return contents.dataOf(resolved.set.cs);
}

function play(h) {
  h.onBroadcast.push(() => { const ps = h.ps('p_0'); if (ps) ps.lp = 9999; });
  h.start();
  const m = h.m;
  for (let round = 1; round <= 10; round++) {
    const prep = h.drive(() => m.phase === PHASE.PREP && m.round === round, { ready: false });
    assert.ok(prep, `reached PREP ${round} (phase ${m.phase} R${m.round})`);
    const ready = m.handle('p_0', { t: 'g.ready', ready: true });
    assert.ok(ready.ok, `ready R${round}: ${JSON.stringify(ready)}`);
    h.run(() => m.ended === true || (m.phase === PHASE.PREP && m.round > round));
    if (m.ended) break;
  }
  const publicFrames = h.bc.filter((msg) => msg?.t === 'm.public');
  const result = h.lastBc('m.result');
  if (result) { delete result.cs; delete result.vs; }
  return { publicFrames, result, round: m.round, ended: m.ended };
}

test('the old content set and Keel play the same 10 rounds', async (t) => {
  if (!fs.existsSync(path.join(DIR, 'plugin.keel.json'))) { t.skip(`${ID} is not checked out (plugins/* is git-ignored)`); return; }
  const old = process.env.KEEL;
  process.env.KEEL = '1';
  try {
    const base = getData();
    const oldRun = play(makeMatch({ data: await oldData(base), humans: 1, seed: 4242 }));
    const plugin = await loadKeelPlugin(DIR);
    const keelRun = play(makeMatch({ data: base, keel: { plugins: [plugin] }, humans: 1, seed: 4242 }));
    assert.equal(keelRun.round, oldRun.round, 'round count');
    assert.equal(keelRun.ended, oldRun.ended, 'end state');
    assert.deepEqual(keelRun.publicFrames, oldRun.publicFrames, 'm.public frames');
    assert.deepEqual(keelRun.result, oldRun.result, 'm.result');
  } finally {
    if (old === undefined) delete process.env.KEEL; else process.env.KEEL = old;
  }
});
