// server/stats.js — match statistics over the accounts SQLite (server/db.mjs schema v5, docs/MATCHMAKING.md §39).
//
// Every finished match the client recorded (public/js/ui/stats.js) is submitted here as ONE normalized record
// (`shared/stats.js normalizeRecord`, the same strict schema the page renders) and stored on `match_stats`, bound to
// an OWNER: a registered player's `account_id`, or a guest's `guest_id` — the session's `playerId`, the identity the
// repo already assigns a guest session (server/net.js Session; the client persists the reconnect token, so it survives
// a reload / reconnect for the reconnect window). Exactly one of the two keys is set. The record's own dedupe id
// (`recordId`, unique per owner) makes a replayed / re-sent submit a no-op.
//
// Storage is bounded exactly like the client's localStorage, per owner, and OURS = 2 × the mainline caps
// (shared/constants.js STATS_*): keep the newest STATS_MAX_RECORDS rows; keep FULL rows (lineups / bonds / teammates)
// only for the newest STATS_FULL_KEEP — older rows are compacted to the player's own summary (`compactRecord`) — and
// stay under STATS_MAX_CHARS of payload JSON, dropping the oldest first (the newest row is always kept).
//
// Identity + privacy: the row holds no account id in its payload and no session secret; `list` is per owner. The
// social read (`stats.view`) is resolved by the lobby to another owner and returns only the public in-game record
// fields the page already renders — never an account id / email / token. All methods are synchronous (like
// AuthService / CommunityService).

import { normalizeRecord, compactRecord } from '../shared/stats.js';
import { STATS_MAX_RECORDS, STATS_FULL_KEEP, STATS_MAX_CHARS } from '../shared/constants.js';

/**
 * Match records over a server/db.mjs connection. One prepared statement set, per-owner queries.
 */
