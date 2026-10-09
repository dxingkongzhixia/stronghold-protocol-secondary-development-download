// server/community.js — the lobby's community data on the accounts SQLite (server/db.mjs, docs/MATCHMAKING.md §36):
//
//   * the persisted 更新日志 (`changelog`): version / date / title / markdown body, seeded ONCE from the repo's own
//     CHANGELOG.md and readable by the lobby's 更新日志 panel (server/index.js `GET /community/api/changelog`);
//   * player bug reports (`bug_reports`): TEXT only — a title + a description. No replay / seed / room data.
//   * the report's images (`bug_uploads`): at most BUG_IMAGES_MAX raster files (png / jpeg / webp), written under the
//     service's `dir` (`<repo>/var/bug-uploads`, git-ignored and NEVER statically served) and streamed back only through
//     the token-gated /admin. The DB row keeps path + mime + byte count + uploader + time, nothing else.
//
// The real content type is sniffed from the BYTES (sniffImageType), never the filename or the Content-Type header —
// svg / html and anything else are refused. Every submission and every upload is rate limited per account, or per guest
// network key, in memory (the key never reaches the database).

import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  BUG_BODY_MAX, BUG_TITLE_MAX, BUG_IMAGES_MAX, BUG_IMAGE_MAX_BYTES, BUG_IMAGE_MIMES,
  BUG_RATE_WINDOW_MS, BUG_REPORT_LIMIT, BUG_UPLOAD_LIMIT, BUG_STATUSES, CHANGELOG_LIMIT, CHANGELOG_BODY_MAX,
} from '../shared/constants.js';

/** Control / bidi / lone-surrogate junk stripped from player text (a report is plain text). */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\ufeff]/g;
const LONE_SURR = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/**
 * Clean player text for storage: NFC, junk characters removed, whitespace collapsed (a single line for a title, real
 * newlines kept for a body, runs of blank lines collapsed). NO length cap — the caller validates the returned length.
 * @param {unknown} raw
 * @param {{ multiline?: boolean }} [opts]
 * @returns {string}
 */
export function sanitizeText(raw, { multiline = false } = {}) {
  if (typeof raw !== 'string') return '';
  let s = raw.normalize('NFC').replace(LONE_SURR, '').replace(CONTROL, '');
  s = multiline ? s.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  return s.trim();
}

/**
 * The raster type of a buffer from its magic bytes — `'image/png'`, `'image/jpeg'`, `'image/webp'`, or null.
 * Deliberately does not look at a filename or a header: svg / html / everything else is null.
 * @param {unknown} buf
 * @returns {string|null}
 */
