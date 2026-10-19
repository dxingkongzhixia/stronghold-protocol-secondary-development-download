// shared/stats.js — the match-record schema + the pure statistics logic, shared by the browser store
// (public/js/ui/stats.js) and the server store (server/stats.js). No DOM, no localStorage, no Node APIs: every export
// here is pure and Node-testable.
//
// One finished match is one normalized record (`end`): 'settled' (the match reached its settlement — server/match/
// results.js buildResult: the frame + one row per player) or 'quit' (放弃模拟 before the settlement — the frame and the
// player's own row). The record keeps only what the stats page renders / the settlement replay needs; a strict schema
// (`normalizeRecord`) drops unknown fields and bounds every string / list.
//
// Bounded storage (shared rules, OUR numbers = 2× the mainline — shared/constants.js STATS_*): at most MAX_RECORDS
// records, only the newest FULL_KEEP keep their full rows (older ones are compacted to the player's own summary), and
// the stored JSON stays under MAX_CHARS (the oldest go first). The server (server/stats.js) enforces the same caps per
// owner; the client's localStorage uses the same budget as its offline fallback.
//
// Format evolution: the envelope carries a version (`STATS_VERSION`); `migrateStats` walks records through a chain of
// per-version steps and every loaded / imported record passes `normalizeRecord`. An envelope from a NEWER version is
// refused (never downgraded); an unreadable one is set aside by the caller.

import {
  STATS_MAX_RECORDS, STATS_FULL_KEEP, STATS_MAX_CHARS, STATS_IMPORT_MAX_CHARS,
} from './constants.js';

/** Current record-envelope version (bump + add a MIGRATIONS step when the record shape changes). */
// v2 (PR #509): `creditedKills` — the self row's ACTUAL knock-outs (summons / traps credited to their owner); a v1 row
// has none (the real kill total is unknown rather than guessed from the wave counter).
export const STATS_VERSION = 2;
/** Oldest records are dropped beyond this many matches per owner (ours = 2 × the mainline 1000). */
export const MAX_RECORDS = STATS_MAX_RECORDS;
/** The newest records that keep their full rows (lineups, bonds, teammates) — what the settlement replay reads. */
export const FULL_KEEP = STATS_FULL_KEEP;
/** Budget of the stored JSON in characters per owner (ours = 2 × the mainline 800_000): the oldest records go first. */
export const MAX_CHARS = STATS_MAX_CHARS;
/** Largest export file the page reads. */
export const IMPORT_MAX_CHARS = STATS_IMPORT_MAX_CHARS;

/** @returns {{ v: number, records: Array }} a fresh empty envelope */
export const emptyStats = () => ({ v: STATS_VERSION, records: [] });

export const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
export const int = (v, d) => (Number.isFinite(v) ? Math.round(v) : d);
export const num = (v) => (Number.isFinite(v) ? v : null);
export const bool = (v, d = false) => (typeof v === 'boolean' ? v : d);
/** A non-empty string, cut to `max` characters. */
export const str = (v, max = 64) => (typeof v === 'string' && v.length ? v.slice(0, max) : null);

// per-record bounds (an imported / submitted file is foreign data: nothing a row holds may grow without limit)
const MAX_PLAYERS = 6; // the game seats 4
const MAX_LINEUP = 12;
const MAX_ITEMS = 4;
export const MAX_BONDS = 24;
const MAX_STAT_KEYS = 24;
const MAX_NAME = 24;

/**
 * Copy only the finite numeric keys of a stats block (the settlement's numbers; a numeric field this build does not
 * know is kept too, up to MAX_STAT_KEYS — display can lag, data should not).
 * @param {any} raw
 * @returns {Record<string, number>}
 */
export function normalizeStatBlock(raw) {
  const out = /** @type {Record<string, number>} */ ({});
  if (!isObj(raw)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (!Number.isFinite(v) || k.length > 32) continue;
    out[k] = v;
    if (++n >= MAX_STAT_KEYS) break;
  }
  return out;
}

