// server/training/store.js — the bot-rehearsal sample store (`var/training.db`).
//
// WHY A SEPARATE FILE. The account DB (`var/accounts.db`) is small, backed up and hot on every request; training samples
// are append-only, machine-local and pruned by age. Keeping them in their own SQLite file means retention is "delete
// rows + VACUUM this file", a corrupt file is deleted and recreated without touching accounts, and backups stay small.
//
// WHAT IT HOLDS. One row per SERVER-RUN bot rehearsal (the only ones with trustworthy labels: the browser side of a
// delegated rehearsal returns an index only, never scores). `candidates` is the JSON array of `{ i, leaks, kills,
// score }` the shared rehearsal scored, plus the layout hash per candidate; `state` is a compact digest of the bot's
// prep. No player identifiers are stored (a bot seat number only).
//
// SAFETY. Recording is best-effort: a failed write (or a full disk) never touches a match. Flushes are batched and
// transactional; a free-space guard stops sampling before the disk is at risk. `SP_TRAINING=off` (or no file) turns the
// whole thing into a no-op.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Stop sampling when the filesystem holding the DB has less than this much free (never starve the game). */
export const TRAINING_MIN_FREE_BYTES = 2 * 1024 ** 3;
/** Rows accumulated before a flush (the recorder is called from the match loop; batch the writes). */
const FLUSH_EVERY = 16;

const SCHEMA_VERSION = 1;

/**
 * @param {{ file: string, now?: () => number, log?: { warn?: Function, info?: Function },
 *   minFreeBytes?: number, flushEvery?: number }} opts
 */
export class TrainingStore {
  constructor({ file, now = Date.now, log = console, minFreeBytes = TRAINING_MIN_FREE_BYTES, flushEvery = FLUSH_EVERY }) {
    this.file = file;
    this.now = now;
    this.log = log;
    this.minFreeBytes = minFreeBytes;
    this.flushEvery = flushEvery;
    this.db = null;
    this.queue = [];
    this.counters = { recorded: 0, written: 0, dropped: 0, flushed: 0 };
    this.lastError = null;
  }

  /** Open (creating the directory / schema as needed). Returns false when the DB cannot be opened. */
  open() {
    if (this.db) return true;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      this.db = new DatabaseSync(this.file);
      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec('PRAGMA synchronous = NORMAL');
      const v = Number(this.db.prepare('PRAGMA user_version').get()?.user_version || 0);
      if (v < SCHEMA_VERSION) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS bot_training (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            at         INTEGER NOT NULL,
            mode       TEXT,
            difficulty TEXT,
            stage      TEXT,
            round      INTEGER,
            seat       INTEGER,
            seed       TEXT,
            state      TEXT,
            candidates TEXT NOT NULL,
            chosen     INTEGER,
            source     TEXT
          );
          CREATE INDEX IF NOT EXISTS bot_training_at ON bot_training(at);
        `);
        this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      }
      this.stmt = this.db.prepare(
        'INSERT INTO bot_training (at, mode, difficulty, stage, round, seat, seed, state, candidates, chosen, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      return true;
    } catch (e) {
      this.lastError = e;
      this.log.warn?.(`[training] cannot open ${this.file}: ${e?.message || e}`);
      this.db = null;
      return false;
    }
  }

  /** Free bytes on the DB's filesystem (0 when unknown: the guard then lets the write through). */
  freeBytes() {
    try {
      const s = fs.statfsSync(path.dirname(this.file));
      return Number(s.bavail) * Number(s.bsize);
    } catch { return 0; }
  }

  /**
   * Queue one rehearsal sample. `row` = `{ at?, mode, difficulty, stage, round, seat, seed, state, candidates, chosen,
   * source }`; `candidates` is stringified here. Returns false when the row was dropped.
   */
  record(row) {
    if (!this.db && !this.open()) { this.counters.dropped++; return false; }
    const free = this.freeBytes();
    if (free > 0 && free < this.minFreeBytes) { this.counters.dropped++; return false; }
    try {
      this.queue.push([
        Number(row.at) || this.now(), String(row.mode ?? ''), String(row.difficulty ?? ''), String(row.stage ?? ''),
        Number(row.round) || 0, Number(row.seat) || 0, String(row.seed ?? ''),
        row.state ? JSON.stringify(row.state) : null, JSON.stringify(row.candidates || []),
        Number.isInteger(row.chosen) ? row.chosen : null, String(row.source ?? 'server'),
      ]);
      this.counters.recorded++;
      if (this.queue.length >= this.flushEvery) this.flush();
      return true;
    } catch (e) {
      this.lastError = e;
      this.counters.dropped++;
      return false;
    }
  }

  /** Write the queued rows in one transaction. Never throws. */
  flush() {
    if (!this.db || !this.queue.length) return 0;
    const batch = this.queue.splice(0);
    try {
      this.db.exec('BEGIN');
      for (const r of batch) this.stmt.run(...r);
      this.db.exec('COMMIT');
      this.counters.written += batch.length;
      this.counters.flushed++;
      return batch.length;
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch { /* the transaction may already be gone */ }
      this.lastError = e;
      this.counters.dropped += batch.length;
      this.log.warn?.(`[training] write failed (${batch.length} rows dropped): ${e?.message || e}`);
      return 0;
    }
  }

  /** Row count (a cheap `COUNT(*)`; null when closed). */
  rows() {
    try { return Number(this.db?.prepare('SELECT COUNT(*) AS n FROM bot_training').get()?.n ?? 0); } catch { return null; }
  }

  stats() {
    return { file: this.file, open: !!this.db, queued: this.queue.length, rows: this.rows(), ...this.counters };
  }

  close() {
    this.flush();
    try { this.db?.close(); } catch { /* already closed */ }
    this.db = null;
  }
}
