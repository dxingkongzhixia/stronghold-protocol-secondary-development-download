// public/js/assetMirror.js — the CDN-mirror prefix for the art manifests (docs/OUR-FEATURES.md §4).
//
// Why: the box's uplink is small and a cold load preloads ~135 MB of art (`collectArtUrls(manifest, 'all')`). This
// module picks the origin those URLs are rewritten to (a path prefix, so a Spine atlas and its pages, or a scene and its
// bundle, stay together — a `blob:` URL would break them) and keeps the rest of the chain behind it. Since 2026-10-15
// the choice is by **measured throughput**, not by "who answers first": the owner's relay is kept only while it clears
// 1.2 MB/s, otherwise a GitHub mirror gets its turn (1.0 MB/s bar), and when nobody does the page stays on this server.
//
// Only images are rewritten here:
//   * the audio goes through the server's extension-less `/media/` route on purpose (download managers hook media
//     URLs — `shared/media.js`), and
//   * the Spine models and the scene bundles are fetched by their own loaders (the IndexedDB layer's job).
//
// Everything is opt-out-safe: no config, no mirror answering, or a dev origin leaves every URL untouched, so the page
// behaves exactly as before.

import { splitHashedPath } from '../../shared/assetPaths.js';

/** The mirror list the client reads (a static file: deploying it needs no restart). */
export const MIRRORS_URL = '/asset-mirrors.json';
/** Image extensions the mirror may serve (the same rule `preload.js` preloads). */
export const IMG_RE = /\.(png|webp|jpg|jpeg|gif|avif)$/i;
/** The game's extension-less asset routes (`shared/{media,scene,clip}.js`): only a FULL origin reimplements them. */
export const ROUTE_RE = /^\/(?:media|scene|clip)\//;
/** Origins that never use a mirror (a dev server / the portable bundle's own copy). */
export const DEV_HOSTS = Object.freeze(['localhost', '127.0.0.1', '::1', '']);
/** One probe per mirror: a HEAD is enough and the mirrors answer CORS. */
export const PROBE_TIMEOUT_MS = 4000;

/** The samples every origin is timed on: six committed operator portraits (~110 KB each, stable official names, present
 *  on the relay, the GitHub mirrors and this server). They are fetched **in parallel** — the same way the boot preload
 *  pulls art — so the measured rate is the throughput a player actually gets, not one stream's latency. */
export const SPEED_SAMPLES = Object.freeze([
  '/assets/char/portrait/char_003_kalts_1.png',
  '/assets/char/portrait/char_010_chen_1.png',
  '/assets/char/portrait/char_103_angel_1.png',
  '/assets/char/portrait/char_140_whitew_1.png',
  '/assets/char/portrait/char_199_yak_1.png',
  '/assets/char/portrait/char_150_snakek_1.png',
]);
/** The first sample (kept for callers/tests that name one path). */
export const SPEED_SAMPLE_PATH = SPEED_SAMPLES[0];
/** A FULL origin (the owner's relay: files + the /media,/scene,/clip routes) must clear this to stay first. */
export const RELAY_MIN_BPS = 1.2 * 1024 * 1024; // 1.2 MB/s
/** A plain-file mirror (gh-proxy / jsDelivr) must clear this to be used at all. */
export const MIRROR_MIN_BPS = 1.0 * 1024 * 1024; // 1.0 MB/s
/** Per-source probe budget, and the per-file byte cap that ends a fast one early. */
export const SPEED_TIMEOUT_MS = 2500;
export const SPEED_BYTE_CAP = 400 * 1024;
/** How long a measurement is reused. The probe costs ~650 KB per source, so a fresh reading is reused for two minutes —
 *  a relay that drops under its bar is still caught within the window (and a hard failure walks the chain at once). */
export const SPEED_CACHE_MS = 2 * 60 * 1000;
const SPEED_PREF = 'sp.mirror.speed';

/** Pure: the rate of a timed download in bytes per second (0 when nothing arrived). */
export const rateOf = (bytes, ms) => (bytes > 0 && ms > 0 ? (bytes * 1000) / ms : 0);

/**
 * Pure: the origin to install, from the candidates in configured order with their measured rate. The **first** one that
 * clears its own bar wins — a full origin (the relay) `relayMin`, a plain-file mirror `mirrorMin`; when none does, the
 * chain keeps the game server (''). Order matters: the relay is only kept while it is actually fast enough, otherwise
 * the GitHub mirrors get their turn, and their failure falls through to this server.
 * @param {{ base: string, full?: boolean, bps: number }[]} measured
 * @param {{ relayMin?: number, mirrorMin?: number }} [o]
 * @returns {string}
 */
