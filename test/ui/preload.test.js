// test/ui/preload.test.js — boot art preloading (public/js/preload.js): the URL filter, the scope sets, the loader's
// progress counter (0→N, failures counted, never stalls/exceeds) and the boot progress reporter.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectArtUrls, isArtImage, preloadImages, artProgressReporter } from '../../public/js/preload.js';

const M = {
  chars: { a: { avatar: '/assets/char/avatar/a.png', avatarE2: '/assets/char/avatar/a_2.png', portrait: '/assets/char/portrait/a_1.png' } },
  enemies: { e: { icon: '/assets/enemy/e.png', spine: { front: { skel: '/assets/spine/e/e.skel', atlas: '/assets/spine/e/e.atlas' } } } },
  items: { i: { img: '/assets/item/i.png' } },
  ui: { x: '/assets/ui/x.png' },
  prof: { icon: '/assets/prof/icon.png' },
};

test('isArtImage keeps real /assets image URLs and their mirror URLs (never spine, never bare filenames)', () => {
  assert.ok(isArtImage('/assets/char/avatar/a.png'));
  assert.ok(!isArtImage('/assets/spine/e/e.png'), 'spine excluded');
  assert.ok(!isArtImage('enemy_1305_mhslim.png'), 'a bare filename is not a URL');
  assert.ok(!isArtImage('/data/foo.json'));
  assert.ok(!isArtImage(null));
  // a manifest fetched after the mirror prefix is installed carries the mirror's URL; the preload list then has to
  // accept it, or it comes back empty and the boot preload silently does nothing (the 2026-10-14 measurement)
  const mirror = 'https://gh-proxy.com/https://raw.githubusercontent.com/o/r/master/public';
  assert.ok(isArtImage(mirror + '/assets/~0123456789abcdef/char/avatar/a.png'), 'the mirror URL of an avatar');
  assert.ok(isArtImage(mirror + '/assets/~0123456789abcdef/ui/x.png?h=0123456789abcdef'), 'and with the ?h= query');
  assert.ok(!isArtImage(mirror + '/assets/spine/e/e.png'), 'spine stays excluded on a mirror URL too');
  assert.ok(!isArtImage('https://example.com/other/a.png'), 'an unrelated host is not art');
});

test('preloadImages retries a failed mirrored URL from this server, once', async () => {
  const { setMirrorPrefix } = await import('../../public/js/assetMirror.js');
  const BASE = 'https://mirror.example/repo/public';
  setMirrorPrefix(BASE);
  const seen = [];
  const realImage = globalThis.Image;
  // a fake Image: the mirror URL always errors, the same-origin retry succeeds
  globalThis.Image = class {
    set src(u) { seen.push(u); this._u = u; setTimeout(() => (u.startsWith(BASE) ? this.onerror?.() : this.onload?.()), 0); }
    get src() { return this._u; }
  };
  try {
    const mirrored = `${BASE}/assets/char/avatar/a.png?h=0123456789abcdef`;
    const r = await preloadImages([mirrored], { concurrency: 1 }).promise;
    assert.deepEqual(seen, [mirrored, '/assets/~0123456789abcdef/char/avatar/a.png'], 'mirror first, then this server');
    assert.equal(r.done, 1, 'the image counts as done exactly once');
  } finally {
    globalThis.Image = realImage;
    setMirrorPrefix('');
  }
});

test('collectArtUrls scopes: icons (default) / ui / all', () => {
  const icons = collectArtUrls(M, 'icons');
  assert.ok(icons.includes('/assets/char/avatar/a.png'));
  assert.ok(icons.includes('/assets/enemy/e.png'));
  assert.ok(!icons.includes('/assets/char/portrait/a_1.png'), 'portraits only in all');
  assert.ok(!icons.includes('/assets/ui/x.png'), 'ui only in ui/all');
  assert.ok(!icons.some((u) => u.includes('/spine/')), 'no spine');

  const ui = collectArtUrls(M, 'ui');
  assert.ok(ui.includes('/assets/ui/x.png'));
  assert.ok(!ui.includes('/assets/char/portrait/a_1.png'));

  const all = collectArtUrls(M, 'all');
  assert.ok(all.includes('/assets/char/portrait/a_1.png'));
  assert.equal(new Set(all).size, all.length, 'de-duplicated');
  assert.ok(collectArtUrls(undefined, 'icons').length === 0, 'no manifest → empty');
});

/** A fake Image whose loads complete on the microtask queue; a URL containing 'fail' fires onerror. */
class FakeImage {
  set src(u) {
    this._src = u;
    queueMicrotask(() => (u.includes('fail') ? this.onerror : this.onload)?.call(this));
  }
  get src() { return this._src; }
}

async function withFakeImage(fn) {
  const prev = globalThis.Image;
  globalThis.Image = FakeImage;
  try { return await fn(); } finally { globalThis.Image = prev; }
}

test('preloadImages reports progress 1…N (failures counted, never stalls or exceeds the total)', async () => {
  await withFakeImage(async () => {
    const urls = ['/a.png', '/b.png', '/fail.png', '/c.png', '/d.png'];
    const seen = [];
    const res = await preloadImages(urls, { concurrency: 2, onProgress: (done, total) => seen.push([done, total]) }).promise;
    assert.deepEqual(seen, [[1, 5], [2, 5], [3, 5], [4, 5], [5, 5]], 'strictly 1..N, the failed image counted too');
    assert.deepEqual(res, { done: 5, total: 5, aborted: false });
  });
});

test('preloadImages with an empty list reports nothing and resolves at 0/0', async () => {
  const seen = [];
  const res = await preloadImages([], { onProgress: (d, t) => seen.push([d, t]) }).promise;
  assert.deepEqual(seen, []);
  assert.deepEqual(res, { done: 0, total: 0, aborted: false });
});

test('artProgressReporter advances the count line and the bar (regression: the numerator stuck at 0)', () => {
  const fill = { style: {} };
  const sub = { textContent: '' };
  const report = artProgressReporter({ fill, sub });
  report(0, 3);
  assert.equal(sub.textContent, '正在加载美术资源 0 / 3');
  assert.equal(fill.style.width, '0%');
  report(1, 3);
  assert.equal(sub.textContent, '正在加载美术资源 1 / 3', 'the loaded count must not shadow the i18n t');
  assert.equal(fill.style.width, '33%');
  report(3, 3);
  assert.equal(sub.textContent, '正在加载美术资源 3 / 3');
  assert.equal(fill.style.width, '100%');
  // a 0-total never divides by zero, and missing elements are tolerated
  assert.doesNotThrow(() => artProgressReporter({ fill, sub })(0, 0));
  assert.doesNotThrow(() => artProgressReporter()(1, 2));
});
