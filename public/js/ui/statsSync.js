// public/js/ui/statsSync.js — submits the local match records to the server (server/stats.js, docs/MATCHMAKING.md §40)
// and reads the server's copy back for the stats page.
//
// The browser keeps every finished match in localStorage (`ui/stats.js`); this module uploads the ones the server has
// not accepted yet, deduped by the record's own id, ONE backlog at a time. It flushes after every stored record
// (`setStatsUploader`), after a `welcome` (a new / resumed session) and after `auth.ok` (logging in — the local
// backlog, recorded as a guest or offline, is then re-submitted under the account). An accepted id is remembered in
// `sp.pref.statsSync` (bounded to the records still on this device), so the same record is never sent twice. Guests
// are submitted exactly like accounts: the server keys the row by the session (account id, else the guest playerId).
//
// The page reads from the server in both cases (account or guest) via `fetchStats` (stats.list for one's own records,
// stats.view for another online player's), falling back to localStorage when the socket is down.

import { loadPref, savePref } from '../store.js';
import { loadStats } from './stats.js';

/** localStorage pref key (`sp.pref.<key>`) holding the ids the server already accepted. */
export const STATS_SYNC_PREF = 'statsSync';
/** The most records one pass submits before yielding (a big backlog goes over several passes; the server dedupes). */
export const MAX_UPLOAD_PER_FLUSH = 500;

/** @returns {{ uploaded: string[] }} the persisted sync state (a missing / corrupt value reads as empty). */
export function loadSyncState() {
  const raw = loadPref(STATS_SYNC_PREF, null);
  const uploaded = raw && Array.isArray(raw.uploaded) ? raw.uploaded.filter((id) => typeof id === 'string' && id.length) : [];
  return { uploaded };
}

/** @param {{ uploaded: string[] }} state */
export function saveSyncState(state) {
  savePref(STATS_SYNC_PREF, { uploaded: Array.isArray(state?.uploaded) ? state.uploaded : [] });
}

/** The records the server has not accepted yet, newest first (as stored), capped to `limit`. */
export function pendingRecords(records, uploaded, limit = MAX_UPLOAD_PER_FLUSH) {
  const have = uploaded instanceof Set ? uploaded : new Set(uploaded || []);
  return (Array.isArray(records) ? records : []).filter((r) => r && r.id && !have.has(r.id)).slice(0, limit);
}

/**
 * Remember newly accepted ids, dropping any the local store no longer holds (keeps the pref ≤ MAX_RECORDS).
 * @param {string[]} ids
 */
export function markUploaded(ids) {
  if (!Array.isArray(ids) || !ids.length) return;
  const state = loadSyncState();
  const set = new Set(state.uploaded);
  for (const id of ids) if (typeof id === 'string' && id) set.add(id);
  const known = new Set(loadStats().records.map((r) => r.id));
  saveSyncState({ uploaded: [...set].filter((id) => known.has(id)) });
}

/** One pending record is deduped and refused forever after a validation refusal; everything else is retried next pass. */
const PERMANENT = new Set(['BAD_MSG', 'BAD_STATS']);

/** A module-level guard so overlapping passes do not spin (the server dedupes anyway). */
let flushing = false;

/**
 * Submit the local backlog once (one call = up to MAX_UPLOAD_PER_FLUSH records, repeated until drained or refused).
 * Safe to call often; a no-op when the socket is down (the next welcome / auth.ok retries).
 * @param {any} net
 * @returns {Promise<{ sent: number, stopped: boolean }>}
 */
export async function flushStats(net) {
  if (flushing) return { sent: 0, stopped: true };
  if (!net || net.status !== 'online' || !net.name) return { sent: 0, stopped: false };
  flushing = true;
  let sent = 0;
  try {
    for (;;) {
      const stats = loadStats();
      if (stats.newer) return { sent, stopped: true }; // never upload over a newer build's local data
      const todo = pendingRecords(stats.records, loadSyncState().uploaded);
      if (!todo.length) return { sent, stopped: false };
      let accepted = 0;
      for (const rec of todo) {
        try {
          await net.request('stats.submit', { record: rec });
        } catch (err) {
          if (PERMANENT.has(err && err.code)) { markUploaded([rec.id]); sent++; accepted++; continue; }
          return { sent, stopped: true }; // OFFLINE / TIMEOUT / RATE / INTERNAL: retry on the next welcome / flush
        }
        markUploaded([rec.id]);
        sent++;
        accepted++;
      }
      if (accepted === 0 || todo.length < MAX_UPLOAD_PER_FLUSH) return { sent, stopped: false };
    }
  } finally {
    flushing = false;
  }
}

/**
 * Wire the stats sync once (main.js): flush on a stored record (through the uploader), on `welcome`, and on `auth.ok`.
 * @param {{ net: any, notify?: (text: string) => void }} deps
 * @returns {{ flush: () => Promise<void>, dispose: () => void }}
 */
export function installStatsSync({ net } = {}) {
  const flush = () => flushStats(net);
  const offWelcome = typeof net?.on === 'function' ? net.on('welcome', () => { void flush(); }) : null;
  const offAuth = typeof net?.on === 'function' ? net.on('auth.ok', () => { void flush(); }) : null;
  return {
    flush,
    dispose() { offWelcome?.(); offAuth?.(); },
  };
}

/**
 * One `stats.list` (own records) or `stats.view` (another online player's, by display name) round trip. Resolves with
 * `{ records, owner, scope }`; the caller falls back to localStorage when it rejects (offline / outage).
 * @param {any} net
 * @param {{ name?: string|null, limit?: number }} [opts]
 * @returns {Promise<{ records: any[], owner: any, scope: 'self'|'other' }>}
 */
export async function fetchStats(net, { name = null, limit = null } = {}) {
  const fields = limit ? { limit } : {};
  const reply = name == null
    ? await net.request('stats.list', fields)
    : await net.request('stats.view', { name, ...fields });
  const records = Array.isArray(reply?.records) ? reply.records : [];
  return { records, owner: reply?.owner ?? null, scope: reply?.scope === 'other' ? 'other' : 'self' };
}

/** Delete the caller's own server records (the page's 清空). @returns {Promise<boolean>} */
export async function clearServerStats(net) {
  await net.request('stats.clear', {});
  return true;
}