export function sniffImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** The file extension of a sniffed mime (never from a filename). */
const EXT_OF = Object.freeze({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' });

/**
 * The admin list's ordering keys (server/community.js §36). `status` is the historical default — 未处理优先, then
 * 新→旧 — while `newest` / `oldest` sort purely by time. Only these keys ever reach the SQL ORDER BY (never a value
 * from the request).
 */
export const BUG_SORTS = Object.freeze(['status', 'newest', 'oldest']);
const BUG_ORDER = Object.freeze({
  status: "(status = 'new') DESC, created_at DESC, id DESC", // 未处理优先 + 新→旧 (docs/MATCHMAKING.md §36.3)
  newest: 'created_at DESC, id DESC', // 新→旧
  oldest: 'created_at ASC, id ASC', // 旧→新
});

/** Quote one CSV cell (RFC 4180) and defuse a leading =/+/-/@/tab/CR so Excel never runs player text as a formula. */
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The CSV column order of the bug-report export (id, status, submitter, created, title, body, image count). */
export const BUG_CSV_COLUMNS = Object.freeze(['id', 'status', 'submitter', 'created', 'title', 'body', 'images']);

/**
 * The bug reports as RFC-4180 CSV, prefixed with a UTF-8 BOM so Excel opens Chinese correctly. `created` is ISO-8601.
 * @param {Array<object>} [list] rows from {@link CommunityService#listBugReports}
 * @returns {string}
 */
export function bugReportsToCsv(list) {
  const rows = [BUG_CSV_COLUMNS.join(',')];
  for (const b of Array.isArray(list) ? list : []) {
    rows.push([b.id, b.status, b.submitter ?? '', b.created_at == null ? '' : new Date(b.created_at).toISOString(), b.title, b.body, (b.images || []).length].map(csvCell).join(','));
  }
  return `\uFEFF${rows.join('\r\n')}\r\n`;
}

/**
 * A JSON-serializable export of the (already filtered / sorted) reports — identity fields only, never accountId, the
 * account store, or any image bytes (docs/MATCHMAKING.md §36.3).
 * @param {Array<object>} [list]
 * @param {{ status?: string|null, sort?: string }} [filters]
 * @returns {{ status: string|null, sort: string, count: number, reports: Array<object> }}
 */
export function bugReportsExport(list, { status = null, sort = 'status' } = {}) {
  const reports = (Array.isArray(list) ? list : []).map((b) => ({
    id: b.id, status: b.status, submitter: b.submitter ?? null,
    created: b.created_at == null ? null : new Date(b.created_at).toISOString(),
    title: b.title, body: b.body, images: (b.images || []).length,
  }));
  return {
    status: status && BUG_STATUSES.includes(status) ? status : null,
    sort: BUG_SORTS.includes(sort) ? sort : 'status',
    count: reports.length,
    reports,
  };
}

/**
 * Parse the repo's `CHANGELOG.md` into entries: each `## <version> — <YYYY-MM-DD>` starts one, its body is the markdown
 * up to the next `##` (or the end). → `{ version, releasedAt, title, body }` (title = version; date null when absent).
 * @param {unknown} markdown
 * @returns {Array<{ version: string, releasedAt: number|null, title: string, body: string }>}
 */
export function parseChangelogMarkdown(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    out.push({ version: cur.version, releasedAt: cur.releasedAt, title: cur.version, body: cur.lines.join('\n').trim() });
  };
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      const head = m[1];
      const dm = /^(.+?)\s*[—–-]\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(head);
      const version = (dm ? dm[1] : head).trim();
      const releasedAt = dm ? Date.UTC(Number(dm[2]), Number(dm[3]) - 1, Number(dm[4])) : null;
      cur = { version, releasedAt, lines: [] };
      continue;
    }
    if (cur) cur.lines.push(line);
  }
  flush();
  return out;
}

/** A fixed-window (sliding) rate counter per key; deterministic with an injected `now`. */
class RateWindow {
  /** @param {number} limit @param {number} windowMs @param {() => number} now */
  constructor(limit, windowMs, now) { this.limit = limit; this.windowMs = windowMs; this.now = now; this.hits = new Map(); }
  /** @param {string} key @returns {{ ok: true } | { ok: false, retryMs: number }} */
  take(key) {
    const now = this.now();
    const arr = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return { ok: false, retryMs: Math.max(0, this.windowMs - (now - arr[0])) };
    }
    arr.push(now);
    this.hits.set(key, arr);
    return { ok: true };
  }
}

/**
 * Changelog + bug reports over a server/db.mjs connection. All methods are synchronous (like AuthService).
 */
