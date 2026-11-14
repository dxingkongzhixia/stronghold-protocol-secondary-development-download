// versions.js — which official version this page shows (shared/versions.js, the server's `welcome.versions`).
//
//   * The lobby: each player's own choice (a browser preference, `sp.pref.lobby.version`), among the versions the
//     server enables (welcome.versions: registry order, the server's default marked) — a preference the server does not
//     list falls back to its default, else to the default version (shared/versions.js DEFAULT_VERSION).
//   * A room: the room's version (room.state.version; absent = the default), whatever the preference. content.js loads
//     that version's own data set when the room names one; leaving the room restores the server's files.
//   * Texts go through t() where they are shown: a version's `label` is a msgid (shared/versions.js).

import { DEFAULT_VERSION, VERSIONS, versionById, versionSlug } from '../../shared/versions.js';
import { loadPref, savePref } from './store.js';

export { DEFAULT_VERSION, versionById, versionSlug };

/** The stored lobby preference (`sp.pref.lobby.version`): a registry id. */
export const LOBBY_VERSION_PREF = 'lobby.version';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isHex64 = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

/** The stored lobby preference, or null (junk, or an id the registry does not know). */
export function storedLobbyVersion() {
  const v = loadPref(LOBBY_VERSION_PREF, null);
  return typeof v === 'string' && versionById(v) ? v : null;
}

/** Keep the lobby's choice for this browser. @param {string | null} id */
export function saveLobbyVersion(id) {
  savePref(LOBBY_VERSION_PREF, typeof id === 'string' && versionById(id) ? id : null);
}

/**
 * welcome.versions as the page keeps it: entries of registry ids only, each `{ id, cs, family, label, roomModes,
 * default? }`, in the order the server sent; null without the key or when nothing is left.
 * @param {unknown} list
 * @returns {Array<{ id: string, cs: string, family: string, label: string, roomModes: string[], default?: true }> | null}
 */
export function sanitizeVersions(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  const seen = new Set();
  for (const e of list.slice(0, VERSIONS.length + 4)) {
    if (!isObj(e) || typeof e.id !== 'string' || seen.has(e.id) || !versionById(e.id) || !isHex64(e.cs)) continue;
    seen.add(e.id);
    const reg = versionById(e.id);
    const roomModes = Array.isArray(e.roomModes) ? e.roomModes.filter((m) => m === 'solo' || m === 'coop') : [...reg.roomModes];
    out.push({ id: e.id, cs: e.cs, family: reg.family, label: reg.label, roomModes, ...(e.default === true ? { default: true } : {}) });
  }
  return out.length ? out : null;
}

/** The server's default version (welcome.versions' `default` entry), else the code default. @param {any[] | null} list */
export function serverDefaultVersion(list) {
  return (Array.isArray(list) ? list : []).find((e) => e.default)?.id ?? DEFAULT_VERSION;
}

/**
 * The lobby's version: the preference when welcome lists it, else the server's default, else the code default.
 * @param {any[] | null} list welcome.versions (sanitizeVersions)
 * @param {string | null} pref
 */
export function lobbyVersion(list, pref) {
  if (!Array.isArray(list) || !list.length) return DEFAULT_VERSION;
  if (typeof pref === 'string' && list.some((e) => e.id === pref)) return pref;
  return serverDefaultVersion(list);
}

/** A room's version (room.state.version; absent = the default). @param {any} room */
export const roomVersion = (room) => (typeof room?.version === 'string' && room.version ? room.version : DEFAULT_VERSION);

/** The versions the lobby offers for a room mode (all when the server sent none). @param {any[] | null} list @param {'solo'|'coop'} mode */
export function versionsForMode(list, mode) {
  if (!Array.isArray(list) || !list.length) return [];
  return list.filter((v) => !Array.isArray(v.roomModes) || v.roomModes.includes(mode));
}
