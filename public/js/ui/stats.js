// Local match statistics: every match the local player took part in is appended as one record to localStorage
// (`sp.pref.stats`) AND submitted to the server (server/stats.js) — tied to the session's owner (the account when
// logged in, else the guest's session identity), so a logged-in player's history crosses devices and online players
// can read each other's public record list. localStorage remains the offline / outage fallback and the store the
// export / import buttons read. (Ported from PR #323 by @2321Robin; reworked for 0.2.2; server-backed in this fork.)
//
// Two kinds of record (`end`):
//   'settled'  the match reached its settlement: m.result arrived (server/match/results.js buildResult). The record
//              keeps what the settlement offers — the match frame (difficulty, mode, boss, seed, duration, hidden-core
//              outcome, reason) and one row per player (band, title, lineup, bonds, the stat block) — so the page can
//              re-view the settlement screen (recordToResult).
//   'quit'     the player gave up (放弃模拟) before the settlement; the server sends a leaver nothing, so the record is
//              built from what the client knew at that moment (buildQuitRecord): the frame, the player's own row, the
//              rounds cleared. It is listed in the history, marked 中途退出, and cannot be re-viewed.
//
// What counts (countsTowardStats, the owner's decision of 2026-10-08: a match entered and left right away must not
// count): every aggregate — games, wins, win rate, hidden core, best round, time played, the strategy table, titles
// and the combat totals — is taken over the records that count. A settled record always counts. A quit record counts
// once at least one of the player's own battles had finished — a round cleared (the server's rule: leaving while
// round k runs has passed k − 1 rounds, leaving in its settlement k) or already eliminated. A match left earlier is
// history only.
//
// Bounded storage: at most MAX_RECORDS matches and MAX_CHARS characters of JSON (the shared schema + limits, ours =
// 2 × the mainline — shared/constants.js STATS_*). Only the newest FULL_KEEP records keep their full rows (lineups,
// bonds, teammates' names — what the settlement replay needs); older ones are compacted to the player's own summary
// row, which is all the aggregates read. The oldest records go first when a budget is hit, and a write the browser
// refuses shrinks the list further instead of failing. The server (server/stats.js) enforces the same caps per owner.
//
// Format evolution: the envelope carries a version (`STATS_VERSION`); `migrateStats` walks records through a chain of
// per-version steps and every loaded / imported record passes `normalizeRecord`, a strict schema. An envelope from a
// NEWER version than this build is refused (never downgraded and written back); an unreadable one is set aside
// (`sp.pref.stats.damaged`) and the history starts again.
//
// Pure schema / logic lives in `shared/stats.js` (re-exported here unchanged); this module adds the browser side:
// localStorage I/O (`loadStats` / `saveStats`) and the match tracker (`installStatsRecorder` / `recordResult` /
// `recordQuit`). `setStatsUploader` lets `ui/statsSync.js` submit a freshly stored record to the server.

import { PHASE } from '../../../shared/constants.js';
import {
  STATS_VERSION, emptyStats, normalizeRecord, migrateStats, fitToBudget, appendRecord, buildRecord,
  roomModeOf, str, num, int, isObj, fnv1a,
} from '../../../shared/stats.js';

// The shared schema + pure logic, re-exported unchanged: the stats screens and the unit tests import them from here.
export {
  STATS_VERSION, MAX_RECORDS, FULL_KEEP, MAX_CHARS, IMPORT_MAX_CHARS, emptyStats, normalizeStatBlock, recordId,
  normalizeRecord, MIGRATIONS, migrateStats, compactRecord, fitToBudget, roomModeOf, buildRecord, recordToResult,
  appendRecord, mergeStats, importStats, exportStats, selfRowOf, roundsOf, countsTowardStats, aggregateStats,
  isObj, int, num, bool, str, fnv1a, newestFirst,
} from '../../../shared/stats.js';

/** localStorage key under the app's `sp.pref.` prefix (store.js loadPref). */
export const STATS_PREF_KEY = 'stats';

const FULL_KEY = `sp.pref.${STATS_PREF_KEY}`;
const DAMAGED_KEY = `${FULL_KEY}.damaged`;

/** Read the raw stored string (null when absent or unreadable). */
function readRaw() {
  try { return globalThis.localStorage?.getItem(FULL_KEY) ?? null; } catch { return null; }
}

