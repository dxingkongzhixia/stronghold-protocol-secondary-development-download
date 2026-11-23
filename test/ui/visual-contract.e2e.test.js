// Visual contract for the in-match UI (opt-in, needs Chrome, ~30 s):
//   SP_E2E=1 CHROME_PATH=… node --test test/ui/visual-contract.e2e.test.js
//
// The other browser suites assert structure and behaviour; this one asserts that the states which are *drawn* still
// draw. It uses the mock harness (public/dev/game-mock.html, `render=fallback`, `?e2e=1`) so it needs no game assets and
// no WebGL — a flat DOM view, which is what makes the probes stable:
//
//   1. the surfaces exist, have a size, and stay inside the 1600×900 viewport (no horizontal overflow);
//   2. 准备就绪 paints the button (dark → mint): aria-pressed, the label, and the mean colour of the button's own crop;
//   3. an armed shop card paints the gold border, the confirm strip, and dims its siblings;
//   4. a broke player's card is disabled and its confirm strip says 无法购买 with a reason (a visible refusal);
//   5. a low LP paints `.lp--danger` in the danger red, not the mint of a healthy one;
//   6. the 最终攻势 plate is visible, has rows, and stays in the viewport.
//
// No pixel-perfect golden: every colour assertion is either a computed style (deterministic) or a *change* in the mean
// colour of the same element between two states (stable across fonts, DPR and art packs). Screenshots are kept under
// test/e2e/out/visual-contract-*.png as evidence, never compared byte-for-byte.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'test/e2e/out');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const VIEW = { w: 1600, h: 900 };
const MINT = 'rgb(78, 216, 175)';      // --mint-500: the ready button's on-state and the LP tower
const GOLD = 'rgb(255, 198, 0)';       // --gold: an armed shop card's border
const DANGER = 'rgb(255, 84, 84)';     // --red-premium: .lp--danger

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const luminance = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

