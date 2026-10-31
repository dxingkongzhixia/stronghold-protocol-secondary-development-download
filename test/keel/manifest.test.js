// test/keel/manifest.test.js — manifest 3 (shared/keel/manifest.js, docs/keel/MANIFEST-V3.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEEL_PERMISSIONS, KEEL_STABLE_POINTS, readKeelManifest } from '../../shared/keel/index.js';

const base = () => ({
  manifest: 3,
  id: 'demo',
  name: { zh: '示例', en: 'Demo' },
  version: '1.0.0',
  app: '>=0.4.0 <0.5.0',
  api: { content: 1 },
  scope: ['room'],
  trust: 'data',
  modules: [{ kind: 'content', files: ['content/a.json'], permissions: ['content.define'] }],
});

const read = (m) => readKeelManifest(m, { id: 'demo' });
const has = (r, code) => r.issues.some((i) => i.code === code);

test('a valid manifest 3 reads, with modules and capabilities', () => {
  const r = read(base());
  assert.equal(r.problems.length, 0, r.problems.join('\n'));
  assert.equal(r.manifest.id, 'demo');
  assert.equal(r.manifest.trust, 'data');
  assert.deepEqual(r.manifest.modules[0].permissions, ['content.define']);
});

test('the version, required fields and unknown fields', () => {
  assert.equal(read({ ...base(), manifest: 2 }).manifest, null);
  assert.ok(has(read({ ...base(), manifest: 2 }), 'KEEL_MANIFEST_VERSION'));
  for (const key of ['name', 'version', 'app', 'api', 'trust', 'modules']) {
    const m = base();
    delete m[key];
    const r = read(m);
    assert.equal(r.manifest, null, key);
  }
  const unknown = read({ ...base(), somethingNew: true });
  assert.equal(unknown.problems.length, 0);
  assert.ok(unknown.warnings.some((w) => w.includes('somethingNew')));
});

test('api domains and levels', () => {
  assert.equal(read({ ...base(), api: {} }).manifest, null);
  assert.equal(read({ ...base(), api: { nope: 1 } }).manifest, null);
  assert.equal(read({ ...base(), api: { content: 0 } }).manifest, null);
  assert.equal(read({ ...base(), api: { content: 1.5 } }).manifest, null);
  assert.equal(read({ ...base(), api: { content: 1, sim: 1 } }).manifest.api.sim, 1);
});

test('trust and permissions', () => {
  assert.equal(read({ ...base(), trust: 'root' }).manifest, null);
  assert.equal(read({ ...base(), modules: [{ kind: 'content', files: ['a.json'], permissions: ['sim.read'] }] }).manifest, null);
  assert.equal(read({ ...base(), modules: [{ kind: 'content', files: ['a.json'], permissions: ['nope'] }] }).manifest, null);
  assert.deepEqual(KEEL_PERMISSIONS['content.define'], ['content']);
});

test('modules: entry/files, duplicate, paths and slots', () => {
  assert.equal(read({ ...base(), modules: [{ kind: 'content', permissions: [] }] }).manifest, null);
  assert.equal(read({ ...base(), modules: [{ kind: 'nope', files: ['a.json'], permissions: [] }] }).manifest, null);
  assert.equal(read({ ...base(), modules: [{ kind: 'content', files: ['../a.json'], permissions: [] }] }).manifest, null);
  assert.equal(read({ ...base(), modules: [
    { kind: 'content', files: ['a.json'], permissions: [] },
    { kind: 'content', files: ['a.json'], permissions: [] },
  ] }).manifest, null);
  assert.equal(read({ ...base(), modules: [{ kind: 'ui', entry: 'ui.html', permissions: ['ui.frame'], slots: ['nope'] }] }).manifest, null);
});

test('state, compat and integrity are optional but typed', () => {
  assert.equal(read({ ...base(), state: { schema: 'state.json', version: 1 } }).problems.length, 0);
  assert.equal(read({ ...base(), state: { schema: '../state.json' } }).manifest, null);
  assert.equal(read({ ...base(), compat: { mainline: '0.3.x', manifest2: true } }).problems.length, 0);
  assert.equal(read({ ...base(), compat: { manifest2: 'yes' } }).manifest, null);
  assert.equal(read({ ...base(), integrity: { algo: 'md5' } }).manifest, null);
});

test('the 24 stable points are unique and complete', () => {
  assert.equal(KEEL_STABLE_POINTS.length, 24);
  assert.equal(new Set(KEEL_STABLE_POINTS.map((p) => p.id)).size, 24);
  for (const p of KEEL_STABLE_POINTS) {
    for (const key of ['id', 'domain', 'point', 'readable', 'writable', 'capability', 'budget']) assert.ok(p[key], `${p.id}.${key}`);
  }
});