/**
 * Read + migrate the persisted envelope; self-heals older shapes back to storage. An unreadable value (not JSON, or
 * not an envelope) is moved to `sp.pref.stats.damaged` — kept for a manual recovery — and the history starts again.
 * @returns {{ v: number, records: any[], newer: boolean, dropped: number, damaged: boolean }}
 */
export function loadStats() {
  const raw = readRaw();
  if (raw == null) return { ...emptyStats(), newer: false, dropped: 0, damaged: false };
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
  if (!isObj(parsed) || !Array.isArray(parsed.records)) {
    // keep the bad value where a person can find it; if even that write fails the next save simply replaces it
    try { globalThis.localStorage?.setItem(DAMAGED_KEY, raw); globalThis.localStorage?.removeItem(FULL_KEY); } catch { /* keep it in place */ }
    return { ...emptyStats(), newer: false, dropped: 0, damaged: true };
  }
  const { stats, changed, newer, dropped } = migrateStats(parsed);
  if (!newer && changed) saveStats(stats);
  return { ...stats, newer, dropped, damaged: false };
}

/**
 * Persist the envelope. Never overwrites an envelope of a newer build. Compacts and trims to the budget first; a write
 * the browser refuses (quota — other keys share it) is retried with half the history, down to a handful of records.
 * @param {{ v: number, records: any[], newer?: boolean }} stats
 * @returns {boolean} whether a write stuck
 */
export function saveStats(stats) {
  if (stats.newer) return false;
  let recs = fitToBudget(stats.records);
  for (;;) {
    try {
      const ls = globalThis.localStorage;
      if (!ls) return false; // no storage at all (disabled by the browser)
      ls.setItem(FULL_KEY, JSON.stringify({ v: STATS_VERSION, records: recs }));
      return true;
    } catch { /* quota or storage disabled — fall through to shrinking */ }
    if (recs.length <= 8) return false; // a small history that still does not fit is foreign quota pressure
    recs = recs.slice(0, Math.max(8, Math.ceil(recs.length / 2)));
  }
}

// ---- the match left early ----------------------------------------------------------------------------------------

/**
 * What the page remembers of the match on screen, so that giving it up can still be recorded: when the page first saw
 * it, whether that was at the start (a duration is only kept then), and the last round the player was seen alive in
 * (the server tells the others at the settlement, a leaver nothing).
 * @returns {{ active: boolean, startedAt: number, sawStart: boolean, aliveRound: number|null }}
 */
export const createLiveMatch = () => ({ active: false, startedAt: 0, sawStart: false, aliveRound: null });

/** The module's own tracker (fed by installStatsRecorder, read by recordQuit). */
export const liveMatch = createLiveMatch();

/**
 * Feed the tracker one app state (cheap: called on every store change).
 * @param {ReturnType<typeof createLiveMatch>} live
 * @param {any} state the app store state
 * @param {number} [now]
 */
export function observeMatch(live, state, now = Date.now()) {
  const pub = state?.match?.public;
  const inMatch = !!pub && !!pub.phase && pub.phase !== PHASE.LOBBY && pub.phase !== PHASE.RESULT && !state.match.result;
  if (!inMatch) { live.active = false; return live; }
  const round = Number(pub.round) || 0;
  if (!live.active) {
    live.active = true;
    live.startedAt = now;
    live.sawStart = round <= 1;
    live.aliveRound = null;
  }
  const me = Array.isArray(pub.players) ? pub.players.find((p) => isObj(p) && p.playerId === state.me?.playerId) : null;
  if (me && me.alive !== false) live.aliveRound = Math.max(live.aliveRound ?? 0, round);
  return live;
}

/** Start following the store (main.js). Returns the unsubscribe function. */
export function installStatsRecorder(store) {
  observeMatch(liveMatch, store.get());
  return store.subscribe((s) => observeMatch(liveMatch, s));
}

/**
 * The rounds a player who leaves in `phase` of `round` has cleared — the server's rule for a quit (platform.js _quit:
 * eliminated in round k ⇒ k − 1 passed; leaving in the settlement of round k counts k).
 * @param {string} phase @param {number} round
 */
export function clearedRounds(phase, round) {
  const r = Number.isFinite(round) ? round : 0;
  return Math.max(0, phase === PHASE.SETTLE ? r : r - 1);
}