export class CommunityService {
  /**
   * @param {{ db: any, dir?: string|null, now?: () => number, reportLimit?: number, uploadLimit?: number,
   *   windowMs?: number, maxImageBytes?: number }} opts
   */
  constructor({ db, dir = null, now = Date.now, reportLimit = BUG_REPORT_LIMIT, uploadLimit = BUG_UPLOAD_LIMIT, windowMs = BUG_RATE_WINDOW_MS, maxImageBytes = BUG_IMAGE_MAX_BYTES }) {
    this.db = db;
    this.now = now;
    /** @type {string|null} the uploads directory (`<repo>/var/bug-uploads`), or null in a pure read test. */
    this.dir = dir;
    this.maxImageBytes = maxImageBytes;
    this.reports = new RateWindow(reportLimit, windowMs, now);
    this.uploads = new RateWindow(uploadLimit, windowMs, now);
    /** @type {Map<number, { key: string, at: number }>} an uploaded-but-not-yet-attached image's owner (in memory) */
    this._pending = new Map();
    /** @type {Map<string, any>} the lazily prepared report-list statements, keyed by `status|sort`. */
    this._reportStmts = new Map();
    this.q = {
      clogCount: db.prepare('SELECT COUNT(*) AS n FROM changelog'),
      clogInsert: db.prepare('INSERT INTO changelog (version, released_at, title, body, published, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
      clogList: db.prepare('SELECT id, version, released_at, title, body FROM changelog WHERE published = 1 ORDER BY released_at DESC, id DESC LIMIT ?'),
      clogListAll: db.prepare('SELECT id, version, released_at, title, body, published FROM changelog ORDER BY released_at DESC, id DESC LIMIT ?'),
      reportInsert: db.prepare('INSERT INTO bug_reports (title, body, account_id, submitter, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
      reportById: db.prepare('SELECT * FROM bug_reports WHERE id = ?'),
      reportCounts: db.prepare('SELECT status, COUNT(*) AS n FROM bug_reports GROUP BY status'),
      reportStatus: db.prepare('UPDATE bug_reports SET status = ?, updated_at = ? WHERE id = ?'),
      uploadInsert: db.prepare('INSERT INTO bug_uploads (report_id, path, mime, bytes, account_id, created_at) VALUES (NULL, ?, ?, ?, ?, ?)'),
      uploadById: db.prepare('SELECT * FROM bug_uploads WHERE id = ?'),
      uploadByReport: db.prepare('SELECT * FROM bug_uploads WHERE report_id = ? ORDER BY id'),
      uploadAttach: db.prepare('UPDATE bug_uploads SET report_id = ? WHERE id = ? AND report_id IS NULL'),
      uploadOrphans: db.prepare('SELECT * FROM bug_uploads WHERE report_id IS NULL AND created_at < ?'),
      uploadDelete: db.prepare('DELETE FROM bug_uploads WHERE id = ?'),
      accountById: db.prepare('SELECT id FROM accounts WHERE id = ?'),
    };
  }

  /** The account id when it exists, else null (a stale / forged id must not trip the FK, it just becomes a guest). */
  _accountId(id) { return Number.isInteger(id) && id > 0 && this.q.accountById.get(id) ? id : null; }

  // ---- changelog ------------------------------------------------------------------------------------------------

  /** @returns {number} */
  changelogCount() { return Number(this.q.clogCount.get()?.n || 0); }

  /**
   * The changelog, newest first.
   * @param {{ limit?: number, includeUnpublished?: boolean }} [opts]
   * @returns {Array<{ id:number, version:string, released_at:number|null, title:string, body:string }>}
   */
  listChangelog({ limit = CHANGELOG_LIMIT, includeUnpublished = false } = {}) {
    const n = Math.max(1, Math.min(Number(limit) || CHANGELOG_LIMIT, CHANGELOG_LIMIT));
    return includeUnpublished ? this.q.clogListAll.all(n) : this.q.clogList.all(n);
  }

  /**
   * Add one entry (the seed path and, optionally, the admin page).
   * @param {{ version: unknown, releasedAt?: number|null, title?: unknown, body?: unknown, published?: boolean }} entry
   * @returns {{ ok: true, id: number } | { error: string }}
   */
  addChangelog({ version, releasedAt = null, title, body = '', published = true }) {
    const v = sanitizeText(version);
    const t = sanitizeText(title ?? version);
    const b = sanitizeText(body, { multiline: true });
    if (!v || !t || b.length > CHANGELOG_BODY_MAX) return { error: 'BAD_REPORT' };
    const at = Number.isFinite(releasedAt) ? Number(releasedAt) : null;
    const r = this.q.clogInsert.run(v, at, t, b, published === false ? 0 : 1, this.now());
    return { ok: true, id: Number(r.lastInsertRowid) };
  }

  /**
   * Seed the changelog from `CHANGELOG.md`, ONCE: a non-empty table is left as it is (unless `force`).
   * @param {unknown} markdown
   * @param {{ force?: boolean }} [opts]
   * @returns {{ ok: true, imported: number, skipped: boolean }}
   */
  importChangelogMarkdown(markdown, { force = false } = {}) {
    if (!force && this.changelogCount() > 0) return { ok: true, imported: 0, skipped: true };
    const entries = parseChangelogMarkdown(markdown);
    this.db.exec('BEGIN');
    try {
      for (const e of entries) this.addChangelog(e);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return { ok: true, imported: entries.length, skipped: false };
  }

  // ---- bug reports ----------------------------------------------------------------------------------------------

  /**
   * Store one report: `title` (required, ≤ BUG_TITLE_MAX), `body` (≤ BUG_BODY_MAX) and up to BUG_IMAGES_MAX ids of
   * images this same key uploaded (and that no report has claimed yet). Rate limited per key.
   * @param {{ title?: unknown, body?: unknown, images?: unknown, accountId?: number|null, submitter?: unknown, key?: string|null }} input
   * @returns {{ ok: true, report: object } | { error: string }}
   */
  createBugReport({ title, body = '', images = [], accountId = null, submitter = null, key = null }) {
    const who = key || `account:${accountId ?? 'guest'}`;
    const gate = this.reports.take(who);
    if (!gate.ok) return { error: 'RATE' };
    const t = sanitizeText(title);
    const b = sanitizeText(body, { multiline: true });
    if (!t || t.length > BUG_TITLE_MAX || b.length > BUG_BODY_MAX) return { error: 'BAD_REPORT' };
    const ids = Array.isArray(images) ? [...new Set(images.filter((x) => Number.isInteger(x) && x > 0))] : [];
    if (ids.length > BUG_IMAGES_MAX) return { error: 'BAD_IMAGE' };
    const owned = [];
    for (const id of ids) {
      const row = this.q.uploadById.get(id);
      if (!row || row.report_id != null) return { error: 'BAD_IMAGE' };
      const pending = this._pending.get(id);
      if (pending && pending.key !== who) return { error: 'BAD_IMAGE' };
      owned.push(row);
    }
    const now = this.now();
    const aid = this._accountId(accountId);
    const name = sanitizeText(submitter) || null;
    const r = this.q.reportInsert.run(t, b, aid, name, 'new', now, now);
    const reportId = Number(r.lastInsertRowid);
    for (const row of owned) {
      this.q.uploadAttach.run(reportId, row.id);
      this._pending.delete(row.id);
    }
    return { ok: true, report: { id: reportId, title: t, body: b, status: 'new', accountId: aid, submitter: name, createdAt: now, images: owned.map((u) => ({ id: u.id, mime: u.mime, bytes: u.bytes })) } };
  }

  /**
   * The reports, server-side filtered and sorted (so the rules apply to the whole set, not only the first page):
   * `status` (`new` / `triaged` / `fixed`; anything else — including null / `'all'` — means every status) and `sort`
   * (see {@link BUG_SORTS}; the default `'status'` keeps the historical 未处理优先 + 新→旧).
   * @param {{ status?: string|null, sort?: string, limit?: number }} [opts]
   */
  listBugReports({ status = null, sort = 'status', limit = 100 } = {}) {
    const n = Math.max(1, Math.min(Number(limit) || 100, 500));
    const s = BUG_SORTS.includes(sort) ? sort : 'status';
    const where = status && BUG_STATUSES.includes(status) ? status : null;
    const st = this._reportStmt(where, s);
    const rows = where ? st.all(where, n) : st.all(n);
    return rows.map((row) => ({ ...row, images: this.q.uploadByReport.all(row.id).map((u) => ({ id: u.id, mime: u.mime, bytes: u.bytes })) }));
  }

  /** Prepare (once) the report-list statement for one `status|sort` pair — only BUG_ORDER text ever reaches ORDER BY. */
  _reportStmt(status, sort) {
    const key = `${status || ''}|${sort}`;
    let st = this._reportStmts.get(key);
    if (!st) {
      const where = status ? 'WHERE status = ?' : '';
      st = this.db.prepare(`SELECT * FROM bug_reports ${where} ORDER BY ${BUG_ORDER[sort]} LIMIT ?`);
      this._reportStmts.set(key, st);
    }
    return st;
  }

  /** The report totals by status (for the admin page's filter chips). @returns {{new:number,triaged:number,fixed:number,total:number}} */
  bugReportCounts() {
    const out = { new: 0, triaged: 0, fixed: 0, total: 0 };
    for (const row of this.q.reportCounts.all()) {
      if (BUG_STATUSES.includes(row.status)) out[row.status] = Number(row.n);
      out.total += Number(row.n);
    }
    return out;
  }

  /** @param {number} id @param {string} status @returns {{ ok: true } | { error: string }} */
  setBugStatus(id, status) {
    if (!Number.isInteger(id) || id <= 0 || !BUG_STATUSES.includes(status)) return { error: 'BAD_REPORT' };
    const r = this.q.reportStatus.run(status, this.now(), id);
    return Number(r.changes) > 0 ? { ok: true } : { error: 'BAD_REPORT' };
  }

  // ---- images ---------------------------------------------------------------------------------------------------

  /**
   * Write one uploaded image to disk and record it (unattached). The type is sniffed from the bytes.
   * @param {{ key?: string|null, accountId?: number|null, bytes?: unknown }} input
   * @returns {{ ok: true, upload: { id:number, mime:string, bytes:number } } | { error: string }}
   */
  saveUpload({ key = null, accountId = null, bytes = null }) {
    const who = key || `account:${accountId ?? 'guest'}`;
    const gate = this.uploads.take(who);
    if (!gate.ok) return { error: 'RATE' };
    if (!this.dir) return { error: 'INTERNAL' };
    if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > this.maxImageBytes) return { error: 'BAD_IMAGE' };
    const mime = sniffImageType(bytes);
    if (!mime || !BUG_IMAGE_MIMES.includes(mime)) return { error: 'BAD_IMAGE' };
    const file = `${this.now()}-${randomBytes(8).toString('hex')}.${EXT_OF[mime]}`;
    try {
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(join(this.dir, file), bytes, { mode: 0o600 });
    } catch { return { error: 'INTERNAL' }; }
    const r = this.q.uploadInsert.run(file, mime, bytes.length, this._accountId(accountId), this.now());
    const id = Number(r.lastInsertRowid);
    this._pending.set(id, { key: who, at: this.now() });
    return { ok: true, upload: { id, mime, bytes: bytes.length } };
  }

  /** @param {number} id @returns {any|null} */
  getUpload(id) { return Number.isInteger(id) && id > 0 ? (this.q.uploadById.get(id) || null) : null; }

  /**
   * The bytes of an upload on disk (null when the row or file is missing).
   * @param {any} row
   * @returns {Buffer|null}
   */
  readUpload(row) {
    if (!this.dir || !row || typeof row.path !== 'string') return null;
    try { return readFileSync(join(this.dir, row.path)); } catch { return null; }
  }

  /**
   * Delete unattached uploads older than `maxAgeMs` (an upload the player never submitted) and their files.
   * @param {{ maxAgeMs?: number }} [opts]
   * @returns {number} files removed
   */
  pruneUploads({ maxAgeMs = 24 * 60 * 60 * 1000 } = {}) {
    const cutoff = this.now() - maxAgeMs;
    const rows = this.q.uploadOrphans.all(cutoff);
    for (const row of rows) {
      this.q.uploadDelete.run(row.id);
      this._pending.delete(row.id);
      if (this.dir) { try { rmSync(join(this.dir, row.path), { force: true }); } catch { /* best effort */ } }
    }
    return rows.length;
  }
}
