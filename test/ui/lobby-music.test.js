// 主界面音乐 (owner 2026-10-25): the curated catalogue, the settings round-trip and the manager's route gate.
// The files themselves are checked in the manifest test (a checkout without the downloaded library skips it).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOBBY_MUSIC, LOBBY_MUSIC_GROUPS } from '../../tools/assets/lobby-music.mjs';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../public/js/ui/gameLogic/settings.js';
import { audio, resolveBgm } from '../../public/js/audio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8'));

describe('主界面音乐', () => {
  test('the curated list has unique ids in known groups', () => {
    const ids = LOBBY_MUSIC.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate id');
    for (const x of LOBBY_MUSIC) {
      assert.match(x.id, /^music_[a-z0-9_]+$/);
      assert.ok(LOBBY_MUSIC_GROUPS.includes(x.group), `${x.id}: group ${x.group}`);
      assert.notEqual(x.group, 'all', 'all is the picker tab, not a catalogue group');
    }
  });

  test('settings keep a saved id and reject anything else', () => {
    assert.equal(DEFAULT_SETTINGS.lobbyMusic, '', 'default = the mode’s own lobby theme');
    assert.equal(sanitizeSettings(null).lobbyMusic, '');
    assert.equal(sanitizeSettings({ lobbyMusic: 'music_bg_default' }).lobbyMusic, 'music_bg_default');
    assert.equal(sanitizeSettings({ lobbyMusic: 'music_furniture_musicBox' }).lobbyMusic, 'music_furniture_musicBox');
    for (const bad of ['', 'bg_default', 'music bg', 1, true, null, {}, []]) {
      assert.equal(sanitizeSettings({ lobbyMusic: bad }).lobbyMusic, '', JSON.stringify(bad));
    }
    const saved = sanitizeSettings({ lobbyMusic: 'music_bg_yan' });
    assert.equal(sanitizeSettings(JSON.parse(JSON.stringify(saved))).lobbyMusic, 'music_bg_yan');
  });

  test('the manifest lists every curated track and its files are on disk', (t) => {
    const lib = manifest.audio?.lobbyMusic;
    if (!lib || !Object.keys(lib).length) return t.skip('the music library is not downloaded in this checkout');
    for (const { id } of LOBBY_MUSIC) {
      const entry = lib[id];
      if (!entry) continue; // an older audio dump: the plan skips it, the client falls back to bgm.lobby
      assert.ok(typeof entry.name === 'string' && entry.name, `${id}: name`);
      assert.ok(LOBBY_MUSIC_GROUPS.includes(entry.group), `${id}: group`);
      assert.match(entry.loop, new RegExp(`^/assets/audio/music/${id}_loop\\.mp3$`));
      assert.ok(existsSync(path.join(ROOT, 'public', entry.loop)), `${id}: ${entry.loop}`);
      assert.equal(resolveBgm(manifest, `lobby:${id}`).loop, entry.loop);
      if (entry.intro) {
        assert.equal(entry.intro, `/assets/audio/music/${id}_intro.mp3`);
        assert.ok(existsSync(path.join(ROOT, 'public', entry.intro)), `${id}: ${entry.intro}`);
        assert.equal(resolveBgm(manifest, `lobby:${id}`).intro, entry.intro);
      }
    }
  });

  test('setLobbyTrack swaps the track only while the Hub is on screen', () => {
    const savedTrack = audio.lobbyTrack;
    const savedActive = audio.lobbyActive;
    const savedPlay = audio.playBgm;
    const calls = [];
    audio.playBgm = (key) => calls.push(key);
    try {
      audio.lobbyTrack = '';
      audio.lobbyActive = false;
      audio.setLobbyTrack('music_bg_default');
      assert.deepEqual(calls, [], 'outside the Hub the pick waits for the next visit');
      assert.equal(audio.lobbyKey(), 'lobby:music_bg_default');
      audio.setLobbyActive(true);
      assert.deepEqual(calls, [], 'entering the Hub is the route sync’s playBgm, not the setter’s');
      audio.setLobbyTrack('music_bg_yan');
      assert.deepEqual(calls, ['lobby:music_bg_yan']);
      audio.setLobbyTrack('music_bg_yan');
      assert.deepEqual(calls, ['lobby:music_bg_yan'], 'the same pick never restarts');
      audio.setLobbyTrack('');
      assert.deepEqual(calls, ['lobby:music_bg_yan', 'lobby'], 'clearing returns to the default theme');
      assert.equal(audio.lobbyKey(), 'lobby');
    } finally {
      audio.playBgm = savedPlay;
      audio.lobbyTrack = savedTrack;
      audio.lobbyActive = savedActive;
    }
  });
});