/**
 * Build the quit record of a match the local player is leaving (放弃模拟), from the app state and the tracker. Null when
 * there is nothing of mine to record: no match on screen, its settlement already here (that one is recorded by
 * recordResult), a spectator seat, or a match the page never saw.
 * @param {any} state the app store state BEFORE the match is cleared
 * @param {{ live?: ReturnType<typeof createLiveMatch>, now?: number }} [ctx]
 * @returns {any|null}
 */
export function buildQuitRecord(state, ctx = {}) {
  const live = ctx.live ?? liveMatch;
  const now = int(ctx.now, Date.now());
  const pub = state?.match?.public;
  const myId = str(state?.me?.playerId);
  if (!pub || !myId || state.match.result || !live.active) return null;
  const row = Array.isArray(pub.players) ? pub.players.find((p) => isObj(p) && p.playerId === myId) : null;
  if (!row) return null; // a spectator seat is no player of the match
  const alive = row.alive !== false;
  const round = Number(pub.round) || 0;
  // alive: the rounds cleared so far; already eliminated: the round it was seen alive in, less one (unknown when the
  // page never saw it alive — a reload after the elimination)
  const roundsPassed = alive ? clearedRounds(pub.phase, round) : (live.aliveRound != null ? Math.max(0, live.aliveRound - 1) : null);
  return normalizeRecord({
    v: STATS_VERSION,
    t: now,
    id: `q.${fnv1a([myId, live.startedAt, pub.modeId ?? '-', state.room?.code ?? '-'].join('|'))}`,
    end: 'quit',
    victory: false,
    roundsPassed,
    lastRound: num(pub.lastRound),
    hiddenReached: pub.phase === PHASE.HIDDEN_CORE,
    hiddenCleared: false,
    reason: 'quit',
    modeId: str(pub.modeId),
    difficulty: str(pub.difficulty),
    stageId: str(pub.stageId),
    bossId: str(pub.bossId),
    hiddenBossId: str(pub.hiddenBossId),
    seed: null,
    durationMs: live.sawStart ? Math.max(0, now - live.startedAt) : null,
    teamLp: num(pub.teamLp),
    roomMode: roomModeOf(str(pub.modeId), state.room?.mode),
    selfId: myId,
    players: [{
      playerId: myId, seat: row.seat, name: row.name, isBot: false, left: true, alive, victory: false, roundsPassed,
      eliminatedRound: alive ? null : live.aliveRound, lp: row.lp, bandId: row.bandId,
    }],
  });
}

// ---- storage + the server upload hook ----------------------------------------------------------------------------

/** @type {((rec: any) => void) | null} set by ui/statsSync.js so a stored record is also submitted to the server. */
let uploader = null;

/**
 * Install (or clear, with null) the callback a freshly-stored record is handed to. `ui/statsSync.js` uses it to submit
 * the record to the server; without it (unit tests, a locked-down build) the local store is all there is.
 * @param {((rec: any) => void) | null} fn
 */
export function setStatsUploader(fn) { uploader = typeof fn === 'function' ? fn : null; }

/** load → append → save of one built record (never over an envelope of a newer build). @returns {any|null} the record when stored */
function storeRecord(rec) {
  if (!rec) return null;
  const stats = loadStats();
  if (stats.newer) return null;
  const { stats: next, added } = appendRecord(stats, rec);
  if (added && !saveStats(next)) console.warn('[stats] localStorage write failed (quota?), record not persisted');
  if (added && uploader) { try { uploader(rec); } catch (err) { console.warn('[stats] upload failed', err); } }
  return added ? rec : null;
}

/**
 * Record a finished match end-to-end (load → append → save). Returns the built record, or null when
 * nothing was stored (no players / not my match / replay).
 * @param {any} res raw m.result payload
 * @param {{ myId?: string|null, roomMode?: string|null, now?: number }} [ctx]
 * @returns {any|null}
 */
export function recordResult(res, ctx = {}) {
  return storeRecord(buildRecord(res, ctx));
}

/**
 * Record the match the player is giving up (放弃模拟), before the app clears its state. Returns the record, or null.
 * @param {any} state the app store state before the match is cleared
 * @param {{ live?: ReturnType<typeof createLiveMatch>, now?: number }} [ctx]
 * @returns {any|null}
 */
export function recordQuit(state, ctx = {}) {
  const live = ctx.live ?? liveMatch;
  const rec = storeRecord(buildQuitRecord(state, ctx));
  live.active = false; // one record per match
  return rec;
}