describe('in-match visual contract (mock harness, headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let browser;
  let base;

  before(async () => {
    const { startBrowserServer } = await import('../helpers/browserServer.mjs');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startBrowserServer();
    base = `http://127.0.0.1:${srv.port}`;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--force-device-scale-factor=1'] });
    mkdirSync(OUT, { recursive: true });
  });

  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  /**
   * The mock at `phase` in a fresh context (the service worker's own fetches would skip interception), at 1600×900,
   * `render=fallback`: a flat DOM view with no WebGL, so the geometry and computed colours are deterministic.
   */
  async function open(phase = 'PREP') {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setBypassServiceWorker(true);
    await page.setViewport({ width: VIEW.w, height: VIEW.h });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(`${base}/dev/game-mock.html?shot=1&render=fallback&e2e=1&phase=${phase}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('.gm__hud', { timeout: 30000 });
    await sleep(600);
    return { page, context, errors };
  }

  /** Client rect of the first match of `sel`, or null. */
  const rectOf = (page, sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, sel);

  /** Computed style subset of the first match of `sel`, or null. */
  const styleOf = (page, sel, props) => page.evaluate((s, keys) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return Object.fromEntries(keys.map((k) => [k, cs[k]]));
  }, sel, props);

  /**
   * Mean RGB of a screenshot crop, decoded by the page itself — a colour probe without a pixel-diff dependency.
   * @param {{x:number,y:number,w:number,h:number}} r a client rect
   */
  async function meanColor(page, r) {
    const clip = {
      x: Math.max(0, Math.round(r.x)),
      y: Math.max(0, Math.round(r.y)),
      width: Math.max(1, Math.min(VIEW.w - Math.max(0, Math.round(r.x)), Math.round(r.w))),
      height: Math.max(1, Math.min(VIEW.h - Math.max(0, Math.round(r.y)), Math.round(r.h))),
    };
    const b64 = await page.screenshot({ clip, encoding: 'base64' });
    return page.evaluate(async (src) => {
      const img = new Image();
      img.src = `data:image/png;base64,${src}`;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const g = cv.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let R = 0, G = 0, B = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
      return { r: R / n, g: G / n, b: B / n };
    }, b64);
  }

  /** A surface is drawn when it has a box and that box is inside the viewport. */
  async function assertSurface(page, sel, label) {
    const r = await rectOf(page, sel);
    assert.ok(r, `${label}: ${sel} is missing`);
    assert.ok(r.w > 0 && r.h > 0, `${label}: ${sel} has no box (${r.w}×${r.h})`);
    assert.ok(r.x >= -1 && r.y >= -1, `${label}: ${sel} starts outside the viewport (${Math.round(r.x)},${Math.round(r.y)})`);
    assert.ok(r.x + r.w <= VIEW.w + 1 && r.y + r.h <= VIEW.h + 1,
      `${label}: ${sel} overflows the viewport (right ${Math.round(r.x + r.w)} > ${VIEW.w} or bottom ${Math.round(r.y + r.h)} > ${VIEW.h})`);
    return r;
  }

  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `visual-contract-${name}.png`) });

  test('the HUD surfaces exist, are drawn, and stay in the viewport', async () => {
    const { page, context, errors } = await open();
    for (const [sel, label] of [
      ['.gtop', 'top bar'], ['.shopbar', 'shop bar'], ['.readybtn', 'ready button'],
      ['.team', 'team column'], ['.gm__teamcol', 'team column host'], ['.lvcard', 'level card'],
    ]) await assertSurface(page, sel, label);

    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
    }));
    assert.ok(overflow.doc <= 1 && overflow.body <= 1, `horizontal overflow: doc ${overflow.doc}px, body ${overflow.body}px`);

    // the shop cards are inside the bar and the bar is inside the viewport
    const bar = await rectOf(page, '.shopbar');
    const card = await rectOf(page, '.scard');
    assert.ok(card && card.x >= bar.x - 1 && card.x + card.w <= bar.x + bar.w + 1, 'the first shop card sits outside the shop bar');

    await shot(page, 'surfaces');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('准备就绪 paints the button: dark → mint, aria-pressed, label', async () => {
    const { page, context, errors } = await open();
    const r0 = await assertSurface(page, '.readybtn', 'ready button');
    await page.mouse.move(20, 20);                 // no hover: the base colours, not the :hover variants
    const before = await meanColor(page, r0);
    const s0 = await styleOf(page, '.readybtn', ['backgroundColor', 'opacity']);
    assert.equal(await page.$eval('.readybtn', (el) => el.getAttribute('aria-pressed')), 'false');

    await page.click('.readybtn');
    await sleep(300);
    // with funds left the press asks first (gameLogic readyFundsPrompt): answer 准备就绪
    await page.evaluate(() => [...document.querySelectorAll('.modal button')].find((b) => /准备就绪/.test(b.textContent))?.click());
    await page.waitForSelector('.readybtn.is-on[aria-pressed="true"]', { timeout: 5000 });
    await page.mouse.move(20, 20);                 // .readybtn.is-on:hover would paint --mint-400
    await sleep(300);

    const after = await meanColor(page, r0);
    assert.equal(await page.$eval('.readybtn', (el) => el.getAttribute('aria-pressed')), 'true');
    assert.match(await page.$eval('.readybtn__label', (el) => el.textContent), /取消准备/, 'the label did not switch');
    assert.equal((await styleOf(page, '.readybtn', ['backgroundColor'])).backgroundColor, MINT, 'the on-state is not --mint-500');
    assert.ok(after.g - before.g >= 40, `the pressed button did not brighten: g ${before.g.toFixed(1)} → ${after.g.toFixed(1)}`);
    assert.ok(luminance(after) - luminance(before) >= 25, `the pressed button did not brighten (luma ${luminance(before).toFixed(1)} → ${luminance(after).toFixed(1)})`);
    assert.equal((await styleOf(page, '.readybtn', ['opacity'])).opacity, s0.opacity);

    await shot(page, 'ready-on');
    // and it goes back
    await page.click('.readybtn');
    await page.waitForFunction(() => !document.querySelector('.readybtn.is-on'), { timeout: 5000 });
    assert.equal(await page.$eval('.readybtn', (el) => el.getAttribute('aria-pressed')), 'false');

    assert.deepEqual(errors, []);
    await context.close();
  });

  test('an armed shop card paints the gold border, the confirm strip, and dims its siblings', async () => {
    const { page, context, errors } = await open();
    // enough funds so the first card is buyable regardless of the mock's shop roll
    await page.evaluate(async () => {
      globalThis.__MOCK__.mutate((s) => { s.priv.funds = 99; });
      await new Promise((r) => setTimeout(r, 250));
    });

    await page.click('.scard:not(.scard--sold):not(.is-disabled)');
    await page.waitForSelector('.scard.is-armed', { timeout: 5000 });
    await page.mouse.move(20, 20);                 // the hover rule paints --mint-400 over the armed gold border
    await sleep(250);

    assert.ok(await page.$('.shopbar.has-armed'), 'the bar did not mark has-armed');
    const armed = await styleOf(page, '.scard.is-armed', ['borderTopColor', 'transform', 'zIndex']);
    assert.equal(armed.borderTopColor, GOLD, 'the armed card lost the gold border');
    const scale = Number((/matrix\(([\d.]+)/.exec(armed.transform) || [])[1]);
    assert.ok(scale >= 1.05, `the armed card did not grow: transform ${armed.transform}`);

    const confirm = await page.$eval('.scard.is-armed .scard__confirm', (el) => ({ text: el.textContent.replace(/\s+/g, ''), role: el.getAttribute('role') }));
    assert.match(confirm.text, /确认购买|确认选择/, `no confirm strip: ${JSON.stringify(confirm)}`);
    assert.equal(confirm.role, 'status');

    const sibling = await styleOf(page, '.scard:not(.is-armed):not(.scard--sold)', ['filter']);
    assert.match(sibling.filter, /brightness\(0?\.72\)/, `siblings are not dimmed: ${sibling.filter}`);

    await shot(page, 'shop-armed');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('a broke player sees a disabled card and a visible refusal', async () => {
    const { page, context, errors } = await open();
    await page.evaluate(async () => {
      globalThis.__MOCK__.mutate((s) => { s.priv.funds = 0; });
      await new Promise((r) => setTimeout(r, 250));
    });

    const card = '.scard.is-disabled:not(.scard--sold)';
    await page.waitForSelector(card, { timeout: 5000 });
    const cursor = (await styleOf(page, card, ['cursor'])).cursor;
    assert.equal(cursor, 'not-allowed', 'a disabled card does not say so with the cursor');

    // the first tap still answers, in words — the refusal is drawn, not silent
    await page.click(card);
    await page.waitForSelector('.scard.is-armed .scard__confirm.is-no', { timeout: 5000 });
    await page.mouse.move(20, 20);
    const refusal = await page.$eval('.scard.is-armed .scard__confirm.is-no', (el) => el.textContent.replace(/\s+/g, ''));
    assert.match(refusal, /无法购买/, `no refusal text: ${refusal}`);
    const red = await styleOf(page, '.scard.is-armed.is-disabled', ['borderTopColor']);
    assert.equal(red.borderTopColor, DANGER, 'the refused card is not red');

    await shot(page, 'shop-refused');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('a low LP paints the danger red, a healthy one the mint', async () => {
    const { page, context, errors } = await open();
    const healthy = await styleOf(page, '.gtop .lp--lg', ['color']);
    assert.equal(healthy.color, 'rgb(89, 244, 202)', 'the healthy LP is not the mint');

    await page.evaluate(async () => {
      globalThis.__MOCK__.mutate((s) => { s.priv.lp = 4; });
      await new Promise((r) => setTimeout(r, 300));
    });
    await page.waitForSelector('.gtop .lp--danger', { timeout: 5000 });
    const danger = await styleOf(page, '.gtop .lp--danger', ['color']);
    assert.equal(danger.color, DANGER, 'the low LP is not --red-premium');
    assert.equal(await page.$eval('.gtop .lp--lg .lp__val', (el) => el.textContent.trim()), '4');

    const r = await rectOf(page, '.gtop .lp--lg');
    const before = { r: 89, g: 244, b: 202 };
    const after = await meanColor(page, r);
    assert.ok(after.r > after.g * 2, `the low LP still reads green: ${JSON.stringify(after)}`);
    assert.ok(before.g - after.g >= 100, `the mint did not leave the crop: ${JSON.stringify(after)}`);

    await shot(page, 'lp-danger');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('the 最终攻势 plate is drawn with its rows, inside the viewport', async () => {
    const { page, context, errors } = await open();
    // the plate belongs to the phase change, not to the boot URL: FINAL_ASSAULT must be entered live
    await page.evaluate(() => globalThis.__MOCK__.setPhase('FINAL_ASSAULT'));
    await page.waitForSelector('[data-testid="final-plate"]', { timeout: 8000 });
    await sleep(400);
    const r = await assertSurface(page, '[data-testid="final-plate"]', 'final plate');
    const rows = await page.$$eval('.fa__row', (els) => els.length);
    assert.ok(rows >= 1, 'the final plate has no rows');
    const total = await page.$eval('.fa__total', (el) => el.textContent.trim());
    assert.ok(total.length > 0, 'the final plate has no LP total');
    assert.ok(r.w >= 200 && r.h >= 60, `the final plate is too small (${r.w}×${r.h})`);

    await shot(page, 'final-plate');
    assert.deepEqual(errors, []);
    await context.close();
  });
});