/**
 * FNV-1a 32-bit, hex — a content hash needs no crypto, only stability across sessions.
 * @param {string} s
 * @returns {string}
 */
export function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * The record's dedupe id, from match facts the server replays byte-identically on reconnect / reload
 * (server/lobby.js result replay): seed + duration + mode + rounds + outcome + who I was. Two distinct
 * matches colliding on all of these is not a real scenario; a replayed m.result hits the same id and is
 * dropped, which is the point (recording happens on every m.result arrival, replays included).
 * @param {any} res raw m.result payload
 * @param {string|null|undefined} myId the local player's id at that moment
 * @returns {string}
 */
export function recordId(res, myId) {
  const r = isObj(res) ? res : {};
  return `r1.${fnv1a([r.seed ?? '-', r.durationMs ?? '-', r.modeId ?? '-', r.roundsPassed ?? '-', r.victory ? 1 : 0, myId ?? '-'].join('|'))}`;
}

/**
 * Normalize ONE player row: known fields defaulted and bounded, unknown fields dropped. `quit`: the record is a quit
 * record, whose row may not know its rounds (`roundsPassed: null`).
 * @param {any} raw
 * @param {boolean} [quit]
 * @returns {any}
 */
function normalizePlayerRow(raw, quit = false) {
  const p = isObj(raw) ? raw : {};
  // the page and the replay read the title record from the game data by id: the sent texts are not kept
  const title = isObj(p.title) && str(p.title.id) ? { id: str(p.title.id) } : null;
  const lineup = (Array.isArray(p.lineup) ? p.lineup : []).filter(isObj).slice(0, MAX_LINEUP).map((u) => {
    // ids only — the tile position (row/col) is replay detail, not a statistic; items kept (配发装备统计); a 自选
    // pick and a 补位 stand-in kept too, or the replayed card would draw the plain operator
    const e = {
      id: str(u.id) || '', golden: bool(u.golden), tier: int(u.tier, 0),
      items: (Array.isArray(u.items) ? u.items : []).filter((i) => typeof i === 'string' && i.length).slice(0, MAX_ITEMS).map((i) => i.slice(0, 64)),
    };
    if (u.kind === 'token') e.kind = 'token';
    if (isObj(u.diy) && str(u.diy.charId)) {
      e.diy = { charId: str(u.diy.charId), skillIndex: Number.isInteger(u.diy.skillIndex) ? u.diy.skillIndex : 0, uniEquipId: str(u.diy.uniEquipId) };
    }
    if (str(u.standInFor)) e.standInFor = str(u.standInFor);
    return e;
  }).filter((u) => u.id);
  const bonds = (Array.isArray(p.bonds) ? p.bonds : []).filter(isObj).slice(0, MAX_BONDS).map((b) => ({
    bondId: str(b.bondId) || str(b.id) || '', layers: int(b.layers, 0), active: bool(b.active),
  })).filter((b) => b.bondId);
  return {
    playerId: str(p.playerId) || '',
    seat: int(p.seat, 0),
    name: str(p.name, MAX_NAME) || '',
    isBot: bool(p.isBot),
    left: bool(p.left),
    alive: bool(p.alive, true),
    victory: bool(p.victory), // server semantics: team won AND this player was still in at the end
    roundsPassed: quit ? num(p.roundsPassed) : int(p.roundsPassed, 0),
    eliminatedRound: num(p.eliminatedRound),
    lp: num(p.lp),
    bandId: str(p.bandId),
    title,
    trophies: int(p.trophies, 0),
    reward: int(p.reward, 0),
    // the ACTUAL knock-outs this player was credited with (PR #509: summons / traps credit their owner). A v1 record
    // has none — absent, never guessed from the wave counter.
    ...(Number.isInteger(p.creditedKills) && p.creditedKills >= 0 && p.creditedKills <= 1e9 ? { creditedKills: p.creditedKills } : {}),
    // a compacted row names the bonds it used (PR #509: the peak-bond record is found after compaction)
    ...(Array.isArray(p.usedBondIds)
      ? { usedBondIds: p.usedBondIds.filter((id) => typeof id === 'string' && id.length).slice(0, MAX_BONDS).map((id) => id.slice(0, 64)) }
      : {}),
    lineup,
    bonds,
    stats: normalizeStatBlock(p.stats),
  };
}

