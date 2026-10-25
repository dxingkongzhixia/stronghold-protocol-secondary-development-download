// Hub backdrop themes (ui/hub/appearance.js + storyImages.js): the owner's 2026-10-25 set — 夜巡 / 剧情背景 /
// 自定义背景, with one story tile that cycles the CG set instead of listing every image.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUB_THEMES, sanitizeBackdrop, backdropScene, backdropTheme } from '../../public/js/ui/hub/appearance.js';
import { STORY_IMAGES } from '../../public/js/ui/hub/storyImages.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Hub backdrop themes', () => {
  test('the picker offers 夜巡 and 剧情背景 (custom is appended by the dialog)', () => {
    assert.deepEqual(HUB_THEMES.map((x) => x.id), ['night', 'story']);
    assert.deepEqual(HUB_THEMES.map((x) => x.name), ['夜巡', '剧情背景']);
  });

  test('old procedural themes fall back to 夜巡; story and custom survive', () => {
    for (const old of ['frost', 'ember', 'calm']) assert.equal(sanitizeBackdrop({ theme: old }).theme, 'night', old);
    assert.equal(sanitizeBackdrop({ theme: 'story' }).theme, 'story');
    assert.equal(sanitizeBackdrop({ theme: 'custom' }).theme, 'custom');
    assert.equal(sanitizeBackdrop({ theme: 'nope' }).theme, 'night');
  });

  test('a story theme renders the photo layer only with an image, else the night scene', () => {
    assert.equal(backdropScene({ pref: { theme: 'story' }, storyUrl: '/assets/ui/hub/story/story-01.webp' }), 'story');
    assert.equal(backdropScene({ pref: { theme: 'story' }, storyUrl: null }), 'night');
    assert.equal(backdropTheme({ pref: { theme: 'story' }, storyUrl: '/x.webp' }), 'story');
    assert.equal(backdropScene({ pref: { theme: 'custom' }, imageUrl: '/blob:x', ready: true }), 'photo');
    assert.equal(backdropScene({ pref: { theme: 'custom' }, imageUrl: null, ready: true }), 'night');
  });

  test('the story set is one indexed tile source: unique local files, all on disk', () => {
    assert.ok(STORY_IMAGES.length > 1);
    const files = STORY_IMAGES.map((x) => x.file);
    assert.equal(new Set(files).size, files.length);
    for (const x of STORY_IMAGES) {
      assert.match(x.file, /^\/assets\/ui\/hub\/story\/story-\d{2}\.webp$/);
      assert.ok(existsSync(path.join(ROOT, 'public', x.file)), x.file);
    }
  });
});
