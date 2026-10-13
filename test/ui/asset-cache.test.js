// test/ui/asset-cache.test.js — the pure planning of the local asset cache (public/js/assetCache.js):
// which files to (re)download and which cached files are stale, judged against GET /asset-index.json.
// The browser glue (Service Worker / Cache Storage) is exercised by the e2e suites; this pins the logic.
// docs/OUR-FEATURES.md "local asset cache".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncPlan, cacheIsCurrent, effectiveAssetMode } from '../../public/js/assetCache.js';

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
