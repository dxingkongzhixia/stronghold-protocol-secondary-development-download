// test/ui/audio-version.test.js — a version's own BGM (VERSION_BGM): the 规程 pack ids select the season theme, the
// 2024 stage BGM in combat, and boss1 / boss2; the default 盟约 keys are unchanged and a missing pack falls back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bgmKeyFor, resolveBgm, VERSION_BGM } from '../../public/js/audio.js';

const ACT3 = 'act3autochess@V3_1';
const pack = VERSION_BGM[ACT3];

test('规程 phases select the version pack; the default keys are unchanged', () => {
  const pub = (phase, extra = {}) => ({ phase, version: ACT3, ...extra });
  assert.equal(bgmKeyFor('game', pub('INFO_CHECK')), `lobby:${pack.theme}`);
  assert.equal(bgmKeyFor('game', pub('CUSTOM_CHECK')), `lobby:${pack.theme}`);
  assert.equal(bgmKeyFor('game', pub('PREP')), `lobby:${pack.theme}`);
  assert.equal(bgmKeyFor('game', pub('COMBAT')), `lobby:${pack.combat}`);
  assert.equal(bgmKeyFor('game', pub('UNITE')), `lobby:${pack.combat}`);
  assert.equal(bgmKeyFor('game', pub('FINAL_ASSAULT', { bossId: 'boss_1' })), `lobby:${pack.boss}`);
  assert.equal(bgmKeyFor('game', pub('HIDDEN_CORE', { hiddenBossId: 'boss_8' })), `lobby:${pack.hidden}`);
  // the default 盟约 data keeps its own keys
  assert.equal(bgmKeyFor('game', { phase: 'PREP' }), 'prep');
  assert.equal(bgmKeyFor('game', { phase: 'COMBAT' }, 1), 'combat:1');
  assert.equal(bgmKeyFor('game', { phase: 'FINAL_ASSAULT', bossId: 'boss_1' }), 'boss:boss_1');
});

test('the pack resolves through the music library; without it the manifest lobby track is the fallback', () => {
  const key = bgmKeyFor('game', { phase: 'PREP', version: ACT3 });
  const lib = (id) => (id === pack.theme ? { loop: '/music/music_bg_act3autochess_loop.mp3' } : null);
  const manifest = { audio: { bgm: { lobby: { loop: '/assets/audio/music/music_bg_default_loop.mp3' } } } };
  assert.equal(resolveBgm(manifest, key, lib).loop, '/music/music_bg_act3autochess_loop.mp3');
  assert.equal(resolveBgm(manifest, key, null).loop, '/assets/audio/music/music_bg_default_loop.mp3');
});
