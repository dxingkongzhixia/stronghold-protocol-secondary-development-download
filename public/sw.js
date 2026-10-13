// public/sw.js — the client's local asset cache (Service Worker). docs/OUR-FEATURES.md "local asset cache";
// the authoritative design is docs/ASSETS.md "Local asset cache & CDN mirror download chain".
//
// Cache-first for the art (/assets/, /fonts/, /vendor/). On a MISS it fetches from, in order: the player's own machine
// (localBase, when the page found one), the CDN mirrors of the primary repo (the server's /asset-index.json `sources`
// — gh-proxy then jsDelivr, each with a 15 s timeout and a byte-size check against `files[url]`), and only then the
// game server (which is rate-limited server-side, SP_ASSET_RATE_KBPS). This is what makes the server the true LAST
// RESORT — on-demand art (spine, audio, …) is offloaded too, not just the boot pre-cache. The page owns the policy
// (js/assetCache.js registers it, decides what to pre-cache and clears it).
//
// Deliberately NOT cached: Range requests, non-GET, and any origin but our own.

const CACHE = 'sp-assets';
const PREFIXES = ['/assets/', '/fonts/', '/vendor/'];
const MIRROR_TIMEOUT_MS = 15000;

// A player's own machine ('' when none): the page points us here when it runs the same app/revision.
let localBase = '';
// The server's asset index (sources + per-file sizes), fetched lazily on the first miss and dropped when the page
// reports a new revision (so a deploy is picked up without reloading the worker).
let index = null;

/** @param {URL} url */
function isCacheable(url) {
  return url.origin === self.location.origin && PREFIXES.some((p) => url.pathname.startsWith(p));
}

async function ensureIndex() {
  if (index) return index;
  try { const r = await fetch('/asset-index.json', { cache: 'no-store' }); if (r.ok) index = await r.json(); } catch { /* offline / older server */ }
  return index;
}

/** The ordered fetch sources for a cache miss: the player's own machine, then the CDN mirrors (the game server is last). */
function missSources(idx) {
  const out = [];
  if (localBase) out.push(localBase);
  for (const s of (idx && Array.isArray(idx.sources) ? idx.sources : [])) out.push(s);
  return out;
}

async function fetchWithTimeout(url, ms) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl && ms > 0 ? setTimeout(() => ctrl.abort(), ms) : null;
  try { return await fetch(url, { signal: ctrl ? ctrl.signal : undefined }); }
  finally { if (timer) clearTimeout(timer); }
}

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return; // Range/partial requests always hit the network
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (!isCacheable(url)) return;
  event.respondWith(handle(req, url));
});

/**
 * @param {Request} req @param {URL} url
 * @returns {Promise<Response>}
 */
async function handle(req, url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const path = url.pathname + url.search;
  const idx = await ensureIndex();
  const want = idx && idx.files ? idx.files[path] : null;
  for (const base of missSources(idx)) {
    try {
      const r = await fetchWithTimeout(base + path, MIRROR_TIMEOUT_MS);
      if (!r || !r.ok) continue;
      const buf = await r.arrayBuffer();
      if (want != null && buf.byteLength !== want) continue; // wrong / a lagging mirror ref → next source
      const res = new Response(buf, { status: 200, headers: r.headers });
      try { await cache.put(req, res.clone()); } catch { /* over quota: keep serving */ }
      return res;
    } catch { /* timeout / CORS / offline: next source */ }
  }
  const res = await fetch(req); // the game server (rate-limited) — the last resort
  if (res && res.ok && res.status === 200 && (res.type === 'basic' || res.type === 'default' || res.type === 'cors')) {
    try { await cache.put(req, res.clone()); } catch { /* over quota: keep serving from network */ }
  }
  return res;
}

self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'clear') event.waitUntil(caches.delete(CACHE));
  if (d.type === 'localBase') localBase = typeof d.base === 'string' ? d.base : '';
  // The page tells us the current revision; when it differs, drop the cached index so the next miss re-reads it.
  if (d.type === 'revision' && d.revision && (!index || index.revision !== d.revision)) index = null;
});
