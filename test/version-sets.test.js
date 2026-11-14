// test/version-sets.test.js — the official versions a server offers (server/http/config.js versionsFrom and
// server/versions.js createVersionSets): nothing set enables the default alone; an enabled 规程 version gets its content
// hash, its own data directory and index, and its bounds snapshot from its own tables. The static routes that serve
// them are test/http-versions.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { versionsFrom } from '../server/http/config.js';
import { createVersionSets, versionIndexOf } from '../server/versions.js';
import { DATA_SHIM_JS } from '../server/http/static.js';
import { getData, resetData } from '../server/data.js';
import { DEFAULT_VERSION } from '../shared/versions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = {
  simDir: path.join(ROOT, 'server', 'sim'),
  sharedDir: path.join(ROOT, 'shared'),
  dataDir: path.join(ROOT, 'data'),
};
const quiet = { info() {}, warn() {}, error() {}, debug() {} };

test('versionsFrom: nothing set is the default version alone, with no version host', () => {
  const v = versionsFrom({}, {});
  assert.deepEqual(v.enabled, [DEFAULT_VERSION]);
  assert.equal(v.default, DEFAULT_VERSION);
  assert.equal(v.maxHosts, 0);
  assert.deepEqual(v.unknown, []);
});

test('versionsFrom: SP_VERSIONS all / a list, an unknown id dropped, the default option and max hosts', () => {
  const all = versionsFrom({}, { SP_VERSIONS: 'all' });
  assert.deepEqual(all.enabled, [DEFAULT_VERSION, 'act3autochess@V3_1']);
  assert.equal(all.maxHosts, 1, 'one non-default version');
  const one = versionsFrom({ versions: { enabled: 'act3autochess@V3_1' } }, {});
  assert.deepEqual(one.enabled, [DEFAULT_VERSION, 'act3autochess@V3_1']);
  const bad = versionsFrom({ versions: { enabled: 'nope,act3autochess@V3_1' } }, {});
  assert.deepEqual(bad.unknown, ['nope']);
  assert.deepEqual(bad.enabled, [DEFAULT_VERSION, 'act3autochess@V3_1']);
  assert.equal(versionsFrom({ versions: { enabled: 'act3autochess@V3_1', default: 'act3autochess@V3_1' } }, {}).default, 'act3autochess@V3_1');
  assert.equal(versionsFrom({ versions: { enabled: 'act3autochess@V3_1', default: 'nope' } }, {}).default, DEFAULT_VERSION, 'an unknown default falls back');
  assert.equal(versionsFrom({ versions: { enabled: 'act3autochess@V3_1', maxHosts: 3 } }, {}).maxHosts, 3);
  assert.equal(versionsFrom({}, { SP_VERSIONS: 'act3autochess@V3_1', SP_MAX_VERSION_HOSTS: '2' }).maxHosts, 2);
});

test('createVersionSets: the 规程 version gets a cs, its data directory, its index and its own bounds', () => {
  const sets = createVersionSets({ ...dirs, enabled: [DEFAULT_VERSION, 'act3autochess@V3_1'], default: DEFAULT_VERSION,
    maxHosts: 1, shim: DATA_SHIM_JS, log: quiet });
  assert.equal(sets.list.length, 1);
  const set = sets.byId('act3autochess@V3_1');
  assert.ok(set, 'enabled');
  assert.equal(set.slug, 'act3autochess-v3_1');
  assert.match(set.cs, /^[0-9a-f]{16,64}$/);
  assert.equal(sets.byCs(set.cs), set);
  assert.equal(sets.byId(DEFAULT_VERSION), null, 'the default version is not a set');
  assert.equal(sets.available(DEFAULT_VERSION), true, 'but it is playable');
  assert.equal(sets.available('act3autochess@V3_1'), true);
  // the index: the vanilla shape with the version's own data URLs, its id and its bounds URL
  assert.equal(set.index.version, 'act3autochess@V3_1');
  assert.equal(set.index.vanilla, true);
  assert.match(set.index.bounds.official.url, new RegExp(`^/cs/${set.cs.slice(0, 16)}/bounds/official\\.json$`));
  const config = set.index.data.config;
  assert.match(config.url, /^\/data\/versions\/act3autochess-v3_1\/config\.json\?v=[0-9a-f]{8}$/);
  assert.match(config.sha256, /^[0-9a-f]{64}$/);
  // the data loads from its own directory (not the default data/)
  resetData();
  assert.equal(sets.stats().loaded, 0, 'stats never triggers the lazy load');
  const data = set.data;
  assert.equal(sets.stats().loaded, 1);
  assert.equal(data.config.season, 'act3autochess');
  assert.equal(data.config.version?.id, 'act3autochess@V3_1');
  assert.notEqual(data, getData({ log: quiet }));
  // and its bounds come from its own tables, without touching the default content's cache
  const bounds = set.bounds();
  assert.equal(bounds.v, 1);
  assert.ok(Object.keys(bounds.bb).length > 0);
  resetData();
});

test('the version index keeps the vanilla formula and replaces only the data URLs, id and bounds', () => {
  const content = { cs: 'a'.repeat(64), app: 'x', vanilla: true, sim: 's', simFiles: { 'a.js': 'h' },
    data: { config: { file: 'config.json', sha256: 'b'.repeat(64), bytes: 10 } } };
  const entry = { id: 'act3autochess@V3_1', dir: 'versions/act3autochess-v3_1/', season: 'act3autochess', family: 'regulation', label: 'x', roomModes: [] };
  const index = versionIndexOf(entry, content);
  assert.deepEqual(index.data.config, { url: `/data/versions/act3autochess-v3_1/config.json?v=${'b'.repeat(8)}`, sha256: 'b'.repeat(64), bytes: 10 });
  assert.equal(index.version, 'act3autochess@V3_1');
  assert.equal(index.cs, content.cs);
});
