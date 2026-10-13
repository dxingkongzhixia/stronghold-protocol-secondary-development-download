// public/js/assetCache.js — the page-side policy of the local asset cache (public/sw.js is the worker).
// docs/OUR-FEATURES.md "local asset cache".
//
// Why: a cold load preloads ~104 MB of art, and the box's uplink is small, so every new/returning-in-a-new-tab player
// hammers it. With the cache on, the worker serves the art from Cache Storage and the page only pre-fetches what is
// MISSING or CHANGED, judged against GET /asset-index.json (per-file sizes + a content `revision`), and only when the
// revision differs from the one it last stored — an equal revision skips everything.
//
// The planning is pure (`syncPlan` / `cacheIsCurrent`, unit-tested in Node); everything touching `fetch`,
// `navigator.serviceWorker` and `caches` is thin glue used only in the browser.

/** The Service Worker cache name (public/sw.js). */
export const ASSET_CACHE = 'sp-assets';
/** localStorage key of the player's choice: 'stream' (load from the web) or 'cache' (keep a local copy). */
export const ASSET_MODE_PREF = 'sp.pref.assetMode';
const REVISION_PREF = 'sp.assetCache.revision';
const SIZES_PREF = 'sp.assetCache.sizes';

function readPref(key, fallback) {
  try { const raw = globalThis.localStorage?.getItem(key); return raw == null ? fallback : JSON.parse(raw); } catch { return fallback; }
}
function writePref(key, value) { try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* private mode / quota */ } }
function removePref(key) { try { globalThis.localStorage?.removeItem(key); } catch { /* ignore */ } }

/** Is the Service Worker + Cache Storage local cache available here? */
export function assetCacheSupported(scope = globalThis) {
  return !!(scope.navigator && 'serviceWorker' in scope.navigator && scope.caches);
}

/** The stored mode ('stream' | 'cache'), or null when the player has not chosen yet. */
export function getAssetMode() {
  const m = readPref(ASSET_MODE_PREF, null);
  return m === 'stream' || m === 'cache' ? m : null;
}
/** @param {'stream'|'cache'} mode */
export function setAssetMode(mode) { if (mode === 'stream' || mode === 'cache') writePref(ASSET_MODE_PREF, mode); }
/** Effective mode: an unchosen visitor loads from the web (the pre-cache modal sets 'cache' explicitly). */
export function effectiveAssetMode() { return getAssetMode() || 'stream'; }

/** Per-mirror download timeout: 15 s, then the next source (docs/OUR-FEATURES.md §10). */
export const MIRROR_TIMEOUT_MS = 15000;

/**
 * Pure: the ordered download candidates for one asset URL — the CDN mirrors (index.sources: gh-proxy, jsDelivr, each a
 * prefix ending at the repo's `public/`) first, and the game server (same-origin) last.
 * @param {string} url e.g. '/assets/char/avatar/x.png'
 * @param {string[]} [sources]
 * @returns {string[]}
 */
export function candidatesFor(url, sources = []) {
  return [...(Array.isArray(sources) ? sources : []).map((b) => b + url), url];
}

/** `fetch` with an AbortController timeout (ms<=0 = no timeout). */
async function fetchWithTimeout(fetchFn, url, ms) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl && ms > 0 ? setTimeout(() => ctrl.abort(), ms) : null;
  try { return await fetchFn(url, { signal: ctrl ? ctrl.signal : undefined }); }
  finally { if (timer) clearTimeout(timer); }
}

/**
 * Download one asset into the local cache: try each CDN mirror first (15 s, size-verified against index.files), then
 * the game server. The first source whose bytes match is stored in the cache under the same-origin URL (so the worker
 * serves it later). Returns where it came from, or `{ ok:false }` when every source failed (it retries next boot).
 * @param {string} url
 * @param {{ index: any, sources?: string[], timeoutMs?: number, fetchFn?: typeof fetch, cache?: Cache | null }} [o]
 */
