// test/ui/asset-cache.test.js — the pure planning of the local asset cache (public/js/assetCache.js):
// which files to (re)download and which cached files are stale, judged against GET /asset-index.json.
// The browser glue (Service Worker / Cache Storage) is exercised by the e2e suites; this pins the logic.
// docs/OUR-FEATURES.md "local asset cache".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncPlan, cacheIsCurrent, effectiveAssetMode, candidatesFor, fetchArtFile } from '../../public/js/assetCache.js';

test('syncPlan: downloads the missing and the size-changed, keeps the current, removes the dropped', () => {
  const urls = ['/assets/a.png', '/assets/b.png', '/assets/c.png', '/assets/gone.png'];
  const indexFiles = { '/assets/a.png': 10, '/assets/b.png': 20, '/assets/c.png': 30 }; // gone.png no longer on the server
  const storedSizes = { '/assets/a.png': 10, '/assets/b.png': 999 };                  // b changed size; a is current; c never stored
  const cachedUrls = new Set(['/assets/a.png', '/assets/b.png', '/assets/gone.png']); // a,b cached; gone is stale
  const plan = syncPlan({ urls, indexFiles, storedSizes, cachedUrls });
  assert.deepEqual(plan.download.sort(), ['/assets/b.png', '/assets/c.png'].sort(), 'b resized, c missing');
  assert.deepEqual(plan.keep, ['/assets/a.png']);
  assert.deepEqual(plan.remove, ['/assets/gone.png'], 'a file the server dropped is removed');
});

test('syncPlan: a file listed but absent from the server index is ignored (nothing to do)', () => {
  const plan = syncPlan({ urls: ['/assets/x.png'], indexFiles: {}, storedSizes: {}, cachedUrls: new Set() });
  assert.deepEqual(plan, { download: [], remove: [], keep: [] });
});

test('cacheIsCurrent: true only when the revision matches and every file is present at its size', () => {
  const urls = ['/assets/a.png', '/assets/b.png'];
  const indexFiles = { '/assets/a.png': 10, '/assets/b.png': 20 };
  const cached = new Set(urls);
  const base = { urls, indexFiles, storedSizes: { '/assets/a.png': 10, '/assets/b.png': 20 }, cachedUrls: cached, storedRevision: 'rev1', revision: 'rev1' };
  assert.equal(cacheIsCurrent(base), true);
  assert.equal(cacheIsCurrent({ ...base, revision: 'rev2' }), false, 'a new revision is never current');
  assert.equal(cacheIsCurrent({ ...base, storedRevision: null }), false, 'never stored ⇒ not current');
  assert.equal(cacheIsCurrent({ ...base, cachedUrls: new Set(['/assets/a.png']) }), false, 'a missing file makes it stale');
  assert.equal(cacheIsCurrent({ ...base, storedSizes: { '/assets/a.png': 10, '/assets/b.png': 21 } }), false, 'a size change makes it stale');
});

test('effectiveAssetMode: an unchosen visitor loads from the web', () => {
  assert.equal(effectiveAssetMode(), 'stream', 'no stored preference ⇒ stream (the modal sets cache explicitly)');
});

test('candidatesFor: the CDN mirrors first, the game server (same-origin) last', () => {
  const s = ['https://gh-proxy.com/https://raw.githubusercontent.com/r/ref/public', 'https://cdn.jsdelivr.net/gh/r@ref/public'];
  assert.deepEqual(candidatesFor('/assets/a.png', s), [
    'https://gh-proxy.com/https://raw.githubusercontent.com/r/ref/public/assets/a.png',
    'https://cdn.jsdelivr.net/gh/r@ref/public/assets/a.png',
    '/assets/a.png',
  ]);
  assert.deepEqual(candidatesFor('/assets/a.png', []), ['/assets/a.png']);
  assert.deepEqual(candidatesFor('/assets/a.png'), ['/assets/a.png'], 'no sources ⇒ the server only');
});

test('fetchArtFile: skips a mirror whose size is wrong (lagging ref) and caches the first good source', async () => {
  const index = { files: { '/assets/a.png': 3 }, sources: ['https://m1', 'https://m2'] };
  const got = [];
  const fetchFn = async (u) => {
    got.push(u);
    if (u === 'https://m1/assets/a.png') return new Response(Buffer.alloc(2), { status: 200 }); // wrong size
    if (u === 'https://m2/assets/a.png') return new Response(Buffer.alloc(3), { status: 200 }); // matches
    return new Response(Buffer.alloc(3), { status: 200 });                                     // server
  };
  const put = [];
  const cache = { put: async (u, r) => { put.push({ u, bytes: (await r.arrayBuffer()).byteLength }); } };
  const r = await fetchArtFile('/assets/a.png', { index, fetchFn, cache });
  assert.deepEqual(r, { ok: true, from: 'mirror', bytes: 3 });
  assert.deepEqual(got, ['https://m1/assets/a.png', 'https://m2/assets/a.png'], 'the wrong-size mirror is skipped; the server is not reached');
  assert.deepEqual(put, [{ u: '/assets/a.png', bytes: 3 }], 'stored under the same-origin URL');
});

test('fetchArtFile: falls back to the game server when every mirror fails', async () => {
  const index = { files: { '/assets/b.png': 4 }, sources: ['https://m1'] };
  const got = [];
  const fetchFn = async (u) => {
    got.push(u);
    if (u.startsWith('https://')) throw new Error('CORS / timeout');
    return new Response(Buffer.alloc(4), { status: 200 });
  };
  const cache = { put: async () => {} };
  const r = await fetchArtFile('/assets/b.png', { index, fetchFn, cache });
  assert.deepEqual(r, { ok: true, from: 'server', bytes: 4 });
  assert.deepEqual(got, ['https://m1/assets/b.png', '/assets/b.png']);
});

test('fetchArtFile: ok:false when every source fails', async () => {
  const index = { files: { '/assets/c.png': 5 }, sources: ['https://m1'] };
  const fetchFn = async () => { throw new Error('down'); };
  const r = await fetchArtFile('/assets/c.png', { index, fetchFn, cache: { put: async () => {} } });
  assert.deepEqual(r, { ok: false });
});
