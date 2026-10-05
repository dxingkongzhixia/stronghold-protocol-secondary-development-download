// test/ui/preload.test.js — boot art preloading (public/js/preload.js): the URL filter and the scope sets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectArtUrls, isArtImage } from '../../public/js/preload.js';

const M = {
  chars: { a: { avatar: '/assets/char/avatar/a.png', avatarE2: '/assets/char/avatar/a_2.png', portrait: '/assets/char/portrait/a_1.png' } },
  enemies: { e: { icon: '/assets/enemy/e.png', spine: { front: { skel: '/assets/spine/e/e.skel', atlas: '/assets/spine/e/e.atlas' } } } },
  items: { i: { img: '/assets/item/i.png' } },
  ui: { x: '/assets/ui/x.png' },
  prof: { icon: '/assets/prof/icon.png' },
};

test('isArtImage keeps only real /assets image URLs (never spine, never bare filenames)', () => {
  assert.ok(isArtImage('/assets/char/avatar/a.png'));
  assert.ok(!isArtImage('/assets/spine/e/e.png'), 'spine excluded');
  assert.ok(!isArtImage('enemy_1305_mhslim.png'), 'a bare filename is not a URL');
  assert.ok(!isArtImage('/data/foo.json'));
  assert.ok(!isArtImage(null));
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
