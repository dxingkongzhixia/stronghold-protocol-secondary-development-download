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

const SCHEMA_VERSION = 3;

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
  if (v >= SCHEMA_VERSION) return;
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
    db.exec('PRAGMA user_version = 1');
  }
  if (v < 2) {
    // The account role (shared/constants.js ROLES, server/auth.js): NULL for every account that predates it, and for
    // every ordinary account. `node tools/role.mjs` assigns one; it is shown next to the name in every screen.
    db.exec('ALTER TABLE accounts ADD COLUMN role TEXT');
    db.exec('PRAGMA user_version = 2');
  }
  if (v < 3) {
    // The lobby's community data (docs/MATCHMAKING.md §36, server/community.js):
    //   * changelog   — a persisted 更新日志, seeded once from CHANGELOG.md (version / date / title / markdown body);
    //   * bug_reports — player bug reports, TEXT only (title + body) plus optional images in bug_uploads;
    //   * bug_uploads — images on disk under `var/bug-uploads/` (path relative to it), one row per file. `report_id`
    //     is NULL until the report that references it is submitted; account_id is NULL for a guest.
    // account_id is the durable submitter link (ON DELETE SET NULL keeps a report after an account is removed); the
    // rate-limit / upload-ownership key stays in memory in CommunityService and never touches the database.
    db.exec(`
      CREATE TABLE changelog (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        version     TEXT    NOT NULL,
        released_at INTEGER,
        title       TEXT    NOT NULL,
        body        TEXT    NOT NULL DEFAULT '',
        published   INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX idx_changelog_order ON changelog(released_at DESC, id DESC);
      CREATE TABLE bug_reports (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT    NOT NULL,
        body       TEXT    NOT NULL DEFAULT '',
        account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
        submitter  TEXT,
        status     TEXT    NOT NULL DEFAULT 'new',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_bug_reports_status ON bug_reports(status);
      CREATE TABLE bug_uploads (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id  INTEGER REFERENCES bug_reports(id) ON DELETE CASCADE,
        path       TEXT    NOT NULL,
        mime       TEXT    NOT NULL,
        bytes      INTEGER NOT NULL,
        account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_bug_uploads_report ON bug_uploads(report_id);
    `);
    db.exec('PRAGMA user_version = 3');
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
