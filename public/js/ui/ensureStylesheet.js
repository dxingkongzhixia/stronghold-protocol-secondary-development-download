// public/js/ui/ensureStylesheet.js — make a screen's stylesheet load even when the page was served an outdated
// index.html.
//
// Every screen's CSS is linked from public/index.html; a deploy that copies public/js and public/css but not
// public/index.html leaves the new screens unstyled. For 统计数据 (public/css/screens/stats.css) that is not cosmetic:
// the stylesheet makes the overlay `position: fixed` and hides the screen behind it
// (`.sp-stats-open .app-root > .screen { visibility: hidden }`). Without it the overlay keeps its default block layout,
// so its top bar (导出 / 导入 / 清空) renders inline in the top-left over the still-visible lobby (production 2026-10:
// the served index.html was missing the stats.css <link> while every JS/CSS file beside it was current — the exact
// "only the toolbar shows, the lobby is visible behind" report). A screen overlay calls `ensureStylesheet(href)` so a
// stale index.html can never wedge it that way.
//
// Kept dependency-free and injectable (a Document, or a fake in tests), like ui/buildGuard.js.

/**
 * Add `<link rel="stylesheet" href=href>` to the document head unless that stylesheet is already linked. Idempotent;
 * a no-op (returns false) without a usable document (Node unit tests, a non-DOM host).
 * @param {string} href the served path, e.g. '/css/screens/stats.css'
 * @param {Document} [doc]
 * @returns {boolean} whether a <link> was added
 */
export function ensureStylesheet(href, doc = globalThis.document) {
  if (typeof href !== 'string' || !href) return false;
  if (!doc?.head || typeof doc.head.appendChild !== 'function' || typeof doc.createElement !== 'function') return false;
  const selector = `link[rel="stylesheet"][href="${href.replace(/"/g, '\\"')}"]`;
  const have = typeof doc.querySelector === 'function' ? doc.querySelector(selector) : null;
  if (have) return false;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.setAttribute('href', href);
  doc.head.appendChild(link);
  return true;
}
