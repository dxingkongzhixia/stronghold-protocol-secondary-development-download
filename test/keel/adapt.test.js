// test/keel/adapt.test.js — manifest 2 → Keel modules (shared/keel/adapt.js, docs/keel/COMPAT-V2.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_VERSION, PLUGIN_API } from '../../shared/constants.js';
import { readPluginManifest } from '../../shared/plugins/manifest.js';
import { adaptV2, mapPermissions, trustOfClass } from '../../shared/keel/index.js';

const v2 = (over) => ({
  manifest: 2,
  version: '1.0.0',
  app: '*',
  api: 1,
  scope: ['room'],
  ...over,
});

function adapt(raw, id = 'demo') {
  const r = readPluginManifest(raw, { id, app: APP_VERSION, api: PLUGIN_API });
  assert.equal(r.problems.length, 0, r.problems.join('\n'));
  return adaptV2(r.manifest);
}

test('classes map to trust levels and modules', () => {
  assert.equal(trustOfClass('lang'), 'data');
  assert.equal(trustOfClass('cosmetic'), 'data');
  assert.equal(trustOfClass('content'), 'data');
  assert.equal(trustOfClass('ui'), 'sandbox');
  assert.equal(trustOfClass('script'), 'sandbox');
  assert.equal(trustOfClass('trusted'), 'native');
});

test('lang keeps its file as the lang entry', () => {
  const a = adapt(v2({ class: 'lang', name: '日本語', lang: 'ja', scope: ['personal'], files: { ui: 'ui.json' } }));
  assert.equal(a.manifest.trust, 'data');
  assert.deepEqual(a.manifest.modules.map((m) => m.kind), ['lang']);
  assert.equal(a.manifest.modules[0].entry, 'ui.json');
  assert.equal(a.manifest.api.lang, 1);
});

test('cosmetic becomes an asset module with its files and permission', () => {
  const a = adapt(v2({ class: 'cosmetic', permissions: ['assets.add'], assets: { images: { icon: 'media/a.png' } } }));
  assert.deepEqual(a.manifest.modules.map((m) => m.kind), ['asset']);
  assert.deepEqual(a.manifest.modules[0].files, ['media/a.png']);
  assert.deepEqual(a.manifest.modules[0].permissions, ['asset.add']);
  assert.equal(a.manifest.trust, 'data');
});

test('content splits records from assets and maps data permissions', () => {
  const a = adapt(v2({
    class: 'content',
    permissions: ['data.patch', 'data.add', 'dsl', 'assets.add'],
    data: ['data/a.json'],
    operators: ['op.json'],
    dsl: ['dsl/s.json'],
    assets: { images: { icon: 'media/a.png' } },
  }));
  const kinds = a.manifest.modules.map((m) => m.kind);
  assert.deepEqual(kinds, ['content', 'asset']);
  assert.deepEqual(a.manifest.modules[0].files, ['data/a.json', 'op.json', 'dsl/s.json']);
  assert.deepEqual(a.manifest.modules[0].permissions, ['content.patch', 'content.define', 'content.dsl']);
  assert.deepEqual(a.manifest.modules[1].permissions, ['asset.add']);
});

test('script becomes sim + match + content, with sandbox trust', () => {
  const a = adapt(v2({
    class: 'script',
    permissions: ['sim.code', 'meta.code', 'data.add'],
    entry: { sim: 'sim/index.js', meta: 'meta/index.js' },
    operators: ['op.json'],
  }));
  assert.equal(a.manifest.trust, 'sandbox');
  assert.equal(a.manifest.compat.v2Script, true);
  const byKind = Object.fromEntries(a.manifest.modules.map((m) => [m.kind, m]));
  assert.equal(byKind.sim.entry, 'sim/index.js');
  assert.equal(byKind.match.entry, 'meta/index.js');
  assert.ok(byKind.content);
  assert.deepEqual(byKind.sim.permissions, ['sim.code']);
  assert.deepEqual(byKind.match.permissions, ['match.code']);
});

test('trusted keeps native trust and the v2 gates', () => {
  const a = adapt(v2({
    class: 'trusted',
    permissions: ['trusted.page', 'trusted.server'],
    entry: { client: 'client.js', server: 'server.js' },
  }));
  assert.equal(a.manifest.trust, 'native');
  const byKind = Object.fromEntries(a.manifest.modules.map((m) => [m.kind, m]));
  assert.equal(byKind.ui.entry, 'client.js');
  assert.equal(byKind.match.entry, 'server.js');
  assert.ok(byKind.ui.permissions.includes('ui.native'));
  assert.ok(byKind.match.permissions.includes('native.execute'));
  assert.ok(a.warnings.some((w) => w.includes('pin + consent')));
});

test('ui keeps its slot request', () => {
  const a = adapt(v2({
    class: 'ui',
    scope: ['personal'],
    permissions: ['ui.frame'],
    entry: { client: 'ui/index.html' },
    slots: ['hud.right'],
  }));
  assert.equal(a.manifest.trust, 'sandbox');
  assert.deepEqual(a.manifest.modules[0].slots, ['hud.right']);
  assert.deepEqual(a.manifest.modules[0].permissions, ['ui.frame']);
});

test('permissions map per kind, and unknown ones are reported not thrown', () => {
  const m = mapPermissions(['data.add', 'sim.code', 'trusted.server', 'nope']);
  assert.deepEqual(m.byKind.content, ['content.define']);
  assert.deepEqual(m.byKind.sim, ['sim.code']);
  assert.deepEqual(m.byKind.match, ['native.execute']);
  assert.deepEqual(m.unknown, ['nope']);
});

test('compat records the mainline range', () => {
  const a = adapt(v2({ class: 'content', app: '>=0.3.0 <0.4.0', permissions: ['data.add'], data: ['a.json'] }));
  assert.equal(a.manifest.compat.manifest2, true);
  assert.equal(a.manifest.compat.mainline, '0.3.x');
});
