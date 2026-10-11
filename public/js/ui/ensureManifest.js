// public/js/ui/ensureManifest.js — keep the PWA manifest linked even when the page was served an outdated
// index.html.
//
// The 添加到桌面 install button (ui/install.js) only appears once the browser offers an install, which needs the
// page to link an installable manifest (public/manifest.json + public/icons/*). A deploy that copies public/js and
// public/css but not public/index.html would leave the manifest unlinked, so the browser never offers the install and
// the button silently stays hidden — the same stale-index.html hazard the 统计数据 stylesheet hit (production
// 2026-10: the served index.html was missing the stats.css <link>, ui/ensureStylesheet.js). The boot calls
// `ensureManifestLink('/manifest.json')` so a stale index.html cannot re-introduce that state.
//
// Best-effort, dependency-free and injectable (a Document, or a fake in tests), like ui/ensureStylesheet.js: a fresh
// page that already links the manifest is untouched.
//
// Caveat: re-linking from script runs after the browser's first installability pass, so it repairs the persistent
// state (and a later re-check / reload) rather than guaranteeing an offer on this same load; the source of truth is
// still the <link> in public/index.html.

/**
 * Add `<link rel="manifest" href=href>` to the document head unless a manifest link is already present. Idempotent;
 * a no-op (returns false) without a usable document (Node unit tests, a non-DOM host).
 * @param {string} href the served manifest path, e.g. '/manifest.json'
 * @param {Document} [doc]
 * @returns {boolean} whether a <link> was added
 */
export function ensureManifestLink(href = '/manifest.json', doc = globalThis.document) {
  if (typeof href !== 'string' || !href) return false;
  if (!doc?.head || typeof doc.head.appendChild !== 'function' || typeof doc.createElement !== 'function') return false;
  const have = typeof doc.querySelector === 'function' ? doc.querySelector('link[rel="manifest"]') : null;
  if (have) return false;
  const link = doc.createElement('link');
  link.rel = 'manifest';
  link.setAttribute('href', href);
  doc.head.appendChild(link);
  return true;
}
