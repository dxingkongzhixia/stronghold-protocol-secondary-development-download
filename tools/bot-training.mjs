#!/usr/bin/env node
// tools/bot-training.mjs — export / prune / manifest for the bot-rehearsal training samples (`var/training.db`).
//
// The recorder (server/training/store.js) appends one row per SERVER-RUN bot rehearsal. This tool archives old rows to
// a monthly JSONL file (gzip), verifies the archive (row count + sha256 in `manifest.json`) and only then deletes the
// rows. Retention: SQLite keeps `--days` (default 14); the archive keeps `--months` (12) or `--max-bytes` (6 GB),
// whichever comes first, oldest first.
//
// Data never enters the repository and is never served: `var/` is git-ignored.
//
// Usage:
//   node tools/bot-training.mjs export [--days 14] [--out var/training/archives]
//   node tools/bot-training.mjs prune  [--months 12] [--max-bytes 6442450944]
//   node tools/bot-training.mjs report
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const DB_FILE = path.join(ROOT, 'var', 'training.db');
const ARCHIVE_DIR = path.join(ROOT, 'var', 'training', 'archives');
const MANIFEST = path.join(ROOT, 'var', 'training', 'manifest.json');

const args = process.argv.slice(2);
const cmd = args[0] && !args[0].startsWith('--') ? args[0] : 'report';
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

const readManifest = () => { try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return { files: [] }; } };
const writeManifest = (m) => {
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n');
};

/** The rows older than `days`, oldest first. */
function oldRows(db, days) {
  const cutoff = Date.now() - days * 86400_000;
  return db.prepare('SELECT * FROM bot_training WHERE at < ? ORDER BY at ASC').all(cutoff);
}

const exportCmd = () => {
  const days = num(opt('--days', 14), 14);
  const outDir = path.resolve(ROOT, opt('--out', ARCHIVE_DIR));
  if (!fs.existsSync(DB_FILE)) { console.log('[training] no database yet:', path.relative(ROOT, DB_FILE)); return 0; }
  const db = new DatabaseSync(DB_FILE);
  const rows = oldRows(db, days);
  if (!rows.length) { console.log(`[training] nothing older than ${days} days`); db.close(); return 0; }
  fs.mkdirSync(outDir, { recursive: true });
  // group by the month of the row
  const byMonth = new Map();
  for (const r of rows) {
    const month = new Date(Number(r.at)).toISOString().slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(r);
  }
  const manifest = readManifest();
  for (const [month, list] of [...byMonth.entries()].sort()) {
    const text = list.map((r) => JSON.stringify(r)).join('\n') + '\n';
    const gz = zlib.gzipSync(Buffer.from(text, 'utf8'), { level: 9 });
    const file = path.join(outDir, `${month}.jsonl.gz`);
    fs.writeFileSync(file, gz);
    const sha = createHash('sha256').update(gz).digest('hex');
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    manifest.files = (manifest.files || []).filter((f) => f.file !== rel);
    manifest.files.push({ file: rel, month, rows: list.length, bytes: gz.length, sha256: sha, at: Date.now() });
    console.log(`[training] wrote ${rel}: ${list.length} rows, ${gz.length} bytes`);
  }
  // verified (written + hashed) → now delete those rows, in one transaction
  const ids = rows.map((r) => Number(r.id));
  db.exec('BEGIN');
  const del = db.prepare('DELETE FROM bot_training WHERE id = ?');
  for (const id of ids) del.run(id);
  db.exec('COMMIT');
  db.exec('VACUUM');
  db.close();
  writeManifest(manifest);
  console.log(`[training] pruned ${ids.length} exported rows from the hot table`);
  return 0;
};

const pruneCmd = () => {
  const months = num(opt('--months', 12), 12);
  const maxBytes = num(opt('--max-bytes', 6 * 1024 ** 3), 6 * 1024 ** 3);
  const manifest = readManifest();
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const cutoffMonth = cutoff.toISOString().slice(0, 7);
  let kept = [];
  let removed = 0;
  let bytes = 0;
  for (const f of (manifest.files || []).sort((a, b) => (a.month < b.month ? -1 : 1))) {
    const tooOld = f.month < cutoffMonth;
    const overCap = bytes + Number(f.bytes || 0) > maxBytes;
    if (tooOld || overCap) {
      try { fs.rmSync(path.resolve(ROOT, f.file), { force: true }); } catch { /* already gone */ }
      removed++;
      console.log(`[training] removed archive ${f.file} (${tooOld ? 'older than ' + months + ' months' : 'over the byte cap'})`);
    } else {
      bytes += Number(f.bytes || 0);
      kept.push(f);
    }
  }
  manifest.files = kept;
  writeManifest(manifest);
  console.log(`[training] archives kept: ${kept.length} (${(bytes / 1024 ** 2).toFixed(1)} MB), removed ${removed}`);
  return 0;
};

const reportCmd = () => {
  const manifest = readManifest();
  let rows = null;
  let oldest = null;
  try {
    const db = new DatabaseSync(DB_FILE, { readOnly: true });
    rows = Number(db.prepare('SELECT COUNT(*) AS n FROM bot_training').get()?.n ?? 0);
    oldest = db.prepare('SELECT MIN(at) AS at FROM bot_training').get()?.at ?? null;
    db.close();
  } catch { /* no DB yet */ }
  const total = (manifest.files || []).reduce((n, f) => n + Number(f.bytes || 0), 0);
  console.log(`[training] hot rows: ${rows ?? 'none'}${oldest ? ` (oldest ${new Date(Number(oldest)).toISOString().slice(0, 10)})` : ''}`);
  console.log(`[training] archives: ${(manifest.files || []).length} file(s), ${(total / 1024 ** 2).toFixed(1)} MB`);
  return 0;
};

const run = { export: exportCmd, prune: pruneCmd, report: reportCmd }[cmd];
if (!run) { console.error(`usage: node tools/bot-training.mjs <export|prune|report> [...]`); process.exit(2); }
process.exit(run());
