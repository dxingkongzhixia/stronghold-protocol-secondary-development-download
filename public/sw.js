// public/sw.js — the client's local asset cache (Service Worker). docs/OUR-FEATURES.md "local asset cache".
//
// Serves the art (/assets/, /fonts/, /vendor/) from Cache Storage first, so a returning player whose copy is current
// never asks the server for it again — the fix for the box being hammered by ~104 MB of art on every cold load. The
// page (js/assetCache.js) owns the policy: it registers this worker, decides which files to pre-cache against
// GET /asset-index.json, and deletes the whole cache when the server's art revision changes. This worker only
// implements the cache-first fetch, so it stays tiny and cannot break the app if it fails.
//
// Deliberately NOT cached: Range requests (a partial audio/video request must reach the origin), non-GET, and any
// origin but our own (a local asset source, when one is used, is fetched by the page instead — see assetCache.js).

const CACHE = 'sp-assets';
const PREFIXES = ['/assets/', '/fonts/', '/vendor/'];

/** @param {URL} url */
function isCacheable(url) {
  return url.origin === self.location.origin && PREFIXES.some((p) => url.pathname.startsWith(p));
}

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return; // Range/partial requests always hit the network
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (!isCacheable(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    // Only cache a clean, complete, readable response; never an error, a redirect, or the index itself.
    if (res && res.ok && res.status === 200 && (res.type === 'basic' || res.type === 'default')) {
      try { await cache.put(req, res.clone()); } catch { /* over quota: keep serving from network */ }
    }
    return res;
  })());
});

self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'clear') event.waitUntil(caches.delete(CACHE));
});
