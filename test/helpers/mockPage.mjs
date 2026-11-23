// test/helpers/mockPage.mjs — the one way a browser test opens the in-match mock harness.
//
// The failure this exists for (2026-11-23): `networkidle0` navigation on the mock page waits for the art preload and the
// remote-mirror probe, so on a cold cache or an offline machine it times out at 60 s even though the screen is ready.
// `openMock` waits for `domcontentloaded` and then for the screen itself — an explicit readiness gate, not the network.
//
// New e2e suites use it; existing ones move over as they are touched (docs/TESTING-PLAN.md 2.1). `localMirrors` answers
// `/asset-mirrors.json` with no sources so art comes from this server — call it only when the page has no interception of
// its own (two handlers would both continue the same request).

/** The mock page (public/dev/game-mock.html), same origin as `base`. */
export const MOCK_PATH = '/dev/game-mock.html';

/**
 * Open the mock harness and wait for the game screen.
 * @param {import('puppeteer-core').Page} page
 * @param {{ base: string, query?: string, ready?: string | null, timeout?: number, viewport?: { width: number, height: number } }} opts
 *   `query` is the `?…` part without the `?` (default: `shot=1&render=fallback&e2e=1&phase=PREP`); `ready` is the
 *   selector that means the screen is up (pass `null` to wait for nothing, e.g. a pre-game page with its own gate).
 * @returns {Promise<import('puppeteer-core').Page>}
 */
export async function openMock(page, { base, query = 'shot=1&render=fallback&e2e=1&phase=PREP', ready = '.screen:not(.gload)', timeout = 30000, viewport = null } = {}) {
  if (viewport) await page.setViewport(viewport);
  await page.goto(`${base}${MOCK_PATH}?${query}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (ready) await page.waitForSelector(ready, { timeout });
  return page;
}

/**
 * Serve an empty mirror list so every art URL stays on this server (no 5 × 15 s remote probes on an offline box).
 * Only for a page without its own request interception.
 * @param {import('puppeteer-core').Page} page
 */
export async function localMirrors(page) {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (/\/asset-mirrors\.json($|\?)/.test(req.url())) {
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ sources: [], fullSources: [] }) });
    }
    return req.continue();
  });
}