/**
 * Normalize ONE match record to the current shape (a strict schema: missing fields get defaults, unknown ones are
 * dropped, every string / list is bounded). A record without an `end` is a settled one — the PR #323 build, which
 * never recorded anything else, wrote none.
 * @param {any} raw
 * @returns {any|null} null when the row is not salvageable (no usable player row at all)
 */
/** A room's visual set hash (`vs`, the cosmetic plugins its host chose): 64 lowercase hex, else null. */
export const vsOf = (v) => (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v : null);

/**
 * The content set a record played (DESIGN 32): `{ cs, plugins: ['id@version'] }`, or null for the original game.
 * A cosmetic-only match passes `vanilla: true` and is the original game's (the owner's decision of 2026-10-13).
 */
export function contentOf(c) {
  if (!isObj(c) || c.vanilla === true || !vsOf(c.cs)) return null;
  const list = (Array.isArray(c.plugins) ? c.plugins : [])
    .map((p) => (typeof p === 'string' ? p : isObj(p) && typeof p.id === 'string'
      ? `${p.id}@${typeof p.version === 'string' ? p.version : '?'}` : null))
    .filter((x) => typeof x === 'string' && x.length && x.length <= 80).slice(0, 32);
  return { cs: c.cs, plugins: list };
}

export function normalizeRecord(raw) {
  const r = isObj(raw) ? raw : {};
  // a record IS a played match — no usable players array, no record
  if (!Array.isArray(r.players)) return null;
  const quit = r.end === 'quit';
  const players = r.players.filter(isObj).slice(0, MAX_PLAYERS).map((p) => normalizePlayerRow(p, quit));
  if (!players.length) return null;
  const rec = {
    id: str(r.id),
    v: STATS_VERSION,
    t: int(r.t, 0),
    end: quit ? 'quit' : 'settled',
    victory: bool(r.victory),
    roundsPassed: quit ? num(r.roundsPassed) : int(r.roundsPassed, 0),
    lastRound: num(r.lastRound),
    hiddenReached: bool(r.hiddenReached),
    hiddenCleared: bool(r.hiddenCleared),
    reason: str(r.reason, 32),
    modeId: str(r.modeId),
    difficulty: str(r.difficulty, 24),
    stageId: str(r.stageId),
    bossId: str(r.bossId),
    hiddenBossId: str(r.hiddenBossId),
    seed: num(r.seed),
    durationMs: num(r.durationMs),
    teamLp: num(r.teamLp),
    roomMode: r.roomMode === 'solo' || r.roomMode === 'coop' ? r.roomMode : null,
    selfId: str(r.selfId),
    // the art the match played with (cosmetic plugins only; null = the original game)
    vs: vsOf(r.vs),
    // the content set (gameplay plugins) it played with, or null
    content: contentOf(r.content),
    players,
  };
  if (r.compact === true) rec.compact = true;
  // an id-less (hand-made) record gets a content id, so both copies of it land on the same key
  if (!rec.id) rec.id = `c.${fnv1a(JSON.stringify({ ...rec, vs: undefined }))}`;
  return rec;
}

/**
 * The MIGRATIONS chain: `MIGRATIONS[v]` upgrades a v-envelope to v+1, for v = STATS_VERSION and down.
 * Empty at v1 — the steps exist so the next format change lands as one function here and every stored /
 * imported envelope walks the whole chain.
 * @type {Record<number, (stats: any) => any>}
 */
