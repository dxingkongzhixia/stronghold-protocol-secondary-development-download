// public/js/assetMirror.js — the CDN-mirror prefix for the art manifests (docs/OUR-FEATURES.md §4).
//
// Why: the box's uplink is small and a cold load preloads ~104 MB of art. `/asset-index.json` already hands the local
// asset cache two CDN mirrors (gh-proxy, jsDelivr) that are tried before this server — but that path only runs inside
// the pre-cache, which needs a Service Worker (HTTPS). This module lets the *normal* loading use the mirrors too, by
// prefixing the manifest's image URLs. A path prefix keeps every relative relationship intact (a Spine atlas and its
// pages, a scene and its bundle), which a `blob:` URL would break — that is why the flat, fetch-only files (audio, the
// scene bundles) go through the IndexedDB layer instead, and why the Spine models are left to the mirror or the
// server.
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

let prefix = '';
/** Does the installed prefix reimplement the game's extension-less routes (/media, /scene, /clip) beside the files? */
let fullOrigin = false;

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
/** @param {string} base @param {boolean} [full] */
export function setMirrorPrefix(base, full = false) {
  prefix = typeof base === 'string' ? base : '';
  fullOrigin = !!prefix && !!full;
}

/**
 * Pure: the same-origin path behind a mirror URL this page installed, or null. The inverse of `mirrorUrl` — the `?h=`
 * hash comes back as the `~<hash>` serving segment.
 * @param {string} url
 * @returns {string|null}
 */
export function unmirrorUrl(url) {
  if (typeof url !== 'string' || !prefix || !url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  const at = rest.indexOf('?h=');
  const hash = at >= 0 ? rest.slice(at + 3) : '';
  const plain = at >= 0 ? rest.slice(0, at) : rest;
  if (ROUTE_RE.test(plain)) return plain;      // /media/…, /scene/…, /clip/… — the route carries no serving hash
  if (!plain.startsWith('/assets/')) return null;
  return hash ? `/assets/~${hash}${plain.slice('/assets'.length)}` : plain;
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
    if (!el || el.tagName !== 'IMG' || el.dataset?.spMirrorRetry) return;
    const local = unmirrorUrl(el.currentSrc || el.src);
    if (!local) return;
    if (el.dataset) el.dataset.spMirrorRetry = '1';
    el.src = local;
  }, true);
  return true;
}

/**
 * Pick the first mirror that answers and install it as the prefix. Never throws: any failure leaves the prefix empty
 * (the page keeps using this server).
 * @param {{ fetchFn?: typeof fetch, hostname?: string, timeoutMs?: number, mirrorsUrl?: string, path?: string }} [o]
 * @returns {Promise<string>} the installed prefix ('' when none)
 */
export async function initAssetMirror({
  fetchFn = globalThis.fetch, hostname = globalThis.location?.hostname, timeoutMs = PROBE_TIMEOUT_MS,
  mirrorsUrl = MIRRORS_URL, path = MIRRORS_URL,
} = {}) {
  setMirrorPrefix('');
  if (!fetchFn || DEV_HOSTS.includes(hostname)) return '';
  try {
    const res = await fetchFn(mirrorsUrl, { cache: 'no-cache' });
    if (!res || !res.ok) return '';
    const cfg = await res.json();
    const sources = cfg && Array.isArray(cfg.sources) ? cfg.sources.filter((s) => typeof s === 'string' && s) : [];
    const full = new Set(cfg && Array.isArray(cfg.fullSources) ? cfg.fullSources : []);
    for (const base of sources) {
      try {
        const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = ctrl && timeoutMs > 0 ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
        const probe = await fetchFn(mirrorUrl(base, path), { cache: 'no-cache', signal: ctrl ? ctrl.signal : undefined });
        if (timer) clearTimeout(timer);
        if (probe && probe.ok) { setMirrorPrefix(base, full.has(base)); return base; }
      } catch { /* blocked / slow: the next source */ }
    }
  } catch { /* no config / bad JSON: keep the server */ }
  return '';
}
