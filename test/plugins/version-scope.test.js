// Official-version isolation for plugins: a plugin without `versions` is 盟约-only; a regulation room only sees plugins
// that name act3autochess (id, season or family), while lang/ui stay neutral. The server refuses a refused plugin even
// when a stale browser selection sends it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPluginManifest, pluginSupportsVersion } from '../../shared/plugins/manifest.js';
import { createRoomSets } from '../../server/plugins/roomSets.js';
import { roomPlugins, everyRoomPlugin } from '../../public/js/ui/pluginPanel.js';

const ACT3 = 'act3autochess@V3_1';
const COV = 'act2autochess';

function plugin(id, { cls = 'cosmetic', versions, visual = true, content = null } = {}) {
  const raw = { manifest: 2, id, version: '1.0.0', app: '*', api: 1, class: cls, scope: ['room'], permissions: [], ...(versions ? { versions } : {}) };
  if (cls === 'cosmetic') raw.permissions = ['assets.override'];
  if (cls === 'content') raw.permissions = ['data.patch'];
  const read = readPluginManifest(raw, { id });
  assert.deepEqual(read.problems, [], `${id}: ${read.problems.join('; ')}`);
  return { id, class: cls, status: 'loaded', manifest: read.manifest, ...(visual ? { visual: {} } : {}), ...(content ? { content } : {}) };
}

const visual = { resolve: (ids) => ({ ok: true, set: { vs: 'a'.repeat(16), plugins: ids.map((id) => ({ id, version: '1.0.0', hash: 'b'.repeat(16) })), warnings: [], bytes: 0 } }) };
const contents = { resolve: (ids) => ({ ok: true, set: { cs: 'c'.repeat(64), plugins: ids.map((id) => ({ id, version: '1.0.0', hash: 'd'.repeat(16) })), modes: [], kitted: [], dataBytes: 0 } }) };

function sets(plugins) {
  const byId = new Map(plugins.map((p) => [p.id, p]));
  return createRoomSets({ registry: { plugin: (id) => byId.get(id), plugins: () => plugins }, visual, contents, policy: null });
}

test('a plugin without versions is 盟约-only for room classes; lang and ui are neutral', () => {
  const old = plugin('old-skin');
  assert.equal(pluginSupportsVersion(old.manifest, COV), true);
  assert.equal(pluginSupportsVersion(old.manifest, ACT3), false);
  assert.equal(pluginSupportsVersion({ class: 'lang', versions: [] }, ACT3), true);
  assert.equal(pluginSupportsVersion({ class: 'ui', versions: [] }, ACT3), true);
});

test('the room set refuses a covenant plugin in a regulation room and accepts one made for it', () => {
  const old = plugin('old-skin');
  const act3 = plugin('act3-skin', { versions: ['act3autochess'] });
  const cov = plugin('cov-skin', { versions: [COV] });
  const r = sets([old, act3, cov]);

  assert.equal(r.resolve(['old-skin'], { version: ACT3 }).error, 'PLUGIN_INCOMPATIBLE');
  assert.equal(r.resolve(['cov-skin'], { version: ACT3 }).error, 'PLUGIN_INCOMPATIBLE');
  assert.equal(r.resolve(['old-skin'], { version: COV }).ok, true);
  assert.equal(r.resolve(['act3-skin'], { version: ACT3 }).ok, true);
  assert.equal(r.resolve(['act3-skin'], { version: COV }).error, 'PLUGIN_INCOMPATIBLE');
});

test('a gameplay plugin of a non-default version is refused until that version has a content-set builder', () => {
  const act3 = plugin('act3-mode', { cls: 'content', content: {}, versions: ['act3autochess'] });
  const r = sets([act3]).resolve(['act3-mode'], { version: ACT3 });
  assert.equal(r.error, 'PLUGIN_INCOMPATIBLE');
  assert.match(r.detail, /content-set builder/);
});

test('the room panel only offers plugins of the room\'s version', () => {
  const rows = [
    { id: 'old', class: 'cosmetic', status: 'loaded', scope: ['room'], compatible: true },
    { id: 'act3', class: 'cosmetic', status: 'loaded', scope: ['room'], compatible: true, versions: ['act3autochess'] },
    { id: 'lang', class: 'lang', status: 'loaded', scope: ['personal'], compatible: true },
  ];
  assert.deepEqual(roomPlugins(rows, ACT3).map((p) => p.id), ['act3']);
  assert.deepEqual(roomPlugins(rows, COV).map((p) => p.id), ['old']);
  assert.deepEqual(everyRoomPlugin(roomPlugins(rows, ACT3), ACT3), ['act3']);
});
