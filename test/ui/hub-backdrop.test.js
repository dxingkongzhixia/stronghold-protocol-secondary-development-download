// Hub backdrop themes (ui/hub/appearance.js + storyImages.js): 夜巡 / 动态皮肤 / 剧情背景 / 自定义背景 — one tile
// each; the story tile opens a chooser instead of listing every CG, and the dynamic tile appears only when a local
// outfit is installed.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUB_THEMES, sanitizeBackdrop, backdropScene, backdropTheme } from '../../public/js/ui/hub/appearance.js';
import { STORY_IMAGES } from '../../public/js/ui/hub/storyImages.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Hub backdrop themes', () => {
  test('the picker offers 夜巡 / 动态皮肤 / 剧情背景 (custom is appended by the dialog)', () => {
    assert.deepEqual(HUB_THEMES.map((x) => x.id), ['night', 'dyn', 'story']);
    assert.deepEqual(HUB_THEMES.map((x) => x.name), ['夜巡', '动态皮肤', '剧情背景']);
  });

  test('old procedural themes fall back to 夜巡; story, its chosen file, the outfit and custom survive', () => {
    for (const old of ['frost', 'ember', 'calm']) assert.equal(sanitizeBackdrop({ theme: old }).theme, 'night', old);
    assert.equal(sanitizeBackdrop({ theme: 'story' }).theme, 'story');
    assert.equal(sanitizeBackdrop({ theme: 'dyn' }).theme, 'dyn');
    assert.equal(sanitizeBackdrop({ theme: 'custom' }).theme, 'custom');
    assert.equal(sanitizeBackdrop({ theme: 'nope' }).theme, 'night');
    const file = STORY_IMAGES[0].file;
    assert.equal(sanitizeBackdrop({ theme: 'story', story: file }).story, file);
    assert.equal(sanitizeBackdrop({ theme: 'night', story: file }).story, file, 'switching themes keeps the chosen CG');
    assert.equal(sanitizeBackdrop({ theme: 'story', story: '/assets/ui/hub/story/nope.webp' }).story, null);
    assert.equal(sanitizeBackdrop({ theme: 'story', story: 42 }).story, null);
    const id = 'char_1038_whitw2@sale#15';
    assert.equal(sanitizeBackdrop({ theme: 'dyn', dyn: id }).dyn, id);
    assert.equal(sanitizeBackdrop({ theme: 'night', dyn: id }).dyn, id, 'switching themes keeps the chosen outfit');
    assert.equal(sanitizeBackdrop({ theme: 'dyn', dyn: 'https://evil.test/a.ab' }).dyn, null);
    assert.equal(sanitizeBackdrop({ theme: 'dyn', dyn: 42 }).dyn, null);
  });

  test('a story theme renders the photo layer only with an image, else the night scene', () => {
    assert.equal(backdropScene({ pref: { theme: 'story' }, storyUrl: '/assets/ui/hub/story/story-01.webp' }), 'story');
    assert.equal(backdropScene({ pref: { theme: 'story' }, storyUrl: null }), 'night');
    assert.equal(backdropTheme({ pref: { theme: 'story' }, storyUrl: '/x.webp' }), 'story');
    assert.equal(backdropScene({ pref: { theme: 'custom' }, imageUrl: '/blob:x', ready: true }), 'photo');
    assert.equal(backdropScene({ pref: { theme: 'custom' }, imageUrl: null, ready: true }), 'night');
  });

  test('the dynamic theme renders only when an outfit resolved, else 夜巡', () => {
    assert.equal(backdropScene({ pref: { theme: 'dyn' }, dynEntry: { id: 'x' } }), 'dyn');
    assert.equal(backdropScene({ pref: { theme: 'dyn' }, dynEntry: null }), 'night');
    assert.equal(backdropScene({ pref: { theme: 'dyn' } }), 'night');
  });

  test('the story set is one indexed tile source: unique local files, all on disk', () => {
    assert.ok(STORY_IMAGES.length > 1);
    const files = STORY_IMAGES.map((x) => x.file);
    assert.equal(new Set(files).size, files.length);
    for (const x of STORY_IMAGES) {
      assert.match(x.file, /^\/assets\/ui\/hub\/story\/story-\d{2}\.webp$/);
      assert.ok(x.name.trim(), `${x.file}: the source image name is shown in the chooser`);
      assert.ok(existsSync(path.join(ROOT, 'public', x.file)), x.file);
    }
  });
});