export const MIGRATIONS = {
  // v1 → v2 (PR #509): a v1 row has no `creditedKills` — the real knock-out total is unknown, not the wave counter —
  // and nothing else changes. Bumping the version keeps an older build from stripping what a newer one writes.
  1: (stats) => ({ v: 2, records: (Array.isArray(stats.records) ? stats.records : []).map((r) => (isObj(r) ? { ...r } : r)) }),
};

/** Newest first (the stored order): by time, then id. */
export const newestFirst = (a, b) => (b.t - a.t) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Bring any stored / imported envelope to the current version.
 * @param {any} raw
 * @returns {{ stats: { v: number, records: any[] }, changed: boolean, newer: boolean, dropped: number }}
 *   `newer` = the data was written by a NEWER build: returned untouched, callers must not save over it.
 *   `dropped` = rows that were not salvageable, repeated a record or went beyond MAX_RECORDS: gone from `stats`.
 */
export function migrateStats(raw) {
  if (!isObj(raw) || !Array.isArray(raw.records)) return { stats: emptyStats(), changed: false, newer: false, dropped: 0 };
  if ((raw.v ?? 0) > STATS_VERSION) {
    return { stats: { v: raw.v, records: raw.records }, changed: false, newer: true, dropped: 0 };
  }
  let v = Number.isFinite(raw.v) ? raw.v : 0;
  let records = raw.records;
  let changed = v !== STATS_VERSION;
  while (v < STATS_VERSION) {
    const step = MIGRATIONS[v];
    if (typeof step === 'function') records = step({ v, records }).records;
    v++;
  }
  // a hand-edited / merged list can be oversized, unsorted or repeat a record: only the newest MAX_RECORDS survive, newest first
  const normalized = [];
  const seen = new Set(); // a record listed twice (hand-merged data) counts once: the first copy
  for (const r of records) {
    const rec = normalizeRecord(r);
    if (rec && !seen.has(rec.id)) { seen.add(rec.id); normalized.push(rec); }
  }
  normalized.sort(newestFirst);
  const kept = normalized.slice(0, MAX_RECORDS);
  const dropped = records.length - kept.length;
  // storage is rewritten (self-healed) when a row went, the order changed or an id-less row got its content id
  changed ||= dropped > 0 || kept.some((rec, i) => !isObj(records[i]) || rec.id !== records[i].id);
  return { stats: { v: STATS_VERSION, records: kept }, changed, newer: false, dropped };
}

const COMPACT_FRAME = ['id', 'v', 't', 'end', 'victory', 'roundsPassed', 'lastRound', 'hiddenReached', 'hiddenCleared', 'reason', 'modeId',
  'difficulty', 'roomMode', 'durationMs', 'selfId', 'vs', 'content'];

/**
 * The compact form of a record: the frame and the player's OWN row without lineup, bonds and name — everything the
 * aggregates and the history list read, nothing a replay needs. Teammates are gone. Idempotent.
 * @param {any} rec a normalized record
 * @returns {any}
 */
/**
 * The bond ids a player used in a settlement (PR #509): the compacted row's `usedBondIds`, else the active bonds.
 * Capped like every other bond list (MAX_BONDS, ids ≤ 64 chars, de-duplicated).
 * @param {any} player
 * @returns {string[]}
 */
export function usedBondIdsOf(player) {
  const ids = Array.isArray(player?.usedBondIds) ? player.usedBondIds
    : (Array.isArray(player?.bonds) ? player.bonds : []).filter((b) => b?.active === true).map((b) => b.bondId);
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.length).map((id) => id.slice(0, 64)))].slice(0, MAX_BONDS);
}

