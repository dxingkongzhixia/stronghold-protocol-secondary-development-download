// test/ui/settings-search.test.js — the settings search predicate (batch C): rows match their own text, case-insensitive,
// and an empty needle keeps everything visible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settingMatches } from '../../public/js/ui/settingsSearch.js';

test('settingMatches: substring, case-insensitive, trimmed; empty matches all', () => {
  assert.equal(settingMatches('背景音乐 BGM', 'bgm'), true);
  assert.equal(settingMatches('背景音乐 BGM', '音乐'), true);
  assert.equal(settingMatches('背景音乐 BGM', '  BGM  '), true);
  assert.equal(settingMatches('背景音乐 BGM', '语音'), false);
  assert.equal(settingMatches('', ''), true);
  assert.equal(settingMatches(null, 'x'), false);
  assert.equal(settingMatches('anything', null), true);
});
