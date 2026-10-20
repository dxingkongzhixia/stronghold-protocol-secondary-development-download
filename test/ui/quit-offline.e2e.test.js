// The exit must survive a half-open socket (a tab that slept for a while): the leave requests can be "sent" with no
// reply, so quitMatch gives them LEAVE_REQUEST_TIMEOUT_MS each, clears the local room/match regardless, and drops the
// reconnect token if neither was confirmed (otherwise the next hello would resume the same seat).
//
//   SP_E2E=1 CHROME_PATH=… node --test test/ui/quit-offline.e2e.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);

let srv;
let browser;

before(async () => {
  if (!ENABLED) return;
  const { startServer } = await import('../../server/index.js');
  const puppeteer = (await import('puppeteer-core')).default;
  srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
});

after(async () => {
  await browser?.close();
  await srv?.close();
});

test('a half-open socket: quitMatch clears the match within its budget and drops the reconnect token',
  { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run', timeout: 20000 }, async () => {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${srv.port}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.gm__hud', { timeout: 30000 });
    const r = await page.evaluate(async () => {
      const { net, identity, NetError } = await import('/js/net.js');
      const { quitMatch, LEAVE_REQUEST_TIMEOUT_MS } = await import('/js/ui/matchChrome.js');
      let cleared = 0;
      let reconnects = 0;
      const clear = identity.clearToken;
      const reconnect = net.reconnectNow;
      identity.clearToken = () => { cleared += 1; };
      net.reconnectNow = () => { reconnects += 1; };
      // a dead socket: the request is sent, no reply arrives; the real client times it out at opts.timeout
      net.request = (t, f, opts) => new Promise((_, reject) => {
        setTimeout(() => reject(new NetError('TIMEOUT')), opts?.timeout ?? 8000);
      });
      const { store, selectRoute } = await import('/js/store.js');
      const t0 = performance.now();
      await quitMatch();
      const elapsed = performance.now() - t0;
      identity.clearToken = clear;
      net.reconnectNow = reconnect;
      return { elapsed, cleared, reconnects, timeout: LEAVE_REQUEST_TIMEOUT_MS,
        room: store.get().room, pub: store.get().match.public, route: selectRoute(store.get()) };
    });
    assert.ok(r.elapsed >= r.timeout * 2 - 100, `waited the two budgets (${Math.round(r.elapsed)} ms)`);
    assert.ok(r.elapsed < r.timeout * 2 + 1500, `did not exceed the budgets by much (${Math.round(r.elapsed)} ms)`);
    assert.equal(r.cleared, 1, 'the unconfirmed leave drops the token');
    assert.equal(r.reconnects, 1, 'and replaces the socket');
    assert.equal(r.room, null);
    assert.equal(r.pub, null);
    assert.equal(r.route, 'lobby');
    await page.close();
  });