export function compactRecord(rec) {
  const self = selfRowOf(rec);
  // PR #509: the peak (highest active bond layers) record keeps its full rows, and a compacted row still names the
  // bonds it used so the peak can be found after compaction.
  const usedBondIds = usedBondIdsOf(self);
  const out = {};
  for (const k of COMPACT_FRAME) if (rec[k] != null) out[k] = rec[k];
  out.compact = true;
  out.players = self ? [{
    playerId: self.playerId, seat: self.seat, alive: self.alive, victory: self.victory, roundsPassed: self.roundsPassed,
    eliminatedRound: self.eliminatedRound, bandId: self.bandId, title: self.title, left: self.left, stats: self.stats,
    // The settlement's own earnings survive compaction: the official settle flow sums `reward` (the LV bar) and
    // `trophies` (the plate) over every kept record (PR #698).
    trophies: self.trophies, reward: self.reward,
    ...(self.creditedKills != null ? { creditedKills: self.creditedKills } : {}),
    ...(usedBondIds.length ? { usedBondIds } : {}),
  }] : [];
  return out;
}

/**
 * The id of the record whose self row has the highest ACTIVE bond layers (PR #509): `fitToBudget` keeps that one's full
 * rows past the FULL_KEEP window, so the peak lineup and equipment survive compaction.
 * @param {any[]} records
 * @returns {string|null}
 */
function peakBondId(records) {
  let bestId = null;
  let best = 0;
  for (const rec of records) {
    if (!rec || rec.end === 'quit' || rec.compact) continue;
    const self = selfRowOf(rec);
    for (const b of self?.bonds || []) {
      if (!b || !b.active || !Number.isFinite(b.layers) || b.layers <= 0) continue;
      if (b.layers > best) { best = b.layers; bestId = rec.id; }
    }
  }
  return bestId;
}

/**
 * What goes to storage: the newest FULL_KEEP records as they are, older ones compacted, then the oldest dropped until
 * the JSON fits `maxChars` (the newest record is always kept).
 * @param {any[]} records newest first
 * @param {number} [maxChars]
 * @returns {any[]}
 */
export function fitToBudget(records, maxChars = MAX_CHARS) {
  const kept = [];
  let used = 40; // the envelope itself
  const peakId = peakBondId(records.slice(0, MAX_RECORDS));
  records.slice(0, MAX_RECORDS).forEach((r, i) => {
    const rec = i < FULL_KEEP || r.id === peakId ? r : compactRecord(r);
    const n = JSON.stringify(rec).length + 1;
    if (kept.length && used + n > maxChars) return;
    used += n;
    kept.push(rec);
  });
  return kept;
}

/**
 * Derive the room shape ('solo' | 'coop') the way constants.js modeIdFor builds modeIds.
 * @param {string|null|undefined} modeId
 * @param {string|null|undefined} roomMode room.state `mode` when known
 * @returns {'solo'|'coop'|null}
 */
export function roomModeOf(modeId, roomMode) {
  if (roomMode === 'solo' || roomMode === 'coop') return roomMode;
  if (typeof modeId !== 'string') return null;
  if (modeId.includes('_single_')) return 'solo';
  if (modeId.includes('_multi_')) return 'coop';
  return null;
}

/**
 * Build one settled record from a raw m.result payload (+ context). Null when there is nothing to store: payloads
 * without players (the error-path settlement) or matches the local player did not take part in (spectator
 * seats get every result pushed too — eliminated players, who ARE in players[], keep recording).
 * @param {any} res raw m.result payload
 * @param {{ myId?: string|null, roomMode?: string|null, now?: number, vs?: string|null, content?: any }} ctx
 * @returns {any|null}
 */
