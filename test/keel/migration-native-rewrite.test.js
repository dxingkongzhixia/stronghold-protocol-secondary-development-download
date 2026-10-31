// N4 (reference rebuild): a real content + asset plugin, rewritten as a native manifest 3 with no `legacy` / `compat`
// fields and no manifest-2 `plugin.json`, must load, merge and play exactly like the imported Keel descriptor.
//
// The rewrite is derived from the owner's local plugins (`plugins/*` is git-ignored), so a missing plugin is skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHASE } from '../../shared/constants.js';
import { getData } from '../../server/data.js';
import { loadKeelPlugin } from '../../server/keel/room-source.js';
import { readPluginFolder } from '../../server/plugins/registry.js';
import { mergeKeelData } from '../../server/keel/content.js';
import { makeMatch } from '../match/harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IDS = ['prts-kaltsit', 'prts-source-code', 'black-snake'];

/** The owner's plugin folder copied into a temp dir, with a native manifest 3 instead of the imported descriptor. */
function nativeRewrite(t, dir, id) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-native-rewrite-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const out = path.join(tmp, id);
  fs.cpSync(dir, out, { recursive: true });
  const imported = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.keel.json'), 'utf8'));
  const manifest = structuredClone(imported);
  delete manifest.legacy;
  delete manifest.compat;
  // the native rewrite is the only descriptor: no plugin.keel.json, no manifest-2 fallback
  fs.rmSync(path.join(out, 'plugin.keel.json'));
  fs.writeFileSync(path.join(out, 'plugin.json'), JSON.stringify(manifest, null, 2));
  return out;
}

/** One solo run: 10 rounds (or until the match ends), the public frames and the final result. */
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

const recordsOf = (plugin) => [...plugin.content.records]
  .map((r) => ({ table: r.table, id: r.id, value: r.value }))
  .sort((a, b) => `${a.table}:${a.id}`.localeCompare(`${b.table}:${b.id}`));

for (const id of IDS) {
  test(`${id} rewritten as a native manifest 3 loads, merges and plays like the imported descriptor`, async (t) => {
    const dir = path.join(ROOT, 'plugins', id);
    if (!fs.existsSync(path.join(dir, 'plugin.keel.json'))) {
      t.skip(`${id} is not checked out (plugins/* is git-ignored)`);
      return;
    }
    const old = process.env.KEEL;
    process.env.KEEL = '1';
    t.after(() => { if (old === undefined) delete process.env.KEEL; else process.env.KEEL = old; });

    const assets = getData().assets;
    const vanilla = { manifest: assets, baseManifest: assets, sha256: 'native-rewrite' };
    const imported = await loadKeelPlugin(dir);
    assert.deepEqual(imported.problems, []);
    const importedRead = await readPluginFolder(dir, { vanilla });

    const nativeDir = nativeRewrite(t, dir, id);
    const read = await readPluginFolder(nativeDir, { vanilla });
    assert.deepEqual(read.problems, [], 'the native manifest passes the strict read');
    assert.deepEqual(read.warnings, []);
    const plugin = await loadKeelPlugin(nativeDir);
    assert.deepEqual(plugin.problems, [], 'the native manifest loads without the compat layer');
    assert.equal(plugin.manifest.manifest, 3);
    assert.equal(plugin.manifest.legacy, undefined, 'no legacy block');
    assert.equal(plugin.manifest.compat, undefined, 'no compat flags');
    assert.equal(fs.existsSync(path.join(nativeDir, 'plugin.keel.json')), false, 'one descriptor only');

    assert.deepEqual(recordsOf(plugin), recordsOf(imported), 'the same content records');
    assert.deepEqual(plugin.assets, imported.assets, 'the same art composition');
    assert.deepEqual(read.plugin.visual.ops, importedRead.plugin.visual.ops, 'the same visual ops');
    assert.ok(mergeKeelData(getData(), plugin.content), 'the content merges into the game data');

    const importedRun = play(makeMatch({ data: getData(), keel: { plugins: [imported] }, humans: 1, seed: 4243 }));
    const nativeRun = play(makeMatch({ data: getData(), keel: { plugins: [plugin] }, humans: 1, seed: 4243 }));
    assert.equal(nativeRun.round, importedRun.round, 'round count');
    assert.equal(nativeRun.ended, importedRun.ended, 'end state');
    assert.deepEqual(nativeRun.publicFrames, importedRun.publicFrames, 'm.public frames');
    assert.deepEqual(nativeRun.result, importedRun.result, 'm.result');
  });
}