export function pickMirror(measured, { relayMin = RELAY_MIN_BPS, mirrorMin = MIRROR_MIN_BPS } = {}) {
  for (const m of Array.isArray(measured) ? measured : []) {
    if (!m || typeof m.base !== 'string' || !m.base) continue;
    if (m.bps >= (m.full ? relayMin : mirrorMin)) return m.base;
  }
  return '';
}

/** Time one origin on the sample: bytes received within the budget (a partial read is enough to judge). */
/** Read one sample, stopping at the byte cap or the budget. Returns the bytes read; never throws. */
async function readCapped(url, fetchFn, budgetMs, cap = SPEED_BYTE_CAP) {
  const t0 = Date.now();
  let timer = null;
  try {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    timer = ctrl && budgetMs > 0 ? setTimeout(() => ctrl.abort(), budgetMs + 500) : null;
    const res = await fetchFn(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
    if (!res || !res.ok) return 0;
    let bytes = 0;
    const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
    if (reader) {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value && value.byteLength ? value.byteLength : 0;
        if (bytes >= cap || Date.now() - t0 >= budgetMs) break;
      }
      try { await reader.cancel(); } catch { /* ignore */ }
    } else {
      bytes = (await res.arrayBuffer()).byteLength;
    }
    return bytes;
  } catch { return 0; } finally { if (timer) clearTimeout(timer); }
}

/**
 * Time one origin the way a player actually loads it: every sample is fetched **in parallel** (the boot preload pulls
 * art 8 at a time) and the aggregate bytes over the wall-clock time is the throughput. A single small file would
 * measure the round-trip latency instead of the bandwidth — that is what made a fixed relay look slower than it is.
 */
async function measureSource(base, fetchFn, samples, budgetMs) {
  const list = Array.isArray(samples) ? samples : [samples];
  const t0 = Date.now();
  const parts = await Promise.all(list.map((s) => readCapped(base + s, fetchFn, budgetMs)));
  const bytes = parts.reduce((a, b) => a + b, 0);
  return rateOf(bytes, Date.now() - t0);
}

/** The cached measurement of a previous visit (same origin list, still within `ttlMs`), or null. A ttl of 0 disables
 *  the reuse entirely — the relay is measured again on every load, so a drop below its bar is caught at once. */
function readSpeedCache(list, ttlMs) {
  if (!(ttlMs > 0)) return null;
  try {
    const raw = globalThis.localStorage?.getItem(SPEED_PREF);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || !Array.isArray(c.list) || !Array.isArray(c.measured)) return null;
    if (c.list.join('|') !== list.join('|')) return null;
    if (!(Date.now() - (c.at || 0) < ttlMs)) return null;
    return c.measured;
  } catch { return null; }
}

function writeSpeedCache(list, measured) {
  try { globalThis.localStorage?.setItem(SPEED_PREF, JSON.stringify({ at: Date.now(), list, measured })); } catch { /* private mode */ }
}

let prefix = '';
/** Does the installed prefix reimplement the game's extension-less routes (/media, /scene, /clip) beside the files? */
let fullOrigin = false;
/** Every configured origin, best first (the list from /asset-mirrors.json), so a failed fetch can try the next one. */
let sources = [];

/**
 * Pure: may the mirror serve this manifest path? Images under `/assets/` only — a query string (the `?v=` preload uses)
 * is kept out, and the `/media/` audio route is never rewritten.
 * @param {unknown} path
 * @returns {boolean}
 */
export function isMirrorable(path) {
  if (typeof path !== 'string' || !path.startsWith('/assets/')) return false;
  if (path.includes('?') || path.includes('/media/')) return false;
  // Images only. A Spine `.skel`/`.atlas` must stay a root-relative path: `assets.js validSpine` requires a path that
  // ends in `.skel` (and pixi-spine derives the atlas from it by swapping the extension), while a mirrored URL carries
  // a `?h=` query — mirroring them returned "no spine entry", so every unit fell back to its placeholder diamond
  // (owner report 2026-10-14). They are small files; the operator's atlas PAGES are images and ride along wherever the
  // atlas resolves from.
  return IMG_RE.test(path);
}

/**
 * The mirror URL of one of the game's extension-less asset routes — the audio (`/media/…`), a battlefield scene bundle
 * (`/scene/<id>/{meta,bin}`) or the boot clip (`/clip/boot`) — or the path unchanged. Only a **full origin** may carry
 * these: one that reimplements the routes beside the plain files (the owner's relay does; gh-proxy and jsDelivr serve
 * files only). A no-op until such an origin answers, so the client is safe with the free CDNs alone.
 * @param {string} path
 * @returns {string}
 */
