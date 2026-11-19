// ui/musicLibrary.js — the Hub's music catalogue: the committed 24 (`data/assets.json` `audio.lobbyMusic`) plus the
// optional full pack (`var/music`, served at `/music/index.json` — tools/local-extract/music.py, docs/ASSETS.md
// "Music pack"). The pack is deliberately outside git (218 tracks, ~580 MB); a checkout without it simply keeps the 24
// fallback entries.
//
// The pack index is `{ version, generated, entries: { [id]: { name, group, intro?, loop } } }`. Pack entries override the
// committed ones for the same id (the local client's originals, loudness-normalised); entries the pack lacks stay.
// `loadMusicLibrary` runs once at boot (main.js) so a saved `settings.lobbyMusic` resolves even before the Hub opens;
// it installs the lookup on the audio manager and refreshes the BGM, then notifies the picker.

import { useEffect, useReducer } from '../../vendor/hooks.module.js';
import { data } from '../data.js';
import { audio } from '../audio.js';

/** @type {Record<string, {name: string, group: string, intro?: string, loop: string}> | null} */
let pack = null;
let loadPromise = null;
const listeners = new Set();

const notify = () => { for (const fn of [...listeners]) { try { fn(); } catch (err) { console.error('[music] listener failed', err); } } };

/** The committed catalogue (data/assets.json), empty until the manifest has loaded. */
function committed() {
  const lib = data.get('assets')?.audio?.lobbyMusic;
  return lib && typeof lib === 'object' ? lib : {};
}

/**
 * The two seasons' own themes (第三期 规程's Kernel Overflow, 第二期 盟约's Restore) and 规程's two boss tracks: the
 * picker lists them right after the default row, so both seasons are visible without scrolling the 200-track pack.
 */
export const SEASON_MUSIC = Object.freeze(["music_bg_act3autochess"]);
/** Pack tracks the picker does not list (in-game only: the 2024 stage track and 规程's two boss tracks). */
const PICKER_HIDDEN = Object.freeze(new Set([
  "music_bg_act1vautochess", "music_bg_act3autochess_boss1", "music_bg_act3autochess_boss2",
]));

/** Every known track, the pack's entry winning for the same id; the season tracks first. @returns {Record<string, any>} */
export function musicEntries() {
  const base = committed();
  const all = pack ? { ...base, ...pack } : { ...base };
  const out = {};
  for (const id of SEASON_MUSIC) if (all[id]) out[id] = all[id];
  for (const [id, e] of Object.entries(all)) if (!out[id] && !PICKER_HIDDEN.has(id)) out[id] = e;
  return out;
}

/** One track (pack first), or null. @param {string} id @returns {{intro?: string, loop: string}|null} */
export function musicTrack(id) {
  if (!id) return null;
  const e = (pack && pack[id]) || committed()[id];
  return e && typeof e.loop === 'string' ? e : null;
}

/** Subscribe to the pack finishing (the picker's rows and the chip's name). @param {() => void} fn */
export function subscribeMusicLibrary(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Fetch the optional pack index once. Missing / malformed / offline is normal: the committed catalogue stays.
 * @returns {Promise<Record<string, any> | null>}
 */
export function loadMusicLibrary() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const r = await fetch('/music/index.json', { cache: 'no-store' });
      if (r.ok) {
        const doc = await r.json();
        if (doc?.entries && typeof doc.entries === 'object') {
          const valid = {};
          for (const [id, e] of Object.entries(doc.entries)) {
            if (e && typeof e.loop === 'string' && /^\/music\/music_[A-Za-z0-9_]+_loop\.mp3$/.test(e.loop)) {
              valid[id] = { ...e, intro: typeof e.intro === 'string' ? e.intro : undefined };
            }
          }
          if (Object.keys(valid).length) pack = valid;
        }
      }
    } catch { /* no pack, or offline: the 24 committed tracks */ }
    audio.setMusicLibrary((id) => musicTrack(id));
    audio.refreshBgm();
    notify();
    return pack;
  })();
  return loadPromise;
}

/** Preact hook: the merged catalogue; starts the one-shot pack load. */
export function useMusicLibrary() {
  const [, force] = useReducer((c) => c + 1, 0);
  useEffect(() => {
    let alive = true;
    const unsub = subscribeMusicLibrary(() => { if (alive) force(); });
    loadMusicLibrary();
    return () => { alive = false; unsub(); };
  }, []);
  return musicEntries();
}
