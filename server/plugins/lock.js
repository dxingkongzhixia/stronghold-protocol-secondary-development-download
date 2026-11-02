// Plugin version lock / rollback (`plugins/lock.json` + `plugins/_locked/`).
//
// The lock is an owner-side recovery point, not a load gate: it records the installed version and a SHA-256 of every
// file (buildPluginLock) and archives the folder as the deterministic zip `zipPlugin` writes. `plugins/_locked/` is a
// folder the registry never reads (it starts with `_`), like `_replaced` / `_removed`. A rollback extracts that zip
// through installPluginBytes with force, so the current folder is moved to `_replaced` and the same zip checks apply
// as any other install. Nothing here runs plugin code.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildPluginLock, zipPlugin } from './pack.js';
import { installPluginBytes } from './install.js';
import { isPluginId } from '../../shared/plugins/manifest.js';

export const VERSION_LOCK_FILE = 'lock.json';
export const VERSION_LOCK_VERSION = 1;
export const VERSION_LOCK_DIR = '_locked';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const cleanVersion = (v) => {
  const s = String(v ?? '0.0.0').replace(/[^0-9A-Za-z.+-]/g, '_').slice(0, 64);
  return s || '0.0.0';
};
const emptyLock = () => ({ version: VERSION_LOCK_VERSION, updatedAt: null, plugins: {} });

/** A real directory at `dir`, created when missing; a symbolic link is refused. */
function realDir(dir) {
  const st = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (!st) { fs.mkdirSync(dir, { recursive: true }); return; }
  if (st.isSymbolicLink() || !st.isDirectory()) throw new Error(`${path.basename(dir)} is not a real folder`);
}

/** Write a private temp file and rename it over `file` (never follows a link at the destination). */
function writeAtomic(file, bytes) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, bytes, { mode: 0o600 });
  try { fs.renameSync(tmp, file); } catch {
    fs.rmSync(file, { force: true });
    fs.renameSync(tmp, file);
  }
}

/**
 * Read `plugins/lock.json`. A missing file is an empty lock; a broken one is an empty lock plus `error` (the caller
 * can still lock again, which overwrites it).
 * @param {string} pluginsDir
 * @returns {{ lock: { version: number, updatedAt: string|null, plugins: Record<string, any> }, error: string|null }}
 */
export function readVersionLock(pluginsDir) {
  const lock = emptyLock();
  if (!pluginsDir) return { lock, error: 'plugins are disabled' };
  const file = path.join(pluginsDir, VERSION_LOCK_FILE);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    if (e?.code === 'ENOENT') return { lock, error: null };
    return { lock, error: `${VERSION_LOCK_FILE}: ${String(e?.message || e).slice(0, 200)}` };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.plugins || typeof raw.plugins !== 'object') {
    return { lock, error: `${VERSION_LOCK_FILE}: not a version-lock document` };
  }
  if (typeof raw.updatedAt === 'string') lock.updatedAt = raw.updatedAt;
  for (const [id, e] of Object.entries(raw.plugins)) {
    if (!isPluginId(id) || !e || typeof e !== 'object') continue;
    if (typeof e.version !== 'string' || !e.version) continue;
    if (typeof e.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(e.sha256)) continue;
    if (typeof e.file !== 'string' || !/^[A-Za-z0-9._+-]+\.zip$/.test(e.file)) continue;
    lock.plugins[id] = {
      version: e.version,
      sha256: e.sha256.toLowerCase(),
      zipSha256: typeof e.zipSha256 === 'string' && /^[a-f0-9]{64}$/i.test(e.zipSha256) ? e.zipSha256.toLowerCase() : null,
      file: e.file,
      zipBytes: Number.isFinite(e.zipBytes) ? Math.max(0, e.zipBytes) : null,
      bytes: Number.isFinite(e.bytes) ? Math.max(0, e.bytes) : null,
      files: Number.isFinite(e.files) ? Math.max(0, e.files) : null,
      lockedAt: typeof e.lockedAt === 'string' ? e.lockedAt : null,
    };
  }
  return { lock, error: null };
}

/**
 * Write the lock atomically. The caller owns validation; this only serializes safe fields.
 * @param {string} pluginsDir @param {{ version?: number, updatedAt?: string|null, plugins: Record<string, any> }} lock
 */
export function writeVersionLock(pluginsDir, lock) {
  if (!pluginsDir) throw new Error('plugins are disabled');
  realDir(pluginsDir);
  const body = JSON.stringify({
    version: VERSION_LOCK_VERSION,
    updatedAt: typeof lock?.updatedAt === 'string' ? lock.updatedAt : null,
    plugins: lock?.plugins && typeof lock.plugins === 'object' ? lock.plugins : {},
  }, null, 2) + '\n';
  writeAtomic(path.join(pluginsDir, VERSION_LOCK_FILE), body);
}

/** A stable digest of the files buildPluginLock hashed (path + content hash + size, sorted). */
function digestOf(pluginLock) {
  const h = createHash('sha256');
  for (const rel of Object.keys(pluginLock.files || {}).sort()) {
    const f = pluginLock.files[rel];
    h.update(`${rel}\0${f.sha256}\0${f.bytes}\n`);
  }
  return h.digest('hex');
}

function eligible(p) {
  return !!(p && typeof p.id === 'string' && isPluginId(p.id) && p.where
    && !p.builtin && p.source !== 'builtin' && p.layout !== 'file');
}

/**
 * Lock the installed folders: hash every file, archive the folder as a zip under `plugins/_locked/`, and record the
 * version + digest in `plugins/lock.json`. Builtin / file-layout plugins are skipped and reported.
 * @param {string} pluginsDir
 * @param {any[]} plugins registry plugins
 * @param {{ ids?: string[] | null, now?: number }} [opts]
 * @returns {{ lock: any, results: { id: string, version?: string, sha256?: string, file?: string, skipped?: string, error?: string }[] }}
 */