export function mirrorRouteUrl(path) {
  if (typeof path !== 'string' || !path || !prefix || !fullOrigin) return path;
  if (!ROUTE_RE.test(path)) return path;
  return prefix + path;
}

/**
 * Pure: the mirror URL of a manifest path. The `~<hash>` segment is this server's serving trick (shared/assetPaths.js)
 * and is not a file name, so it is stripped — and the hash is carried along as a query instead: the CDN caches an
 * image for a week (jsDelivr's `max-age=604800`), so a URL without it could serve a stale image after an update. A
 * query is safe here because only images are rewritten (a Spine atlas and its pages are never), and each content
 * version then has its own URL.
 * @param {string} base a source prefix ending at the repo's `public/`
 * @param {string} path
 * @returns {string}
 */
export function mirrorUrl(base, path) {
  const { hash, path: plain } = splitHashedPath(path);
  return base + plain + (hash ? `?h=${hash}` : '');
}

/**
 * Pure: a deep copy of `value` with every mirrorable string replaced by its mirror URL. Arrays, plain objects and
 * strings are walked; anything else is returned as is.
 * @param {unknown} value
 * @param {string} base
 * @returns {unknown}
 */
export function rewriteAssetPaths(value, base) {
  if (typeof value === 'string') return isMirrorable(value) ? mirrorUrl(base, value) : value;
  if (Array.isArray(value)) return value.map((v) => rewriteAssetPaths(v, base));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = rewriteAssetPaths(v, base);
    return out;
  }
  return value;
}

/** The active mirror prefix ('' = this server). */
export function mirrorPrefix() { return prefix; }
/** Is the active prefix a full origin (it also answers /media, /scene, /clip)? */
export function mirrorIsFull() { return fullOrigin; }
/** @param {string} base @param {boolean} [full] @param {string[]} [list] the whole chain, for the fallback tiers */
export function setMirrorPrefix(base, full = false, list = null) {
  prefix = typeof base === 'string' ? base : '';
  fullOrigin = !!prefix && !!full;
  if (Array.isArray(list)) sources = list.filter((s) => typeof s === 'string' && s);
  else if (!prefix) sources = [];      // no origin installed: nothing to mirror, nothing to fall back through
}

/**
 * The canonical (same-origin) path behind a URL this page mirrored, or null. Strips any configured origin prefix; the
 * `?h=` hash comes back as the `~<hash>` serving segment. Accepts the extension-less routes too.
 * @param {string} url
 * @returns {string|null}
 */
export function unmirrorUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  for (const base of [prefix, ...sources]) {
    if (base && url.startsWith(base)) return plainPath(url.slice(base.length));
  }
  return null;
}

/** The path part of a mirrored URL, with the `?h=` hash turned back into the `~<hash>` segment. */
function plainPath(rest) {
  const at = rest.indexOf('?h=');
  const hash = at >= 0 ? rest.slice(at + 3) : '';
  const plain = at >= 0 ? rest.slice(0, at) : rest;
  if (ROUTE_RE.test(plain)) return plain;      // /media/…, /scene/…, /clip/… — the route carries no serving hash
  if (!plain.startsWith('/assets/')) return null;
  return hash ? `/assets/~${hash}${plain.slice('/assets'.length)}` : plain;
}

/**
 * The ordered fetch candidates for one plain-file asset (an image, or a file behind a route): the installed origin
 * first, then the other configured mirrors, and **this server last**. The owner's chain (2026-10-14): the Aliyun relay,
 * then GitHub and its mirrors, the game server only as the fallback. A URL that is already one of them is canonicalised
 * first, so the same list comes back however it is asked.
 * @param {string} url
 * @returns {string[]} at least one entry (the same-origin path)
 */
export function mirrorCandidates(url) {
  const plain = unmirrorUrl(url) || (typeof url === 'string' && url.startsWith('/') ? url : null);
  if (!plain) return typeof url === 'string' ? [url] : [];
  if (ROUTE_RE.test(plain)) return routeCandidates(plain);
  const out = [];
  for (const base of [prefix, ...sources]) if (base) out.push(mirrorUrl(base, plain));
  out.push(plain);
  return [...new Set(out)];
}

/** The candidates for an extension-less route: only a full origin answers one, so the last entry is this server. */
function routeCandidates(path) {
  const out = [];
  if (prefix && fullOrigin) out.push(prefix + path);
  out.push(path);
  return out;
}

