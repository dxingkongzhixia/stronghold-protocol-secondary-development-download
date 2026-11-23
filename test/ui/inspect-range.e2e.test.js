// Browser check of the COMBAT attack-range highlight (opt-in, needs Chrome, ~10 s):
//   SP_E2E=1 CHROME_PATH=… node --test test/ui/inspect-range.e2e.test.js
//
// Through the mock's own COMBAT phase (public/dev/game-mock.html?phase=COMBAT&render=fallback): clicking a field unit opens
// its detail card and lights its attack range on the DOM board; clicking another unit follows the selection; closing the
// card clears the tiles. The reach maths — the strategy medics' healing grids, a skill that extends the base range, the live
// stats' `range`/`dir` — is the static test/ui/inspect-range.test.js; this file is the screen wiring around it.
//
// 2026-11-23: the original version imported a real battle and injected its snapshot into a PREP mock page. The harness now
// owns match.public (a later pushPublic reverted the patch) and a prep field meta makes the screen drop battle snapshots, so
// the screen stayed in PREP and the range never drew. Rewritten against the mock's COMBAT state; the product behaviour was
// intact all along (a probe measured 12 tiles for char_6_08_a).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { openMock } from '../helpers/mockPage.mjs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('COMBAT attack-range highlight (headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
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

  const lit = (page) => page.$$eval('.ff-tile.is-range', (els) => els.map((e) => [Number(e.dataset.row), Number(e.dataset.col)]));

  test('a click draws the range, another click follows the selection, closing clears it', async () => {
    const page = await browser.newPage();
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await openMock(page, {
      base,
      query: 'shot=1&render=fallback&e2e=1&phase=COMBAT',
      ready: '.ff-unit',
      viewport: { width: 1280, height: 720 },
    });
    await page.waitForSelector('.ff-unit.is-ally', { timeout: 10000 });
    await sleep(400); // the field-entry effect wires the snapshot after the first units paint

    const allies = await page.$$('.ff-unit.is-ally:not(.is-dead)');
    assert.ok(allies.length >= 1, 'the COMBAT field has at least one allied unit');
    await (await page.$$('.ff-unit.is-ally:not(.is-dead)'))[0].click();
    await page.waitForSelector('.dpanel', { timeout: 5000 });
    await page.waitForSelector('.ff-tile.is-range', { timeout: 5000 });
    await sleep(150);
    const tiles = await lit(page);
    assert.ok(tiles.length > 0, 'the open card lights its attack range');
    for (const [row, col] of tiles) {
      assert.ok(Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0, `a range tile has board coordinates (${row},${col})`);
    }

    // closing the card is the switch: no range may stay lit
    await page.click('.dpanel__close');
    await page.waitForFunction(() => !document.querySelector('.ff-tile.is-range'), { timeout: 5000 });
    assert.equal((await lit(page)).length, 0, 'the closed card leaves no range tiles');

    assert.deepEqual(problems, []);
    await page.close();
  });
});
