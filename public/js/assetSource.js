// public/js/assetSource.js — the optional "use a local copy" source. docs/OUR-FEATURES.md "local asset cache".
//
// These are web players, but many also run the game on their own machine (the Windows portable bundle). When the page
// is served by the public box and the same app also answers on 127.0.0.1, the art can come from the local machine —
// the public box is not touched at all. Opt-in (设置), best-effort: the local server answers GET /asset-index.json
// (CORS *) with the SAME art revision as the public server, and the Service Worker (public/sw.js) then fetches the
// cacheable paths from there. Anything unexpected ⇒ no local source, the normal server is used.

const PREF = 'sp.pref.assetLocalSource';
const CANDIDATES = ['http://127.0.0.1:3000', 'http://localhost:3000'];

function readPref(fallback) {
  try { const raw = globalThis.localStorage?.getItem(PREF); return raw == null ? fallback : JSON.parse(raw); } catch { return fallback; }
}
function writePref(value) { try { globalThis.localStorage?.setItem(PREF, JSON.stringify(value)); } catch { /* ignore */ } }

/** Whether the player asked to prefer a local copy (off by default). */
export function localSourceEnabled() { return readPref(false) === true; }
/** @param {boolean} on */
export function setLocalSourceEnabled(on) { writePref(!!on); }

/**
 * Find a local origin serving the SAME art revision as the page's server, or ''.
 * @param {{ remoteRevision?: string, candidates?: string[], timeoutMs?: number, fetchFn?: typeof fetch }} [o]
 * @returns {Promise<string>} the base (e.g. 'http://127.0.0.1:3000'), or '' when none matches
 */
export async function probeLocalBase({ remoteRevision, candidates = CANDIDATES, timeoutMs = 800, fetchFn = globalThis.fetch } = {}) {
  if (!remoteRevision) return '';
  for (const base of candidates) {
    try {
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      const res = await fetchFn(`${base}/asset-index.json`, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
      if (timer) clearTimeout(timer);
      if (!res || !res.ok) continue;
      const idx = await res.json();
      if (idx && idx.revision && idx.revision === remoteRevision) return base;
    } catch { /* not there / different app: next candidate */ }
  }
  return '';
}