export function buildRecord(res, ctx = {}) {
  const r = isObj(res) ? res : {};
  if (!Array.isArray(r.players) || !r.players.length) return null;
  const myId = str(ctx.myId);
  const selfRow = r.players.find((p) => isObj(p) && p.playerId === myId);
  if (!selfRow) return null; // spectator / observer: not my match
  return normalizeRecord({
    v: STATS_VERSION,
    t: int(ctx.now, 0),
    id: recordId(r, myId),
    end: 'settled',
    victory: bool(r.victory),
    roundsPassed: int(r.roundsPassed, 0),
    lastRound: num(r.lastRound),
    hiddenReached: bool(r.hiddenReached),
    hiddenCleared: bool(r.hiddenCleared),
    reason: str(r.reason),
    modeId: str(r.modeId),
    difficulty: str(r.difficulty),
    stageId: str(r.stageId),
    bossId: str(r.bossId),
    hiddenBossId: str(r.hiddenBossId),
    seed: num(r.seed),
    durationMs: num(r.durationMs),
    teamLp: num(r.teamLp),
    roomMode: roomModeOf(str(r.modeId), ctx.roomMode),
    selfId: myId,
    vs: vsOf(ctx.vs),
    content: contentOf(ctx.content),
    players: r.players,
  });
}

/**
 * The m.result-shaped payload behind a settled record — the inverse of buildRecord. The stats page's history
 * rows hand this to the settlement view (screens/result.js reads it through normalizeResult): a finished match can be
 * RE-VIEWED because the record kept every field the payload had. Whatever a record never stored is simply absent and
 * normalizeResult defaults it, exactly like a tolerant live payload. A quit record (nothing was settled) and a
 * compacted one (its rows are gone) have no settlement to show.
 * @param {any} rec
 * @returns {any|null} null when the row is not a usable, full, settled record
 */
export function recordToResult(rec) {
  const r = normalizeRecord(rec);
  if (!r || r.end === 'quit' || r.compact) return null;
  const res = {
    victory: r.victory,
    roundsPassed: r.roundsPassed,
    hiddenReached: r.hiddenReached,
    hiddenCleared: r.hiddenCleared,
    reason: r.reason,
    modeId: r.modeId,
    difficulty: r.difficulty,
    bossId: r.bossId,
    hiddenBossId: r.hiddenBossId,
    seed: r.seed,
    durationMs: r.durationMs,
    teamLp: r.teamLp,
    players: r.players,
  };
  if (Number.isFinite(r.lastRound)) res.lastRound = r.lastRound;
  return res;
}

/**
 * Append one record: replays (same content id) are dropped, newest first, capped at MAX_RECORDS.
 * @param {{ v: number, records: any[] }} stats
 * @param {any} record
 * @returns {{ stats: { v: number, records: any[] }, added: boolean }}
 */
export function appendRecord(stats, record) {
  if (!record || !record.id) return { stats, added: false };
  if (stats.records.some((r) => r.id === record.id)) return { stats, added: false };
  const records = [record, ...stats.records].slice(0, MAX_RECORDS);
  return { stats: { v: STATS_VERSION, records }, added: true };
}

/**
 * Merge two envelopes (import into existing): union by record id, newest first, capped.
 * @param {{ records: any[] }} a current (wins ties)
 * @param {{ records: any[] }} b incoming
 * @returns {{ v: number, records: any[] }}
 */
export function mergeStats(a, b) {
  const byId = new Map();
  for (const r of [...(Array.isArray(b?.records) ? b.records : []), ...(Array.isArray(a?.records) ? a.records : [])]) {
    const rec = normalizeRecord(r);
    if (rec) byId.set(rec.id, rec);
  }
  const records = [...byId.values()].sort(newestFirst).slice(0, MAX_RECORDS);
  return { v: STATS_VERSION, records };
}

/**
 * Parse + migrate + merge an exported / pasted payload into the current data.
 * @param {any} raw parsed JSON of the imported file
 * @param {{ records: any[] }} current current envelope
 * @returns {{ stats: { v: number, records: any[] }, added: number, skipped: number, dropped: number }}
 *   added = records new to this device; skipped = duplicates of records it has; dropped = rows of the file that could
 *   not be read
 */
