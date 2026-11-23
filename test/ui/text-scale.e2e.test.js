// Browser check of 设置 →「文字大小」 on a phone (opt-in, needs Chrome, ~20 s):
//   SP_E2E=1 CHROME_PATH=… node --test test/ui/text-scale.e2e.test.js
//
// A 844×390 landscape phone: 1rem is clamped at 40 px, so the .18rem body text is 7.2 CSS px. The setting steps the text
// root `--t` (css/theme.css) instead of the layout root: the readable text grows, while `documentElement`'s font-size, the
// field, its canvas and the shop bar — its box AND its row — stay exactly where they were.
//
// 2026-11-23: the v0.2.6 text-scale rollout put `--t` on the shop caption and the funds labels' line boxes, so 特大
// stretched the bar 145 → 164 px. The original test caught it and was parked during the e2e triage; this is that test,
// restored after the fix in screens/game-shop.css (.shopbar__remain / .funds hold the design height). The original lobby
// half is not restored: entering the hub from a cold page needs the title flow, which the mock page does not model — the
// in-match settings dialog below already proves the readable text grows.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { openMock } from '../helpers/mockPage.mjs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const PHONE = { width: 844, height: 390 };

describe('文字大小 on a phone (headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let browser;
  let base;

  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--force-device-scale-factor=1'] });
  });

  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  /** The settings the mock harness reads, seeded before the first script runs. */
  const seedSettings = (page, textSize) => page.evaluateOnNewDocument((ts) => {
    try { localStorage.setItem('sp.pref.settings', JSON.stringify({ textSize: ts })); } catch { /* ignore */ }
  }, textSize);

  /** Open the prep screen with the settings dialog, then read the boxes that must not move and the label that must grow. */
  async function measure(textSize) {
    const page = await browser.newPage();
    await seedSettings(page, textSize);
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await openMock(page, {
      base,
      query: 'shot=1&render=engine&e2e=1&phase=PREP&variant=settings',
      ready: '.shopbar',
      viewport: PHONE,
    });
    await page.waitForSelector('.gm__field canvas', { timeout: 20000 });
    await page.waitForSelector('.modal .set-row__label', { timeout: 15000 });
    const m = await page.evaluate(() => {
      const box = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
      };
      return {
        root: parseFloat(getComputedStyle(document.documentElement).fontSize),
        field: box('.gm__field'),
        canvas: box('.gm__field canvas'),
        shopbar: box('.gm__hud .shopbar'),
        shoprow: box('.gm__hud .shopbar__row'),
        label: (() => { const el = document.querySelector('.modal .set-row__label'); return el ? parseFloat(getComputedStyle(el).fontSize) : null; })(),
      };
    });
    return { ...m, problems, page };
  }

  test('the readable text grows; the layout root, field, canvas and shop bar do not move', async () => {
    const small = await measure('sm');
    const big = await measure('xl');
    assert.ok(small.field && small.shopbar && small.shoprow, 'the prep screen with its HUD is on screen');
    assert.equal(small.root, 40);
    assert.equal(big.root, 40, 'the text step never reaches the layout root');
    assert.deepEqual(big.field, small.field, 'the field host (host.clientWidth / clientHeight) is unchanged');
    assert.deepEqual(big.canvas, small.canvas, 'and so is the canvas the renderer resizes to it');
    assert.deepEqual(big.shopbar, small.shopbar, 'the shop bar is a fixed HUD box: still the design\'s size');
    assert.deepEqual(big.shoprow, small.shoprow, 'and so is its row (the funds card cannot stretch it)');
    assert.ok(big.label > small.label * 1.9, `while the dialog's readable text grows (${small.label} → ${big.label})`);
    assert.deepEqual(small.problems, []);
    assert.deepEqual(big.problems, []);
    await small.page.close();
    await big.page.close();
  });
});
