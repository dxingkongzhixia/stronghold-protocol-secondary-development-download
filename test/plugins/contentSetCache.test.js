// test/plugins/contentSetCache.test.js — server/plugins/contentSetCache.js: a built set kept on disk (the combination's
// memo key + the vanilla identity is the key), verified on the way back in, bounded by count and bytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createContentSetCache } from '../../server/plugins/contentSetCache.js';
import { contentHashOf } from '../../shared/plugins/identity.js';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const APP = '0.3.0-dev';
const SIM = 'f'.repeat(64);
const IDENTITY = { app: APP, sim: SIM, data: { bonds: { sha256: 'a'.repeat(64) } } };

/** A built set of plugin `id` whose patched bonds body says `tag`. */
function built(id, tag) {
  const body = Buffer.from(JSON.stringify({ tag }));
  const plugins = [{ id, version: '1.0.0', files: { 'p.json': sha(Buffer.from(id)) } }];
  const cs = contentHashOf({ app: APP, sim: SIM, data: { bonds: sha(body) }, plugins, settings: {} });
  const index = { app: APP, sim: SIM, cs, vanilla: false, plugins, settings: {},
    data: { bonds: { url: `/cs/${cs.slice(0, 16)}/data/bonds.json`, sha256: sha(body), bytes: body.length } }, i18n: {} };
  const files = new Map([
    ['data/bonds.json', { body, sha256: sha(body), bytes: body.length }],
    ['index.json', { body: Buffer.from(JSON.stringify(index)), sha256: sha(Buffer.from(JSON.stringify(index))), bytes: 1 }],
  ]);
  return { cs, index, files, extra: { plugins: [{ id }], modes: [], args: { ids: [id], settings: {} } } };
}

const dirs = [];
function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-cache-'));
  dirs.push(d);
  return d;
}
process.on('exit', () => { for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

test('a stored set comes back identical, manifest and bodies checked', () => {
  const dir = tmpDir(), cache = createContentSetCache({ dir });
  const set = built('demo', 'one');
  cache.store('memo-key', IDENTITY, set);
  const hit = cache.load('memo-key', IDENTITY);
  assert.ok(hit, 'the set is stored');
  assert.equal(hit.cs, set.cs);
  assert.deepEqual(hit.index, set.index);
  assert.deepEqual(hit.extra.plugins, [{ id: 'demo' }]);
  assert.equal(hit.bodies.get('data/bonds.json').toString(), JSON.stringify({ tag: 'one' }));
  assert.ok(hit.bodies.has('index.json'), 'the manifest is served from the set itself');
});

test('a tampered body is refused whole (the caller builds instead)', () => {
  const dir = tmpDir(), cache = createContentSetCache({ dir });
  const set = built('demo', 'one');
  cache.store('memo-key', IDENTITY, set);
  fs.writeFileSync(path.join(dir, cache.keyOf('memo-key', IDENTITY), 'bodies', 'data', 'bonds.json'), '{"tag":"two"}');
  assert.equal(cache.load('memo-key', IDENTITY), null);
});

test('another vanilla identity (a new data set or code hash) is another key', () => {
  const dir = tmpDir(), cache = createContentSetCache({ dir });
  cache.store('memo-key', IDENTITY, built('demo', 'one'));
  assert.ok(cache.load('memo-key', IDENTITY));
  assert.equal(cache.load('memo-key', { ...IDENTITY, sim: 'e'.repeat(64) }), null);
  assert.equal(cache.load('other-key', IDENTITY), null);
  assert.equal(cache.load(null, IDENTITY), null);
});

test('recent lists the stored combinations newest first, for a boot pre-warm', () => {
  const dir = tmpDir(), cache = createContentSetCache({ dir });
  for (const [i, id] of ['a', 'b', 'c'].entries()) {
    const set = built(id, id);
    set.extra.args = { ids: [id], settings: {} };
    cache.store(`key-${id}`, IDENTITY, set);
    // distinct savedAt, newest last written
    const meta = path.join(dir, cache.keyOf(`key-${id}`, IDENTITY), 'meta.json');
    const doc = JSON.parse(fs.readFileSync(meta, 'utf8'));
    fs.writeFileSync(meta, JSON.stringify({ ...doc, savedAt: 1000 + i }));
  }
  assert.deepEqual(cache.recent(2).map((a) => a.ids[0]), ['c', 'b']);
});

test('the cache is bounded by entry count', () => {
  const dir = tmpDir(), cache = createContentSetCache({ dir, maxEntries: 2 });
  for (const id of ['a', 'b', 'c', 'd']) {
    const set = built(id, id);
    cache.store(`key-${id}`, IDENTITY, set);
    const meta = path.join(dir, cache.keyOf(`key-${id}`, IDENTITY), 'meta.json');
    const doc = JSON.parse(fs.readFileSync(meta, 'utf8'));
    fs.writeFileSync(meta, JSON.stringify({ ...doc, savedAt: Date.now() + ['a', 'b', 'c', 'd'].indexOf(id) }));
  }
  cache.prune();
  const kept = fs.readdirSync(dir).filter((n) => !n.startsWith('.'));
  assert.ok(kept.length <= 2, `kept ${kept.length} entries`);
  assert.ok(cache.load('key-d', IDENTITY), 'the newest entry survives');
});
