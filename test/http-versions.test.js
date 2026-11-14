// test/http-versions.test.js — serving an enabled official version (server/versions.js, server/http/static.js): its data
// under /data/versions/<slug>/, its /cs/<cs16>/index.json and bounds; a server that enables nothing keeps serving the
// default content only (/healthz has no `versions`, the version's data is a 404).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.js';
import { createVersionSets } from '../server/versions.js';
import { DATA_SHIM_JS } from '../server/http/static.js';
import { DEFAULT_VERSION } from '../shared/versions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quiet = { info() {}, warn() {}, error() {}, debug() {} };

/** The cs of the 规程 version, as the server computes it (a fresh scan of the same files). */
function act3Cs() {
  const sets = createVersionSets({ enabled: [DEFAULT_VERSION, 'act3autochess@V3_1'], default: DEFAULT_VERSION, maxHosts: 1,
    simDir: path.join(ROOT, 'server', 'sim'), sharedDir: path.join(ROOT, 'shared'), shim: DATA_SHIM_JS, log: quiet });
  return sets.byId('act3autochess@V3_1').cs;
}

test('an enabled version serves its data, its manifest and its bounds; the default-only server serves none', async (t) => {
  const cs = act3Cs();
  const withVersion = await startServer({ port: 0, host: '127.0.0.1', quiet: true, assetIndex: false, studio: false,
    versions: { enabled: ['act3autochess@V3_1'] } });
  const plain = await startServer({ port: 0, host: '127.0.0.1', quiet: true, assetIndex: false, studio: false });
  t.after(async () => { await withVersion.close(); await plain.close(); });

  // /healthz names the enabled versions only on the server that has one
  const health = await (await fetch(`${withVersion.url}/healthz`)).json();
  assert.deepEqual(health.versions.enabled, [DEFAULT_VERSION, 'act3autochess@V3_1']);
  assert.equal(health.versions.default, DEFAULT_VERSION);
  const plainHealth = await (await fetch(`${plain.url}/healthz`)).json();
  assert.equal(plainHealth.versions, undefined, 'nothing enabled: the default content alone');

  // the version's data: its own directory, JSON, and only while enabled
  const data = await fetch(`${withVersion.url}/data/versions/act3autochess-v3_1/config.json`);
  assert.equal(data.status, 200);
  const config = await data.json();
  assert.equal(config.season, 'act3autochess');
  assert.equal(config.version.id, 'act3autochess@V3_1');
  assert.equal((await fetch(`${plain.url}/data/versions/act3autochess-v3_1/config.json`)).status, 404, 'disabled: 404');
  assert.equal((await fetch(`${withVersion.url}/data/versions/act3autochess-v3_1/nope.json`)).status, 404);

  // /cs/<cs16>/index.json: the version manifest with its own data URLs and bounds URL
  const index = await (await fetch(`${withVersion.url}/cs/${cs.slice(0, 16)}/index.json`)).json();
  assert.equal(index.version, 'act3autochess@V3_1');
  assert.match(index.data.config.url, /^\/data\/versions\/act3autochess-v3_1\/config\.json\?v=[0-9a-f]{8}$/);
  assert.equal(index.bounds.official.url, `/cs/${cs.slice(0, 16)}/bounds/official.json`);
  assert.equal((await fetch(`${withVersion.url}/cs/${'0'.repeat(16)}/index.json`)).status, 404, 'an unknown cs is not a version');

  // the version's own official bounds, from its own tables
  const bounds = await (await fetch(`${withVersion.url}/cs/${cs.slice(0, 16)}/bounds/official.json`)).json();
  assert.equal(bounds.v, 1);
  assert.ok(Object.keys(bounds.bb).length > 0);
});
