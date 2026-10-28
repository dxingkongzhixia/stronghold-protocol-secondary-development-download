// public/sw.js — the client's local asset cache (Service Worker). docs/OUR-FEATURES.md "local asset cache";
// the authoritative design is docs/ASSETS.md "Local asset cache & CDN mirror download chain".
//
// Cache-first for the art (/assets/, /fonts/, /vendor/). On a MISS it fetches from, in order: the player's own machine
// (localBase, when the page found one), then the server's /asset-index.json `sources` — the owner's own relay first,
// then the CDN mirrors (gh-proxy then jsDelivr) — each with a 15 s timeout and a byte-size check against the index, and
// only then the game server (which is rate-limited server-side, SP_ASSET_RATE_KBPS). This is what makes the server the
// true LAST RESORT — on-demand art (spine, audio, …) is offloaded too, not just the boot pre-cache. The page owns the
// policy (js/assetCache.js registers it, decides what to pre-cache and clears it).
//
// Deliberately NOT cached: Range requests, non-GET, and any origin but our own.

const CACHE = 'sp-assets';
const PREFIXES = ['/assets/', '/fonts/', '/vendor/'];
const MIRROR_TIMEOUT_MS = 15000;

/**
 * The mirrors do not always label bytes correctly: raw.githubusercontent serves `.css` / atlas text as `text/plain`,
 * and a browser refuses a stylesheet with a non-CSS type (the official statistics page loads `fonts.css` that way).
 * The extension is authoritative here, so a synthesized mirror response is relabelled from it.
 */
const MIME = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.atlas': 'text/plain; charset=utf-8',
  '.skel': 'application/octet-stream',
});

/** @param {string} pathname */
function typeOf(pathname) {
  const dot = pathname.lastIndexOf('.');
  return dot < 0 ? '' : MIME[pathname.slice(dot).toLowerCase()] || '';
}

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
/**
 * The served manifests carry a `~<contentHash>` segment as a cache-buster. The plain-file mirrors
 * (raw.githubusercontent / jsDelivr) have no such directory — only the relay and the game server strip the segment
 * (nginx / server/http/files.js) — so a miss asks every source for the REAL path and moves the hash into a `?h=`
 * query, exactly what the plain-HTTP path does. The worker still caches under the page's own request URL, so the
 * segment keeps busting its own cache.
 * @param {string} pathname @param {string} search
 */
function sourcePath(pathname, search) {
  const m = /\/~([0-9a-f]{6,})(?=\/)/i.exec(pathname);
  if (!m) return { missPath: pathname + search, plainPath: pathname };
  const plainPath = pathname.slice(0, m.index) + pathname.slice(m.index + m[0].length);
  return { missPath: `${plainPath}?h=${m[1]}`, plainPath };
}

async function handle(req, url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const { missPath, plainPath } = sourcePath(url.pathname, url.search);
  const idx = await ensureIndex();
  // The index keys are the real (unhashed) paths, so look the size up by the plain path — that is also what makes the
  // byte check run for a hashed request (it used to miss the key and skip the check).
  const want = idx && idx.files ? idx.files[plainPath] : null;
  for (const base of missSources(idx)) {
    try {
      const r = await fetchWithTimeout(base + missPath, MIRROR_TIMEOUT_MS);
      if (!r || !r.ok) continue;
      const buf = await r.arrayBuffer();
      if (want != null && buf.byteLength !== want) continue; // wrong / a lagging mirror ref → next source
      const headers = new Headers(r.headers);
      const type = typeOf(plainPath);
      if (type) headers.set('Content-Type', type);
      const res = new Response(buf, { status: 200, headers });
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