export function importStats(raw, current) {
  if (isObj(raw) && raw.kind != null && raw.kind !== 'local-stats') {
    const err = new Error('not a stats export'); // the page shows its own text
    Object.assign(err, { code: 'stats-bad-file' });
    throw err;
  }
  if (!isObj(raw) || !Array.isArray(raw.records)) {
    const err = new Error('not a stats export');
    Object.assign(err, { code: 'stats-bad-file' });
    throw err;
  }
  const { stats: incoming, newer, dropped } = migrateStats(raw);
  if (newer) {
    const err = new Error('exported by a newer client'); // the page shows its own text
    Object.assign(err, { code: 'stats-newer-version' });
    throw err;
  }
  const have = new Set((Array.isArray(current?.records) ? current.records : []).map((r) => r.id));
  const merged = mergeStats(current, incoming);
  const added = incoming.records.filter((r) => !have.has(r.id)).length;
  return { stats: merged, added, skipped: incoming.records.length - added, dropped };
}

/**
 * The payload the export button downloads (envelope + a little provenance).
 * @param {{ records: any[] }} stats
 * @returns {{ app: string, kind: string, v: number, exportedAt: string, records: any[] }}
 */
export function exportStats(stats) {
  return {
    app: 'stronghold-protocol',
    kind: 'local-stats',
    v: STATS_VERSION,
    exportedAt: new Date().toISOString(),
    records: fitToBudget(Array.isArray(stats?.records) ? stats.records : []),
  };
}

// ---- aggregation (what the page shows; records may hold more than any view uses) ------------------------------------

const SELF_STATS = ['dmgDealt', 'kills', 'bossDamage', 'activatedLayers', 'merges', 'itemsEquipped', 'gold', 'perfectRounds', 'refreshes', 'leaks', 'lpLost'];

/**
 * The row that "is me" in a record: selfId, else the only human, else seat 0 — records written by
 * recordResult always have selfId; the fallbacks only serve imported / hand-made data.
 * @param {any} rec
 * @returns {any|null}
 */
export function selfRowOf(rec) {
  const ps = Array.isArray(rec?.players) ? rec.players : [];
  return ps.find((p) => p.playerId && p.playerId === rec.selfId)
    || ps.find((p) => !p.isBot)
    || ps[0]
    || null;
}

/** Whether this record counts as a win for its self player (per-row victory = team won AND still in). */
const selfWon = (rec, self) => (self ? !!self.victory : !!rec.victory);

/**
 * The rounds the player passed in a record: its own row's (the table the settlement prints per player), else the
 * team's; 0 when the record does not know.
 * @param {any} rec
 */
export function roundsOf(rec) {
  const self = selfRowOf(rec);
  const v = self && Number.isFinite(self.roundsPassed) ? self.roundsPassed : rec?.roundsPassed;
  return Number.isFinite(v) ? v : 0;
}

/**
 * Whether a record enters the aggregates (see the header). A settled record always does. A quit record does once the
 * player had finished at least one battle: cleared a round, or was already eliminated; a match given up before that —
 * entered and left right away — is history only.
 * @param {any} rec a normalized record
 * @returns {boolean}
 */
export function countsTowardStats(rec) {
  if (!isObj(rec)) return false;
  if (rec.end !== 'quit') return true;
  const self = selfRowOf(rec);
  if (!self) return false;
  return self.alive === false || (Number.isFinite(self.roundsPassed) && self.roundsPassed >= 1);
}

/**
 * Aggregate records for the stats page — over the records that count; `total` / `excluded` say how many did not.
 * Everything is keyed by ids (bandId / titleId / difficulty); the page maps them to names and icons through the game
 * data. The combat totals read the settled records' stat blocks (a quit record has none).
 * @param {any[]} records
 * @returns {any}
 */