export function lockPlugins(pluginsDir, plugins, { ids = null, now = Date.now() } = {}) {
  if (!pluginsDir) throw new Error('plugins are disabled');
  const { lock } = readVersionLock(pluginsDir);
  const wanted = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null;
  const results = [];
  const seen = new Set();
  const archiveDir = path.join(pluginsDir, VERSION_LOCK_DIR);
  realDir(archiveDir);
  for (const p of Array.isArray(plugins) ? plugins : []) {
    if (!p || typeof p.id !== 'string') continue;
    if (wanted && !wanted.has(p.id)) continue;
    seen.add(p.id);
    if (!eligible(p)) { results.push({ id: p.id, skipped: p.builtin || p.source === 'builtin' ? 'builtin' : p.layout === 'file' ? 'file' : 'not-installed' }); continue; }
    try {
      const built = buildPluginLock(p.where);
      if (!built.lock || (Array.isArray(built.problems) && built.problems.length)) {
        results.push({ id: p.id, error: String(built.problems?.[0] || 'the folder cannot be locked').slice(0, 300) });
        continue;
      }
      const sha = digestOf(built.lock);
      const version = String(p.manifest?.version || built.lock.version || '0.0.0');
      const zipped = zipPlugin(p.where);
      const zipSha = sha256(zipped.body);
      const file = `${p.id}-${cleanVersion(version)}-${sha.slice(0, 8)}.zip`;
      writeAtomic(path.join(archiveDir, file), zipped.body);
      const bytes = Object.values(built.lock.files || {}).reduce((n, f) => n + (Number(f.bytes) || 0), 0);
      lock.plugins[p.id] = {
        version, sha256: sha, zipSha256: zipSha, file,
        zipBytes: zipped.body.length, bytes, files: Object.keys(built.lock.files || {}).length,
        lockedAt: new Date(now).toISOString(),
      };
      results.push({ id: p.id, version, sha256: sha, file });
    } catch (e) {
      results.push({ id: p.id, error: String(e?.message || e).slice(0, 300) });
    }
  }
  if (wanted) for (const id of wanted) if (!seen.has(id)) results.push({ id, error: 'not installed' });
  lock.updatedAt = new Date(now).toISOString();
  writeVersionLock(pluginsDir, lock);
  return { lock, results };
}

/**
 * Forget the pinned versions (the archived zips stay on disk; a later lock may reuse their file names).
 * @param {string} pluginsDir @param {string[]} ids
 * @returns {{ lock: any, removed: string[] }}
 */
export function unlockPlugins(pluginsDir, ids) {
  const { lock } = readVersionLock(pluginsDir);
  const removed = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (!isPluginId(id) || !lock.plugins[id]) continue;
    delete lock.plugins[id];
    removed.push(id);
  }
  lock.updatedAt = new Date().toISOString();
  writeVersionLock(pluginsDir, lock);
  return { lock, removed };
}

/**
 * Restore a locked folder. `installPluginBytes` moves the current folder to `_replaced` and writes the archive's
 * contents after the same checkPluginFolder pass as any install; the archive's zip hash is checked first.
 * @param {string} pluginsDir @param {string} id
 * @returns {{ ok: true, id: string, version: string, file: string, replaced: string|null }}
 */
export function rollbackPlugin(pluginsDir, id) {
  if (!pluginsDir) throw new Error('plugins are disabled');
  if (!isPluginId(id)) throw new Error('invalid plugin id');
  const { lock } = readVersionLock(pluginsDir);
  const entry = lock.plugins[id];
  if (!entry) throw new Error('plugin is not locked');
  const file = path.join(pluginsDir, VERSION_LOCK_DIR, entry.file);
  const st = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!st || st.isSymbolicLink() || !st.isFile()) throw new Error('locked archive is missing');
  const bytes = fs.readFileSync(file);
  if (entry.zipSha256 && sha256(bytes) !== entry.zipSha256) throw new Error('locked archive does not match its hash');
  const r = installPluginBytes(bytes, { pluginsDir, force: true, expectedId: id });
  return { ok: true, id, version: entry.version, file: entry.file, replaced: r.replaced || null };
}

/**
 * What the owner console shows: the lock document, every installed folder, whether its version still matches, and
 * whether the archived zip is still on disk. It does not re-hash folders (a lock/rollback does that).
 * @param {string} pluginsDir @param {any[]} plugins
 */
export function versionLockView(pluginsDir, plugins) {
  const { lock, error } = readVersionLock(pluginsDir);
  const installed = (Array.isArray(plugins) ? plugins : []).filter(eligible).map((p) => {
    const e = lock.plugins[p.id] || null;
    const version = p.manifest?.version || null;
    let archive = false;
    if (e) {
      try {
        const st = fs.lstatSync(path.join(pluginsDir, VERSION_LOCK_DIR, e.file), { throwIfNoEntry: false });
        archive = !!st && st.isFile() && !st.isSymbolicLink();
      } catch { archive = false; }
    }
    return {
      id: p.id, name: typeof p.manifest?.name === 'string' ? p.manifest.name : (p.manifest?.name?.zh || p.manifest?.name?.en || p.id),
      class: p.class || null, version,
      locked: e ? { version: e.version, sha256: e.sha256, file: e.file, zipBytes: e.zipBytes, lockedAt: e.lockedAt, archive } : null,
      match: e ? e.version === version : null,
    };
  });
  return { ok: true, lock: { version: lock.version, updatedAt: lock.updatedAt }, installed, error };
}