/** The next origin to try after `url` failed, or null when this server is already the last one. */
export function nextMirrorCandidate(url) {
  const list = mirrorCandidates(url);
  const i = list.indexOf(String(url));
  return i >= 0 && i + 1 < list.length ? list[i + 1] : null;
}

/**
 * Keep the mirror best-effort: when an `<img>` whose URL this page mirrored fails to load (the mirror is blocked, rate
 * limited or lacks the file), it retries **once** from this server, the same URL the manifest carried before the
 * rewrite. A capture-phase `error` listener catches every `<img>`, including the ones a component rendered, so no
 * consumer needs its own fallback. Returns false when already installed.
 * @param {{ doc?: Document }} [o]
 */
export function installImageFallback({ doc = globalThis.document } = {}) {
  if (!doc || doc.__spMirrorFallback || typeof doc.addEventListener !== 'function') return false;
  doc.__spMirrorFallback = true;
  doc.addEventListener('error', (ev) => {
    const el = ev && ev.target;
    if (!el || el.tagName !== 'IMG') return;
    const src = el.currentSrc || el.src;
    const next = nextMirrorCandidate(src);
    if (!next) return;                       // this server was the last tier: let the placeholder stand
    if (el.dataset) el.dataset.spMirrorTier = String((Number(el.dataset.spMirrorTier) || 0) + 1);
    el.src = next;
  }, true);
  return true;
}

/**
 * Pick the origin the manifest URLs are rewritten to, by **measured throughput** instead of "who answers first": every
 * candidate is timed in parallel on one committed sample, and the first one clearing its bar wins — a FULL origin (the
 * relay) 1.2 MB/s, a plain-file mirror (gh-proxy / jsDelivr) 1.0 MB/s; when none clears its bar the page keeps using
 * this server. The **relay stays the first choice**, but it is measured on **every page load** (`cacheMs = 0` by
 * default): the moment it drops under its bar, the very next visit switches away from it. The whole configured list
 * stays available for the per-file error fallback. Never throws: any failure leaves the prefix empty.
 * @param {{ fetchFn?: typeof fetch, hostname?: string, timeoutMs?: number, mirrorsUrl?: string,
 *           samplePath?: string, speedMs?: number, cacheMs?: number }} [o]
 * @returns {Promise<string>} the installed prefix ('' when none)
 */
export async function initAssetMirror({
  fetchFn = globalThis.fetch, hostname = globalThis.location?.hostname, timeoutMs = PROBE_TIMEOUT_MS,
  mirrorsUrl = MIRRORS_URL, samples = SPEED_SAMPLES, speedMs = SPEED_TIMEOUT_MS, cacheMs = SPEED_CACHE_MS,
  relayMin = RELAY_MIN_BPS, mirrorMin = MIRROR_MIN_BPS,
} = {}) {
  setMirrorPrefix('');
  sources = [];
  if (!fetchFn || DEV_HOSTS.includes(hostname)) return '';
  const budget = speedMs > 0 ? Math.min(speedMs, timeoutMs > 0 ? timeoutMs : speedMs) : SPEED_TIMEOUT_MS;
  try {
    const res = await fetchFn(mirrorsUrl, { cache: 'no-cache' });
    if (!res || !res.ok) return '';
    const cfg = await res.json();
    const list = cfg && Array.isArray(cfg.sources) ? cfg.sources.filter((s) => typeof s === 'string' && s) : [];
    if (!list.length) return '';
    const full = new Set(cfg && Array.isArray(cfg.fullSources) ? cfg.fullSources : []);
    let measured = readSpeedCache(list, cacheMs);
    if (!measured) {
      // The FIRST source (the relay) answers the common case on its own; the rest are probed in parallel only when it
      // fails its bar, so a healthy relay costs one round of samples and a dead one still resolves within the budget.
      measured = [{ base: list[0], full: full.has(list[0]), bps: await measureSource(list[0], fetchFn, samples, budget) }];
      if (!pickMirror(measured, { relayMin, mirrorMin })) {
        const rest = list.slice(1);
        const rates = await Promise.all(rest.map((base) => measureSource(base, fetchFn, samples, budget)));
        rest.forEach((base, i) => measured.push({ base, full: full.has(base), bps: rates[i] }));
      }
      writeSpeedCache(list, measured);
    }
    sources = list;                                   // the whole chain, for the per-file fallback
    const chosen = pickMirror(measured, { relayMin, mirrorMin });
    if (chosen) setMirrorPrefix(chosen, full.has(chosen));
    return chosen || '';
  } catch { /* no config / bad JSON: keep the server */ }
  return '';
}
