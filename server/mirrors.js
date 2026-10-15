// server/mirrors.js — public/asset-mirrors.json is the ONE place the art origins are written down.
// (i18n-ignore-file: the validation messages and the file's note are developer-facing, shown only on the operations
// page — docs/I18N.md)
//
// The client (public/js/assetMirror.js), the Service Worker's miss chain (server/assetindex.js → /asset-index.json)
// and the console's 测速 (server/speed.js) all read this file, so a relay or a mirror is moved by editing the file —
// no code change and no restart (the asset index keys its cache on the file's mtime too, so a save is live on the next
// request). Environment overrides remain for local experiments: SP_ASSET_RELAY (the full origin the client installs)
// and SP_ASSET_REF='' (skip the plain-file CDN mirrors).
//
// The console edits the file through GET/POST /admin/api/origins: every URL is validated, a full origin must also be a
// listed source, and the previous file is kept as var/asset-mirrors.backup.json so one click can put it back. Writes go
// through a temp file + rename, so a client can never read a half-written config.

import fs from 'node:fs';
import path from 'node:path';

export const MIRRORS_FILE = 'asset-mirrors.json';
export const BACKUP_FILE = 'asset-mirrors.backup.json';

/** The config inside a public directory (`public/asset-mirrors.json`). @param {string} publicDir */
export function configPath(publicDir) { return path.join(publicDir, MIRRORS_FILE); }
/** Where the previous version is kept, for the console's 还原 (never inside public/, never shipped). @param {string} root */
export function backupPath(root) { return path.join(root, 'var', BACKUP_FILE); }

/** Is `v` an http(s) origin we are willing to put in front of a player? */
export function isOrigin(v) {
  if (typeof v !== 'string' || !v.trim()) return false;
  try {
    const u = new URL(v.trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.host;
  } catch { return false; }
}

/** Trailing slashes are noise: `http://host/` and `http://host` must not both be storable. */
export const tidyOrigin = (s) => String(s).trim().replace(/\/+$/, '');
const tidy = tidyOrigin;

/**
 * The configured origins. Never throws: a missing, unreadable or malformed file yields empty lists — the client then
 * stays on the game server, which is the safe default.
 * @param {string} publicDir @returns {{ note: string, sources: string[], fullSources: string[], exists: boolean }}
 */
export function readMirrors(publicDir) {
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(configPath(publicDir), 'utf8')); } catch { /* absent or invalid */ }
  const strList = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s.trim()).map(tidy) : []);
  const sources = strList(raw && raw.sources);
  const fullSources = strList(raw && raw.fullSources).filter((f) => sources.includes(f));
  return { note: typeof (raw && raw.note) === 'string' ? raw.note : '', sources, fullSources, exists: raw != null };
}

/**
 * Validate a candidate config. Empty lists are allowed (the client then goes straight to the game server); every entry
 * must be a distinct http(s) URL, and a full origin must also appear in `sources`.
 * @param {{ sources?: unknown, fullSources?: unknown }} next @returns {{ error?: string }}
 */
export function validateMirrors(next = {}) {
  const { sources, fullSources } = next;
  if (!Array.isArray(sources)) return { error: '来源需要是数组 · sources must be an array' };
  if (!Array.isArray(fullSources)) return { error: '全路由来源需要是数组 · fullSources must be an array' };
  const seen = new Set();
  for (const s of sources) {
    if (!isOrigin(s)) return { error: '不是合法的 http(s) 地址：' + String(s).slice(0, 80) };
    if (seen.has(tidy(s))) return { error: '重复的来源：' + tidy(s).slice(0, 80) };
    seen.add(tidy(s));
  }
  for (const f of fullSources) {
    if (!isOrigin(f)) return { error: '全路由来源不是合法地址：' + String(f).slice(0, 80) };
    if (!seen.has(tidy(f))) return { error: '全路由来源也必须列在来源里：' + tidy(f).slice(0, 80) };
  }
  return {};
}

/**
 * Write the config, keeping the previous file as the backup first. Atomic: a temp file is renamed over the real one, so
 * a request never reads a partial config.
 * @param {string} publicDir @param {{ sources: string[], fullSources: string[] }} next
 * @param {{ backup?: string|null }} [o] where to copy the previous version (null → no backup)
 * @returns {{ ok?: boolean, error?: string }}
 */
export function writeMirrors(publicDir, next, { backup = null } = {}) {
  const bad = validateMirrors(next);
  if (bad.error) return bad;
  const file = configPath(publicDir);
  const prev = readMirrors(publicDir);
  const payload = {
    note: prev.note || 'Art origins, best first (docs/ASSETS.md). Editable from the operations page (来源配置).',
    sources: next.sources.map(tidy),
    fullSources: next.fullSources.map(tidy),
  };
  try {
    fs.mkdirSync(publicDir, { recursive: true });
    if (backup && prev.exists) {
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(file, backup);
    }
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, file);
    return { ok: true };
  } catch (e) { return { error: '写入失败 · write failed: ' + (e && e.message ? e.message : String(e)) }; }
}

/** Put the backup back (the console's 还原). @returns {{ ok?: boolean, error?: string }} */
export function revertMirrors(publicDir, { backup = null } = {}) {
  if (!backup) return { error: '没有可还原的备份 · no backup' };
  const file = configPath(publicDir);
  try {
    const prev = fs.readFileSync(backup, 'utf8');
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, prev, 'utf8');
    fs.renameSync(tmp, file);
    return { ok: true };
  } catch { return { error: '没有可还原的备份 · no backup' }; }
}

/** Does a previous version exist to revert to? @param {string} root */
export function hasBackup(root) {
  try { return fs.statSync(backupPath(root)).isFile(); } catch { return false; }
}