export function aggregateStats(records, { modded = false } = {}) {
  const all = Array.isArray(records) ? records : [];
  const counted = all.filter(countsTowardStats);
  const mod = counted.filter((r) => !!r.content);
  const rs = modded ? counted : counted.filter((r) => !r.content);
  const out = {
    // the content-modded matches left out of the overview (0 when they are counted)
    modded: modded ? 0 : mod.length,
    total: all.length, count: rs.length, excluded: all.length - rs.length, wins: 0,
    rounds: { total: 0, max: 0 },
    duration: { totalMs: 0 },
    hidden: { reached: 0, cleared: 0 },
    byDifficulty: {},
    // per-mode rows (PR #509): the overview prints games / wins / hidden clears for each mode
    byMode: { solo: { games: 0, wins: 0, hiddenCleared: 0 }, coop: { games: 0, wins: 0, hiddenCleared: 0 } },
    // trophies actually awarded at a settled co-op settlement (the profile medal); solo has none
    trophies: 0,
    titles: {}, bands: {}, sums: {},
    // how many settled matches each bond was active in (the 盟约 tab's "most used")
    bonds: Object.create(null),
    // single-match maxima of the SELF row (PR #509): the highest funds / promotions / ACTUAL kills in one match —
    // `kills` is the credited knock-outs, not the wave-owned cumulative counter (`sums.kills`), and null when a record
    // never knew them (a migrated v1 row).
    maxima: { gold: null, merges: null, kills: null },
  };
  for (const rec of rs) {
    const self = selfRowOf(rec);
    // a quit record is partial data: it may count as a game, but it never sets a whole-match maximum (PR #509)
    if (rec.end !== 'quit') {
      const values = { gold: self?.stats?.gold, merges: self?.stats?.merges, kills: self?.creditedKills };
      for (const [key, value] of Object.entries(values)) {
        if (Number.isFinite(value) && value >= 0) out.maxima[key] = Math.max(out.maxima[key] ?? 0, value);
      }
    }
    const won = selfWon(rec, self);
    if (won) out.wins++;
    const rounds = roundsOf(rec);
    out.rounds.total += rounds;
    out.rounds.max = Math.max(out.rounds.max, rounds);
    out.duration.totalMs += num(rec.durationMs) || 0;
    if (rec.hiddenReached) out.hidden.reached++;
    if (rec.hiddenCleared) out.hidden.cleared++;

    const d = rec.difficulty || 'UNKNOWN';
    const bd = (out.byDifficulty[d] ||= { games: 0, wins: 0, hiddenCleared: 0 });
    bd.games++;
    if (won) bd.wins++;
    if (rec.hiddenCleared) bd.hiddenCleared++;

    if (rec.roomMode === 'solo' || rec.roomMode === 'coop') {
      const mode = out.byMode[rec.roomMode];
      mode.games++;
      if (won) mode.wins++;
      if (won && rec.hiddenCleared) mode.hiddenCleared++;
    }

    const titleId = self?.title?.id;
    if (titleId) {
      const t = (out.titles[titleId] ||= { count: 0 });
      t.count++;
    }

    // the settlement's actual award (a quit has none, and only a co-op room pays trophies)
    if (rec.end !== 'quit' && rec.roomMode === 'coop' && Number.isFinite(self?.trophies)) out.trophies += Math.max(0, self.trophies);

    // usage = active in the self player's settlement, once per match irrespective of layers
    if (rec.end !== 'quit') {
      for (const id of usedBondIdsOf(self)) (out.bonds[id] ||= { games: 0 }).games++;
    }

    const bandId = self?.bandId;
    if (bandId) {
      const b = (out.bands[bandId] ||= { games: 0, wins: 0 });
      b.games++;
      if (won) b.wins++;
    }

    if (rec.end !== 'quit' && self && isObj(self.stats)) {
      for (const k of SELF_STATS) {
        const v = self.stats[k];
        if (Number.isFinite(v)) out.sums[k] = (out.sums[k] || 0) + v;
      }
    }
  }
  return out;
}
