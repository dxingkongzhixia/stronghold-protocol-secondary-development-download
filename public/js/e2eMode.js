// public/js/e2eMode.js — `?e2e=1`: this page is driven by a headless browser test (test/ui/*.e2e.test.js).
//
// Two full-screen gates swallow a test's synthetic clicks and made unrelated suites fail as "the click did nothing":
// the entry film (ui/entryFilm.js, a <dialog> over the whole app) and the first-run 美术资源 prompt (ui/assetMode.js,
// a modal). Under this flag a page skips both; production pages never carry it. Everything else stays real — the
// server, the routes, the components, the event handlers.
//
// The flag is a query parameter, not an env var: the client is static, and a test may share one server among pages.

/** @param {string} [search] a location.search-like string @returns {boolean} */
export function e2eMode(search = globalThis.location?.search || '') {
  try { return new URLSearchParams(String(search)).get('e2e') === '1'; } catch { return false; }
}

/** The flag of this page (computed once at import). */
export const E2E = e2eMode();