export class StatsService {
  /**
   * @param {{ db: any, now?: () => number, maxRecords?: number, fullKeep?: number, maxChars?: number }} opts
   */
  constructor({ db, now = Date.now, maxRecords = STATS_MAX_RECORDS, fullKeep = STATS_FULL_KEEP, maxChars = STATS_MAX_CHARS }) {
    this.db = db;
    this.now = now;
    this.maxRecords = maxRecords;
    this.fullKeep = fullKeep;
    this.maxChars = maxChars;
    this.q = {
      insert: db.prepare(`INSERT OR IGNORE INTO match_stats
        (account_id, guest_id, record_id, mode, difficulty, seed, result, rounds, started_at, ended_at, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
      list: db.prepare('SELECT id, payload_json FROM match_stats WHERE account_id IS ? AND guest_id IS ? ORDER BY ended_at DESC, id DESC LIMIT ?'),
      count: db.prepare('SELECT COUNT(*) AS n FROM match_stats WHERE account_id IS ? AND guest_id IS ?'),
      chars: db.prepare('SELECT COALESCE(SUM(LENGTH(payload_json)), 0) AS n FROM match_stats WHERE account_id IS ? AND guest_id IS ?'),
      older: db.prepare('SELECT id, payload_json FROM match_stats WHERE account_id IS ? AND guest_id IS ? ORDER BY ended_at DESC, id DESC LIMIT -1 OFFSET ?'),
      setPayload: db.prepare('UPDATE match_stats SET payload_json = ? WHERE id = ?'),
      trimCount: db.prepare('DELETE FROM match_stats WHERE id IN (SELECT id FROM match_stats WHERE account_id IS ? AND guest_id IS ? ORDER BY ended_at DESC, id DESC LIMIT -1 OFFSET ?)'),
      oldest: db.prepare('SELECT id FROM match_stats WHERE account_id IS ? AND guest_id IS ? ORDER BY ended_at ASC, id ASC LIMIT 1'),
      deleteById: db.prepare('DELETE FROM match_stats WHERE id = ?'),
      deleteOwner: db.prepare('DELETE FROM match_stats WHERE account_id IS ? AND guest_id IS ?'),
    };
  }

  /** Exactly one owner key must be present: `{ accountId, guestId }` with the other null, else null. */
  _owner(accountId, guestId) {
    const acc = Number.isInteger(accountId) && accountId > 0 ? accountId : null;
    const guest = typeof guestId === 'string' && guestId.length > 0 ? guestId : null;
    if ((acc == null) === (guest == null)) return null; // both set or neither: not an owner
    return { accountId: acc, guestId: guest };
  }

  /** @returns {any|null} the parsed payload, or null when the row's JSON is unreadable. */
  _parse(json) {
    try { const rec = JSON.parse(json); return rec && typeof rec === 'object' ? rec : null; } catch { return null; }
  }

  /** The rows stored for an owner. @returns {number} */
  count({ accountId = null, guestId = null } = {}) {
    const owner = this._owner(accountId, guestId);
    if (!owner) return 0;
    return Number(this.q.count.get(owner.accountId, owner.guestId)?.n || 0);
  }

  /** The payload JSON characters stored for an owner. @returns {number} */
  chars({ accountId = null, guestId = null } = {}) {
    const owner = this._owner(accountId, guestId);
    if (!owner) return 0;
    return Number(this.q.chars.get(owner.accountId, owner.guestId)?.n || 0);
  }

  /**
   * Store one record for an owner. The record is normalized first (a strict schema; an unsalvageable one is refused),
   * deduped by its own id with `INSERT OR IGNORE`, and the owner's rows are pruned back to the caps.
   * @param {{ accountId?: number|null, guestId?: string|null, record?: unknown }} input
   * @returns {{ ok: true, id: number, deduped: boolean } | { error: string }}
   */
  submit({ accountId = null, guestId = null, record } = {}) {
    const owner = this._owner(accountId, guestId);
    if (!owner) return { error: 'BAD_STATS' };
    const rec = normalizeRecord(record);
    if (!rec || !rec.id) return { error: 'BAD_STATS' };
    const now = this.now();
    const ended = Number.isFinite(rec.t) && rec.t > 0 ? rec.t : now;
    const started = Number.isFinite(rec.durationMs) ? Math.max(0, ended - rec.durationMs) : null;
    const result = rec.end === 'quit' ? 'quit' : (rec.victory ? 'win' : 'loss');
    const r = this.q.insert.run(
      owner.accountId, owner.guestId, rec.id, rec.modeId, rec.difficulty,
      Number.isFinite(rec.seed) ? rec.seed : null, result, Number.isFinite(rec.roundsPassed) ? rec.roundsPassed : null,
      started, ended, JSON.stringify(rec), now,
    );
    const inserted = Number(r.changes || 0) > 0;
    if (inserted) this._enforce(owner.accountId, owner.guestId);
    return { ok: true, id: Number(r.lastInsertRowid), deduped: !inserted };
  }

  /**
   * The owner's records, newest first, at most `limit` (capped at the per-owner cap). Parsed payloads (the page renders
   * them unchanged); an unreadable row is skipped, never thrown.
   * @param {{ accountId?: number|null, guestId?: string|null, limit?: number }} [opts]
   * @returns {Array<object>}
   */
  list({ accountId = null, guestId = null, limit = this.maxRecords } = {}) {
    const owner = this._owner(accountId, guestId);
    if (!owner) return [];
    const n = Math.max(1, Math.min(Number(limit) || this.maxRecords, this.maxRecords));
    return this.q.list.all(owner.accountId, owner.guestId, n)
      .map((row) => this._parse(row.payload_json))
      .filter(Boolean);
  }

  /** Delete every record of an owner. @returns {number} rows removed. */
  clear({ accountId = null, guestId = null } = {}) {
    const owner = this._owner(accountId, guestId);
    if (!owner) return 0;
    return Number(this.q.deleteOwner.run(owner.accountId, owner.guestId).changes || 0);
  }

  /**
   * Bring one owner back inside the caps (called after an insert): compact rows older than the newest `fullKeep`, drop
   * rows beyond `maxRecords`, then drop the oldest rows until the payload JSON fits `maxChars` (never the newest).
   */
  _enforce(accountId, guestId) {
    const a = accountId;
    const g = guestId;
    // 1) full rows only for the newest fullKeep — compact the older ones (idempotent: already-compact rows are skipped)
    for (const row of this.q.older.all(a, g, this.fullKeep)) {
      const rec = this._parse(row.payload_json);
      if (!rec || rec.compact === true) continue;
      this.q.setPayload.run(JSON.stringify(compactRecord(rec)), row.id);
    }
    // 2) the row cap: delete the oldest beyond maxRecords
    const n = Number(this.q.count.get(a, g)?.n || 0);
    if (n > this.maxRecords) this.q.trimCount.run(a, g, this.maxRecords);
    // 3) the character budget: drop the oldest one at a time (the newest is always kept)
    let guard = this.maxRecords + 4;
    while (guard-- > 0) {
      if (Number(this.q.count.get(a, g)?.n || 0) <= 1) break;
      if (Number(this.q.chars.get(a, g)?.n || 0) <= this.maxChars) break;
      const oldest = this.q.oldest.get(a, g);
      if (!oldest) break;
      this.q.deleteById.run(oldest.id);
    }
  }
}
