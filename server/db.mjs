// server/db.mjs — the accounts / matchmaking persistence, on the BUILT-IN SQLite (node:sqlite, no dependency).
//
// The database file must NOT live under `data/`: server/index.js serves that directory publicly. It defaults to
// `<repo>/var/accounts.db` (SP_DB overrides), and `var/` is git-ignored. Schema versioning goes through
// `PRAGMA user_version`; `migrate()` applies each step in order.
//
// API: `openDb(file)` → a `DatabaseSync` with the schema applied. The statement helpers live in server/auth.js
// (accounts/sessions) so this module stays a thin, swappable storage layer.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA_VERSION = 1;

/**
 * `node:sqlite` is experimental and prints an ExperimentalWarning on import; suppress just that one (it is expected).
 * @returns {Promise<{ DatabaseSync: new (path: string) => any }>}
 */
async function loadSqlite() {
  const orig = process.emitWarning;
  process.emitWarning = (warning, ...rest) => {
    const msg = typeof warning === 'string' ? warning : (warning?.message || '');
    if (/sqlite/i.test(msg)) return;
    return orig.call(process, warning, ...rest);
  };
  try { return await import('node:sqlite'); } finally { process.emitWarning = orig; }
}

const sqlite = await loadSqlite();
/** @type {new (path: string) => any} */
export const DatabaseSync = sqlite.DatabaseSync;

/** Apply pending migrations. */
function migrate(db) {
  const row = db.prepare('PRAGMA user_version').get();
  const v = Number(row?.user_version || 0);
  if (v < 1) {
    db.exec(`
      CREATE TABLE accounts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        name_lower TEXT    NOT NULL UNIQUE,
        pass_hash  TEXT    NOT NULL,
        created_at INTEGER NOT NULL,
        last_login INTEGER,
        banned     INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE sessions (
        token      TEXT    PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX idx_sessions_account ON sessions(account_id);
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);
    `);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
}

/**
 * Open (creating if needed) the accounts database and bring the schema up to date.
 * @param {string} file absolute path of the .db file
 * @returns {any} the DatabaseSync connection
 */
export function openDb(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000; PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

/**
 * An in-memory database (tests): schema only, nothing on disk.
 * @returns {any}
 */
export function openMemoryDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}
