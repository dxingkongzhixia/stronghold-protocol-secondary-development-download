// server/assetindex.js — the asset index the client caches against (public/sw.js + public/js/assetCache.js).
//
// The client keeps a local copy of the art in Service Worker Cache Storage (docs/OUR-FEATURES.md "local asset
// cache"). To update that copy cheaply it needs two things: WHAT the server has and WHICH files changed. This
// module answers both — `files` maps every cacheable URL to its byte size on disk, and `version` is a deterministic
// hash of that map. The client stores the version it holds: an equal version means its cache already matches the
// server (nothing to download), a different one lets it diff the map and fetch only the missing / resized files.
//
// Sources: data/assets.json (the art manifest), the merged local-art manifest (the committed
// data/local-assets.committed.json ∪ the per-machine data/local-assets.json), and the files those name on disk under
// public/. The string-leaf collection is pure and unit-testable; the disk pass is a thin stat loop.
//
// Served at GET /asset-index.json (server/http/static.js): small enough to re-read on every boot, and `no-store`
// (it must reflect the server's current art, never a stale browser copy).

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { noopLog } from './http/config.js';
import { APP_VERSION } from '../shared/constants.js';

/** The manifest trees whose string leaves are cacheable asset URLs (art + fonts). */
const URL_PREFIXES = ['/assets/', '/fonts/'];

/**
 * Every distinct cacheable asset URL among the string leaves of a JSON value.
 * @param {unknown} value
 * @param {Set<string>} [out]
 * @returns {Set<string>}
 */
export function collectAssetUrls(value, out = new Set()) {
  if (typeof value === 'string') {
    const s = value.split('#')[0].split('?')[0];
    if (URL_PREFIXES.some((p) => s.startsWith(p))) out.add(s);
    return out;
  }
  if (Array.isArray(value)) { for (const v of value) collectAssetUrls(v, out); return out; }
  if (value && typeof value === 'object') { for (const v of Object.values(value)) collectAssetUrls(v, out); return out; }
  return out;
}

/**
 * Deterministic version of a `{ url: size }` map: sorted keys, sha1, 16 hex chars. Equal map ⇒ equal version
 * (key order does not matter); any size or membership change gives a new version.
 * @param {Record<string, number>} files
 * @returns {string}
 */
export function indexVersion(files) {
  const h = createHash('sha1');
  for (const k of Object.keys(files).sort()) h.update(k).update('\0').update(String(files[k])).update('\n');
  return h.digest('hex').slice(0, 16);
}

/** Parse a JSON file, or null when it is absent / unreadable / invalid. */
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** stat().mtimeMs of a file, or 0 when absent. */
function mtimeMs(file) {
  try { return fs.statSync(file).mtimeMs; } catch { return 0; }
}

/**
 * Build the asset index value from the manifests already on disk and the files they name under public/.
 * @param {{ dataDir: string, publicDir: string, log?: object }} o
 * @returns {{ version: number, app: string, count: number, bytes: number, files: Record<string, number> }}
 */
export function buildAssetIndexValue({ dataDir, publicDir, log = noopLog }) {
  const urls = new Set();
  collectAssetUrls(readJson(path.join(dataDir, 'assets.json')), urls);
  collectAssetUrls(readJson(path.join(dataDir, 'local-assets.committed.json')), urls);
  collectAssetUrls(readJson(path.join(dataDir, 'local-assets.json')), urls);
  /** @type {Record<string, number>} */
  const files = {};
  let bytes = 0;
  const base = path.resolve(publicDir);
  for (const url of urls) {
    const rel = url.replace(/^\/+/, '');
    const abs = path.resolve(base, ...rel.split('/'));
    if (abs !== base && !abs.startsWith(base + path.sep)) continue; // never leave public/
    let st;
    try { st = fs.statSync(abs); } catch { continue; } // a URL the manifest lists but this machine lacks
    if (!st.isFile()) continue;
    files[url] = st.size;
    bytes += st.size;
  }
  log.info?.(`[asset-index] ${Object.keys(files).length} files, ${bytes} bytes`);
  return { version: 1, app: APP_VERSION, revision: indexVersion(files), count: Object.keys(files).length, bytes, files };
}

/**
 * A cached asset index. The expensive stat pass runs once and is rebuilt only when one of the source manifests
 * changes (its mtime), which is exactly when the index can change.
 * @param {{ dataDir: string, publicDir: string, log?: object }} o
 * @returns {{ get: () => { version: number, app: string, count: number, bytes: number, files: Record<string, number> } }}
 */
export function createAssetIndex({ dataDir, publicDir, log = noopLog }) {
  const sources = ['assets.json', 'local-assets.committed.json', 'local-assets.json'].map((f) => path.join(dataDir, f));
  const keyOf = () => sources.map((f) => mtimeMs(f)).join(':');
  /** @type {{ key: string, value: ReturnType<typeof buildAssetIndexValue> } | null} */
  let cache = null;
  return {
    get() {
      const key = keyOf();
      if (cache && cache.key === key) return cache.value;
      const value = buildAssetIndexValue({ dataDir, publicDir, log });
      cache = { key, value };
      return value;
    },
  };
}