export async function fetchArtFile(url, { index, sources, timeoutMs = MIRROR_TIMEOUT_MS, fetchFn = globalThis.fetch, cache } = {}) {
  const want = index && index.files ? index.files[url] : null;
  const src = sources !== undefined ? sources : (index && index.sources);
  const cacheObj = cache !== undefined ? cache : (assetCacheSupported() ? await caches.open(ASSET_CACHE).catch(() => null) : null);
  for (const cand of candidatesFor(url, src)) {
    const isServer = cand === url;
    try {
      const res = await fetchWithTimeout(fetchFn, cand, isServer ? 0 : timeoutMs);
      if (!res || !res.ok) continue;
      const buf = await res.arrayBuffer();
      if (want != null && buf.byteLength !== want) continue; // wrong / a lagging mirror ref → next source
      if (cacheObj) { try { await cacheObj.put(url, new Response(buf, { status: 200, headers: res.headers })); } catch { /* over quota */ } }
      return { ok: true, from: isServer ? 'server' : 'mirror', bytes: buf.byteLength };
    } catch { /* timeout / CORS / offline: next source */ }
  }
  return { ok: false };
}

/**
 * Pure: of `urls` (the set we care about), which to download and which cached files are stale.
 * A file is downloaded when its size differs from the server's or it is not cached; a cached file not in the newer
 * index is removed. Files the server does not list are ignored (nothing to fetch).
 * @param {{ urls: string[], indexFiles: Record<string, number>, storedSizes?: Record<string, number>,
 *           cachedUrls?: Set<string> | string[] }} o
 * @returns {{ download: string[], remove: string[], keep: string[] }}
 */
export function syncPlan({ urls, indexFiles = {}, storedSizes = {}, cachedUrls }) {
  const cached = cachedUrls instanceof Set ? cachedUrls : new Set(cachedUrls || []);
  const download = [];
  const keep = [];
  for (const u of urls) {
    const want = indexFiles[u];
    if (want == null) continue;                       // the server no longer lists it
    if (storedSizes[u] !== want || !cached.has(u)) download.push(u);
    else keep.push(u);
  }
  const remove = [];
  for (const u of urls) if (cached.has(u) && indexFiles[u] == null) remove.push(u);
  return { download, remove, keep };
}

/** Pure: is the local cache already exactly the server's revision for `urls`? */
export function cacheIsCurrent({ urls, indexFiles = {}, storedSizes = {}, cachedUrls, storedRevision, revision }) {
  if (storedRevision == null || storedRevision !== revision) return false;
  const cached = cachedUrls instanceof Set ? cachedUrls : new Set(cachedUrls || []);
  for (const u of urls) {
    const want = indexFiles[u];
    if (want == null) continue;
    if (storedSizes[u] !== want || !cached.has(u)) return false;
  }
  return true;
}

/** The URL paths (path + query) currently held in the asset cache. */
async function cacheKeys() {
  if (!globalThis.caches) return new Set();
  try {
    const cache = await caches.open(ASSET_CACHE);
    const keys = await cache.keys();
    return new Set(keys.map((r) => { try { const u = new URL(r.url); return u.pathname + u.search; } catch { return r.url; } }));
  } catch { return new Set(); }
}

/** Register the worker and wait until it controls the page. Returns the registration, or null. */
export async function registerAssetWorker() {
  if (!assetCacheSupported()) return null;
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    // Ask the browser to keep the cache under storage pressure (best-effort; a no-op where unsupported).
    try { await navigator.storage?.persist?.(); } catch { /* ignore */ }
    return await navigator.serviceWorker.ready;
  } catch { return null; }
}

/** Fetch the server's asset index (never cached: it must reflect the current art). */
export async function fetchAssetIndex(fetchFn = globalThis.fetch) {
  const res = await fetchFn('/asset-index.json', { cache: 'no-store' });
  if (!res || !res.ok) throw new Error(`asset-index ${res ? res.status : 'no response'}`);
  return await res.json();
}

