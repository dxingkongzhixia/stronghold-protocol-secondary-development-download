// preload.js — boot-time art preloading (docs/ASSETS.md).
//
// Warm the browser's HTTP cache for the SMALL image set the lobby / shop / team / loadout UI draws, so entering a
// screen does not pop images in. Heavy art (Spine models, operator portraits, audio, the 3D board) still loads on
// demand: preloading every image in the manifest is ~155 MB (portraits alone ~30 MB, UI ~39 MB), which on the server's
// uplink would make first entry wait a minute. Scopes:
//   'icons' (default) — operator avatars + enemy / token / item / skill / band / bond / prof icons (~26 MB, ~10 s at 20 Mbps)
//   'ui'              — the above + UI sprites (~+39 MB)
//   'all'             — the above + operator portraits (~+30 MB)
//
// Pure at import time (no DOM): `collectArtUrls` is unit-testable in Node; only `preloadImages` touches `Image`.

import { t } from '../../shared/i18n.js';
import { clipUrl } from '../../shared/clip.js';
import { nextMirrorCandidate } from './assetMirror.js';

/**
 * Optional boot background video (a distraction while the first-load preload runs). `null` disables it. Two kinds:
 *   { kind: 'file', src: '/assets/loading/boot.mp4' } — a self-hosted clip shown muted / looped / autoplay, with NO
 *                                                        controls (not seekable, not draggable — pure background)
 *   { kind: 'bilibili', bvid: 'BV…', page: 1 }        — embeds the Bilibili player (needs internet; interactive)
 */
export const BOOT_VIDEO = { kind: 'file', src: clipUrl('boot', 2) }; // the extension-less /clip/ route (shared/clip.js):
// download managers hijack a URL ending in .mp4 and a stolen response leaves the boot screen without its clip.
// Bump the `?v=` when the file changes: the route serves it immutable for a year (server/http/files.js).

const IMG_RE = /\.(png|webp|jpg|jpeg|gif|avif)$/i;

/** An image URL from the manifest (spine atlases/PNGs excluded). Accepts a bare path (`/assets/…`) and the mirror URL
 * of one (`https://<mirror>/…/public/assets/…`), which is what a manifest carries once the prefix is installed — the
 * rewrite happens at load, so this must accept both or the boot preload list comes back empty (measured 2026-10-14: the
 * prefix arrived after the manifest was already cached). Bare filenames that are not real URLs are ignored. */
export function isArtImage(u) {
  if (typeof u !== 'string' || !u) return false;
  const s = u.split('?')[0];
  if (!IMG_RE.test(s) || /\/spine\//.test(s)) return false;
  return s.startsWith('/assets/') || (/^https?:\/\//i.test(s) && s.includes('/assets/'));
}

/**
 * The image URLs to preload for a boot preloader.
 * @param {any} manifest data/assets.json
 * @param {'icons'|'ui'|'all'} [scope]
 * @returns {string[]} de-duplicated URLs
 */
export function collectArtUrls(manifest, scope = 'icons') {
  const m = manifest && typeof manifest === 'object' ? manifest : {};
  const out = new Set();
  const walk = (node) => {
    if (typeof node === 'string') { if (isArtImage(node)) out.add(node); return; }
    if (Array.isArray(node)) { for (const x of node) walk(x); return; }
    if (node && typeof node === 'object') for (const v of Object.values(node)) walk(v);
  };
  // operator avatars (small) — portraits are big, only in 'all'
  for (const r of Object.values(m.chars || {})) { if (isArtImage(r.avatar)) out.add(r.avatar); if (isArtImage(r.avatarE2)) out.add(r.avatarE2); }
  // icon sets
  for (const top of ['enemies', 'tokens', 'items', 'skills', 'bands', 'bonds', 'prof']) {
    for (const r of Object.values(m[top] || {})) walk(r);
  }
  if (scope === 'ui' || scope === 'all') for (const v of Object.values(m.ui || {})) { if (isArtImage(v)) out.add(v); }
  if (scope === 'all') for (const r of Object.values(m.chars || {})) { if (isArtImage(r.portrait)) out.add(r.portrait); if (isArtImage(r.portraitE2)) out.add(r.portraitE2); }
  return [...out];
}

/**
 * Preload images through `new Image()` (a cache hit fires onload at once). A failed image counts as done, so progress
 * always completes. Returns `{ promise, cancel }`; `cancel` stops launching new loads (in-flight ones finish).
 * @param {string[]} urls
 * @param {{ concurrency?: number, onProgress?: (done: number, total: number) => void }} [opts]
 * @returns {{ promise: Promise<{ done: number, total: number, aborted: boolean }>, cancel: () => void }}
 */
export function preloadImages(urls, { concurrency = 8, onProgress } = {}) {
  const list = Array.isArray(urls) ? urls : [];
  const total = list.length;
  let cancelled = false;
  let done = 0;
  let next = 0;
  let active = 0;
  let resolveFn = () => {};
  const promise = new Promise((res) => { resolveFn = res; });
  const settle = () => { if ((cancelled || next >= total) && active === 0) resolveFn({ done, total, aborted: cancelled }); };
  const launch = () => {
    while (!cancelled && active < concurrency && next < total) {
      const url = list[next++];
      active++;
      const img = new Image();
      // A failed origin falls through the chain (js/assetMirror.js mirrorCandidates): the relay, then GitHub and its
      // mirrors, then this server — the same order the <img> fallback uses.
      let current = url;
      const onEnd = () => {
        const fallback = nextMirrorCandidate(current);
        if (fallback) { current = fallback; try { img.src = fallback; return; } catch { /* fall through */ } }
        img.onload = img.onerror = null;
        active--;
        done++;
        try { onProgress?.(done, total); } catch { /* ignore */ }
        launch();
        settle();
      };
      img.onload = onEnd;
      img.onerror = onEnd;
      try { img.src = url; } catch { onEnd(); }
    }
    settle();
  };
  if (!total) { resolveFn({ done: 0, total: 0, aborted: false }); return { promise, cancel() {} }; }
  launch();
  return { promise, cancel: () => { cancelled = true; settle(); } };
}

/**
 * Build the boot-progress callback for `preloadImages`: paint the bar and update the `done / total` line. Lives here
 * (not inline in main.js) so it is unit-testable with fake elements, and so the total can never shadow the i18n `t`:
 * the bug was `onProgress: (d, t) => { fill.style.width = …; t('正在加载美术资源 {d} / {t}', { d, t }) }` — `t` was the
 * running total, so the call threw, and the numerator stayed 0 while `fill.style.width` (set first) kept advancing.
 * @param {{ fill?: { style: any }, sub?: { textContent: string } }} [els]
 * @returns {(done: number, total: number) => void}
 */
export function artProgressReporter({ fill, sub } = {}) {
  return (done, total) => {
    const n = Number(total) || 0;
    if (fill) fill.style.width = `${n ? Math.round((done / n) * 100) : 0}%`;
    if (sub) sub.textContent = t('正在加载美术资源 {d} / {t}', { d: done, t: n });
  };
}
