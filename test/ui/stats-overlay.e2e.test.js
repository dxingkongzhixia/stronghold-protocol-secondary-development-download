// 统计数据 overlay, rebuilt for the hub (opt-in, needs Chrome, ~15 s):
//   SP_E2E=1 CHROME_PATH=… node --test test/ui/stats-overlay.e2e.test.js
//
// The original (stats-overlay-css.e2e.test.js, deleted 2026-11-23) guarded the production-only bug of 2026-10: a served
// public/index.html without the `/css/screens/stats.css` <link> left the overlay as an inline block over the still-visible
// lobby. ui/ensureStylesheet.js now re-links it at boot/open, and test/ui/ensureStylesheet.test.js pins that behaviour
// (a synthetic HTML document cannot boot the hub here: DevTools-fulfilled responses get Chrome's local-network-access
// checks on the /ws socket, so the hub never goes online). This e2e boots through test/helpers/appBoot.mjs (the 0.4.0
// title traps: the art mode prompt and the entry film), seeds a NON-EMPTY `sp.pref.stats` from real fixtures, and asserts
// the overlay is the fixed full-screen dialog over a hidden lobby, with the stylesheet linked and the 总览 cards rendering
// the 4 records (4 games, 2 wins, 50%). Images are aborted: the boot-time art preload is irrelevant here.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openApp } from '../helpers/appBoot.mjs';
import { buildRecord, STATS_VERSION } from '../../public/js/ui/stats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const FIX = JSON.parse(readFileSync(path.join(ROOT, 'test/fixtures/stats-results.json'), 'utf8'));
const BANDS = Object.keys(JSON.parse(readFileSync(path.join(ROOT, 'data/bands.json'), 'utf8')));
const NOW = Date.parse('2026-10-08T21:30:00');

/** 4 settled records (the bug report's server held 4 rows), newest first — 4 games, 2 wins, 50% for the self player. */
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

describe('统计数据 overlay in the hub (headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let browser;

  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--mute-audio', '--force-device-scale-factor=1'] });
  });

  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  /**
   * The hub with `sp.pref.stats` seeded. Images are aborted: the ~100 MB boot preload has nothing to do with the overlay.
   */
  async function open({ stored = null } = {}) {
    return openApp(browser, {
      base: `http://127.0.0.1:${srv.port}`,
      viewport: { width: 1440, height: 900 },
      storage: stored ? { 'sp.pref.stats': stored } : {},
      setup: async (page) => {
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          if (req.resourceType() === 'image') req.abort().catch(() => {});
          else req.continue().catch(() => {});
        });
      },
    });
  }

  const openStats = async (page) => {
    await page.click('.lobby-screen .topbar__right .me-chip--btn');
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

  test('a seeded non-empty list opens the fixed overlay over a hidden lobby, with the cards rendered', async () => {
    const page = await open({ stored: seed(4) });
    try {
      await openStats(page);
      const s = await state(page);
      assert.equal(s.cssLinked, true, `stats.css is linked — ${describeState(s)}`);
      assert.equal(s.position, 'fixed', `.st is the fixed overlay, not an inline block — ${describeState(s)}`);
      assert.ok(s.covers, `.st covers the viewport — ${describeState(s)}`);
      assert.match(s.htmlClass, /sp-stats-open/, `the screen behind is marked hidden — ${describeState(s)}`);
      assert.equal(s.screenVisibility, 'hidden', `the lobby is hidden behind the overlay — ${describeState(s)}`);
      assert.equal(s.empty, false, `the non-empty list rendered (not the empty state) — ${describeState(s)}`);
      assert.deepEqual(s.cards.slice(0, 3), ['4', '2', '50%'], `the 总览 cards render the 4 records — ${describeState(s)}`);
    } finally {
      await page.close();
    }
  });

  test('a fresh load never opens the overlay on its own (no persisted open flag to wedge it)', async () => {
    const page = await open();
    try {
      assert.equal(await page.$('.st'), null, 'the stats overlay must not be restored from storage');
      assert.doesNotMatch(await page.evaluate(() => document.documentElement.className), /sp-stats-open/);
    } finally {
      await page.close();
    }
  });
});