/**
 * Bring the local cache up to the server's revision for `urls`: skip when already current, else download only the
 * missing / changed files and drop the ones the server no longer has. Fails soft (returns `ok:false`) — the caller
 * falls back to the plain HTTP preload.
 * @param {{ urls: string[], index: any, onProgress?: (done: number, total: number) => void, concurrency?: number,
 *           fetchFn?: typeof fetch }} o
 */
export async function ensureAssets({ urls, index, onProgress, concurrency = 6, fetchFn = globalThis.fetch, localBase } = {}) {
  if (!assetCacheSupported() || !index || !index.files) return { ok: false, reason: 'unsupported' };
  const worker = await registerAssetWorker();
  if (!worker) return { ok: false, reason: 'no-worker' };
  // Point the worker at a player's own machine (js/assetSource.js), or clear it ('' = the public server).
  if (localBase !== undefined) { try { worker.active?.postMessage({ type: 'localBase', base: localBase || '' }); } catch { /* the worker decides */ } }
  const indexFiles = index.files;
  const storedSizes = readPref(SIZES_PREF, {}) || {};
  const cached = await cacheKeys();
  if (cacheIsCurrent({ urls, indexFiles, storedSizes, cachedUrls: cached, storedRevision: readPref(REVISION_PREF, null), revision: index.revision })) {
    return { ok: true, skipped: true, revision: index.revision, count: Object.keys(storedSizes).length };
  }
  const plan = syncPlan({ urls, indexFiles, storedSizes, cachedUrls: cached });
  if (plan.remove.length) {
    try { const cache = await caches.open(ASSET_CACHE); await Promise.all(plan.remove.map((u) => cache.delete(u).catch(() => {}))); } catch { /* ignore */ }
  }
  const total = plan.download.length;
  let done = 0;
  const cache = assetCacheSupported() ? await caches.open(ASSET_CACHE).catch(() => null) : null;
  await runPool(plan.download, Math.max(1, concurrency), async (u) => {
    // mirrors first (15 s each, size-verified), the game server last; a miss stays out of `sizes`, retried next boot
    try { await fetchArtFile(u, { index, sources: index.sources, fetchFn, cache }); } catch { /* ignore */ }
    done++;
    try { onProgress?.(done, total); } catch { /* ignore */ }
  });
  // Record only what is actually in the cache now (a failed / over-quota put stays out and retries next time).
  const after = await cacheKeys();
  const sizes = {};
  for (const u of urls) if (after.has(u) && indexFiles[u] != null) sizes[u] = indexFiles[u];
  writePref(SIZES_PREF, sizes);
  writePref(REVISION_PREF, index.revision);
  return { ok: true, skipped: false, downloaded: done, total, removed: plan.remove.length, revision: index.revision };
}

/** Run `fn` over `list` with at most `n` in flight (order does not matter). */
async function runPool(list, n, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(n, list.length) }, async () => {
    while (next < list.length) { const i = next++; await fn(list[i], i); }
  });
  await Promise.all(workers);
}

/** `{ usage, quota }` bytes of this site's storage (Cache Storage included). */
export async function assetCacheUsage() {
  try { const e = await navigator.storage?.estimate?.(); return { usage: (e && e.usage) || 0, quota: (e && e.quota) || 0 }; } catch { return { usage: 0, quota: 0 }; }
}

/** The stored cache state (for the 设置 row): mode, the revision held, and how many files it covers. */
export function assetCacheInfo() {
  const sizes = readPref(SIZES_PREF, {}) || {};
  return { mode: getAssetMode(), revision: readPref(REVISION_PREF, null), files: Object.keys(sizes).length };
}

/** Drop the cache + worker + stored state (the 设置 "清除缓存" action). */
export async function clearAssetCache() {
  try { await caches.delete(ASSET_CACHE); } catch { /* ignore */ }
  try { const reg = await navigator.serviceWorker?.getRegistration?.(); if (reg) await reg.unregister(); } catch { /* ignore */ }
  removePref(REVISION_PREF);
  removePref(SIZES_PREF);
}
