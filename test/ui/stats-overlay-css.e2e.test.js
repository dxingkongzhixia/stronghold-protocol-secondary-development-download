// Browser E2E regression for the production-only 统计数据 overlay bug (2026-10): the served public/index.html was
// missing the /css/screens/stats.css <link> while every JS/CSS file beside it was byte-identical to the repo, so the
// overlay kept its default block layout — its top bar (导出 / 导入 / 清空) rendered inline at the top-left over the
// still-visible lobby, while the stats content flowed behind/under it. Production held 4 server rows (a NON-EMPTY list)
// and the reporter's local page was empty; the difference is the stylesheet, not the list (the leak reproduces with an
// empty list too — see test/e2e/out and the repro notes). ui/ensureStylesheet.js re-links the stylesheet at boot/open,
// so a stale index.html can no longer wedge the overlay.
//
// Opt-in (puppeteer-core + system Chrome + a real server): SP_E2E=1 node --test test/ui/stats-overlay-css.e2e.test.js
// For a non-empty `sp.pref.stats`, served an index.html WITHOUT the stats.css <link>, it asserts the overlay is the
// fixed full-screen dialog (`.st { position: fixed; inset: 0 }`), `.sp-stats-open` is on <html> (so the lobby behind is
// `visibility: hidden`), stats.css was linked at runtime, and the non-empty 总览 cards actually render. The same with
// the normal index.html, plus: a fresh load never opens the overlay on its own (there is no persisted open flag).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRealServer, hasChrome, CHROME } from '../e2e/client.mjs';
import { buildRecord, STATS_VERSION } from '../../public/js/ui/stats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENABLED = process.env.SP_E2E === '1' && hasChrome();
const FIX = JSON.parse(readFileSync(path.join(ROOT, 'test/fixtures/stats-results.json'), 'utf8'));
const BANDS = Object.keys(JSON.parse(readFileSync(path.join(ROOT, 'data/bands.json'), 'utf8')));
const NOW = Date.parse('2026-10-08T21:30:00');

/** 4 settled records (production held 4 server rows), newest first — 4 games, 2 wins, 50% for the self player. */
function seed(n = 4) {
  const recs = [];
  const names = ['solo-normal', 'coop4-hard', 'coop4-abyss'];
  for (let i = 0; i < n; i++) {
    const res = JSON.parse(JSON.stringify(FIX[names[i % 3]]));
    const solo = i % 3 === 0;
    const win = i % 2 === 0;
    Object.assign(res, { seed: 1000 + i, difficulty: ['FUNNY', 'NORMAL', 'HARD', 'ABYSS'][i % 4], modeId: `mode_${solo ? 'single' : 'multi'}_${['funny', 'normal', 'hard', 'abyss'][i % 4]}`, victory: win, reason: win ? 'victory' : 'defeat', roundsPassed: 6 + i, durationMs: (8 + i) * 60000 });
    const me = res.players.find((p) => p.playerId === 'p_0');
    Object.assign(me, { bandId: BANDS[i % 7], victory: win, alive: win, roundsPassed: 6 + i });
    recs.unshift(buildRecord(res, { myId: 'p_0', roomMode: solo ? 'solo' : 'coop', now: NOW - i * 3600e3 }));
  }
  return JSON.stringify({ v: STATS_VERSION, records: recs });
}

const INDEX = readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const STALE_INDEX = INDEX.replace(/^\s*<link rel="stylesheet" href="\/css\/screens\/stats\.css" \/>\r?\n/m, '');
if (STALE_INDEX === INDEX) throw new Error('the test needs public/index.html to link stats.css (replace the line)');

describe('统计数据 overlay with a stale index.html (real server, headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let puppeteer;
  const browsers = [];

  before(async () => {
    puppeteer = (await import('puppeteer-core')).default;
    srv = await startRealServer();
  });
  after(async () => { for (const b of browsers) await b.close(); await srv?.stop(); });

  /** A fresh browser at srv.base with `sp.pref.stats` seeded before the page loads; `stale` serves index.html without the stats.css <link>. */
  async function open({ stale = false, stored = null } = {}) {
    const browser = await puppeteer.launch({
      executablePath: CHROME, headless: true, protocolTimeout: 90000,
      args: ['--no-sandbox', '--mute-audio', '--force-device-scale-factor=1'],
    });
    browsers.push(browser);
    const [first] = await browser.pages();
    const page = first || await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    // The boot-time art preload (~100 MB) is irrelevant here; drop images so the page reaches the lobby fast.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.resourceType() === 'image') { req.abort().catch(() => {}); return; }
      const url = req.url();
      if (stale && req.isNavigationRequest() && (url === `${srv.base}/` || url === `${srv.base}/index.html`)) {
        req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: STALE_INDEX }).catch(() => {});
      } else {
        req.continue().catch(() => {});
      }
    });
    await page.evaluateOnNewDocument((stored) => {
      localStorage.setItem('sp.name', 'Doctor');
      sessionStorage.setItem('sp.entered', '1');
      if (stored) localStorage.setItem('sp.pref.stats', stored);
    }, stored);
    await page.goto(`${srv.base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!document.querySelector('.screen'), { timeout: 60000 });
    return page;
  }

  const openStats = async (page) => {
    await page.click('.lobby-screen .topbar__right .me-chip');
    await page.waitForSelector('.st .st-tab', { visible: true, timeout: 15000 });
    // Preact runs the overlay's effects after paint: wait for the mounted marker and the loaded overview.
    await page.waitForFunction(() => document.documentElement.classList.contains('sp-stats-open'), { timeout: 15000 });
    await page.waitForSelector('.st-card__num', { timeout: 15000 });
  };

  /** Everything the overlay's correctness hinges on. */
  const state = (page) => page.evaluate(() => {
    const st = document.querySelector('.st');
    const rec = st.getBoundingClientRect();
    return {
      position: getComputedStyle(st).position,
      covers: Math.round(rec.width) === innerWidth && Math.round(rec.height) === innerHeight,
      htmlClass: document.documentElement.className,
      screenVisibility: getComputedStyle(document.querySelector('.screen')).visibility,
      cards: [...document.querySelectorAll('.st-card__num')].map((e) => e.textContent.trim()),
      empty: !!document.querySelector('.st-body .st-empty'),
      cssLinked: [...document.styleSheets].some((s) => (s.href || '').endsWith('/css/screens/stats.css')),
    };
  });

  const describeState = (s) => `position=${s.position} covers=${s.covers} lobby=${s.screenVisibility} cards=${JSON.stringify(s.cards)}`;

  test('a stale index.html (no stats.css) with a NON-EMPTY list is still a fixed overlay over a hidden lobby', async () => {
    const page = await open({ stale: true, stored: seed(4) });
    await openStats(page);
    const s = await state(page);
    assert.equal(s.cssLinked, true, `stats.css was re-linked at runtime (ui/ensureStylesheet.js) — ${describeState(s)}`);
    assert.equal(s.position, 'fixed', `.st is the fixed overlay, not the inline block that leaked over the lobby — ${describeState(s)}`);
    assert.ok(s.covers, `.st covers the viewport — ${describeState(s)}`);
    assert.match(s.htmlClass, /sp-stats-open/, `the screen behind is marked hidden — ${describeState(s)}`);
    assert.equal(s.screenVisibility, 'hidden', `the lobby is hidden behind the overlay — ${describeState(s)}`);
    assert.equal(s.empty, false, `the non-empty list rendered (not the empty state) — ${describeState(s)}`);
    assert.deepEqual(s.cards.slice(0, 3), ['4', '2', '50%'], `the 总览 cards render the 4 records — ${describeState(s)}`);
  });

  test('the normal index.html (stats.css linked) keeps working, non-empty too', async () => {
    const page = await open({ stale: false, stored: seed(4) });
    await openStats(page);
    const s = await state(page);
    assert.equal(s.position, 'fixed', describeState(s));
    assert.equal(s.screenVisibility, 'hidden', describeState(s));
    assert.deepEqual(s.cards.slice(0, 3), ['4', '2', '50%'], describeState(s));
  });

  test('a fresh load never opens the overlay on its own (no persisted open flag to wedge it)', async () => {
    const page = await open({ stale: true, stored: seed(4) });
    assert.equal(await page.$('.st'), null, 'the stats overlay must not be restored from stale localStorage');
    assert.doesNotMatch(await page.evaluate(() => document.documentElement.className), /sp-stats-open/);
  });
});
