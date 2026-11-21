// Browser check of the title screen's three new surfaces (opt-in, ~15 s):
//   SP_E2E=1 CHROME_PATH=… node --test test/ui/title-surfaces.e2e.test.js
//
// On the title screen: the 公告 / 关于本服务器 entries sit under the login console; 关于本服务器 opens a dialog with the
// version, the mode list and the disclaimer, and 公告 opens our changelog overlay re-titled 公告. The page links the PWA
// manifest our build ships (public/manifest.json + icons, the upstream 0.2.3 install-icon work), and 添加到桌面 appears
// only when the browser offers an install (beforeinstallprompt) — not merely because the manifest exists. No console /
// page errors.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);

describe('the title screen 公告 / 关于本服务器 / 添加到桌面 surfaces', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let browser;
  let base;
  before(async () => {
    const { startBrowserServer } = await import('../helpers/browserServer.mjs');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startBrowserServer({ accounts: true });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--force-device-scale-factor=1'] });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  const modalText = (page) => page.evaluate(() => document.querySelector('.modal')?.textContent.replace(/\s+/g, ' ').trim() ?? null);

  test('关于本服务器 / 公告 open from the title; 添加到桌面 follows the browser\'s install offer', async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    // the first-run 美术资源 prompt (ui/assetMode.js) would cover the title and swallow the clicks
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sp.pref.assetMode', JSON.stringify('stream')); } catch { /* ignore */ } });
    const problems = [];
    const external = (u) => /fonts\.(googleapis|gstatic)/.test(u);
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()} @ ${m.location()?.url ?? ''}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => { if (!external(r.url()) && r.failure()?.errorText !== 'net::ERR_ABORTED') problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`); });
    await page.goto(`${base}/`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('.title-screen', { timeout: 15000 });

    // the two entries under the login console
    const entries = await page.evaluate(() => ({
      wrap: !!document.querySelector('.title-about-wrap'),
      announce: document.querySelector('.title-about-wrap button')?.textContent.trim() ?? null,
      about: document.querySelector('.title-about-wrap .title-about-button')?.textContent.trim() ?? null,
    }));
    assert.equal(entries.wrap, true, 'the entries live in a title-about-wrap');
    assert.equal(entries.announce, '公告');
    assert.equal(entries.about, '关于本服务器');
    const hint = await page.evaluate(() => document.querySelector('.title-platform-hint')?.textContent.trim() ?? null);
    assert.match(hint, /仅支持网页版（桌面浏览器）；手机端可能存在兼容问题/, 'the desktop-only note is on the title');

    // no notice seeded → the banner is hidden (nothing to show)
    assert.equal(await page.$('.title-announce'), null, 'no notice → the 公告 banner is hidden');

    // the install surface: the manifest our build ships is linked, and the button follows the browser's offer
    assert.equal(await page.$eval('link[rel="manifest"]', (l) => new URL(l.href).pathname), '/manifest.json',
      'the PWA manifest is linked (public/index.html + ui/ensureManifest.js)');
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt');
      e.prompt = () => { globalThis.__spPrompted = true; return Promise.resolve(); };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      globalThis.dispatchEvent(e);
    });
    await page.waitForSelector('[data-testid="pwa-install"]', { timeout: 3000 });
    await page.click('[data-testid="pwa-install"]');
    assert.equal(await page.evaluate(() => globalThis.__spPrompted === true), true, 'the button calls the browser prompt');
    assert.equal(await page.$('[data-testid="pwa-install"]'), null, 'a consumed offer hides the button again');

    // 关于本服务器: version · modes · disclaimer
    await page.click('.title-about-wrap .title-about-button');
    await page.waitForSelector('.modal__box.title-about', { timeout: 5000 });
    const about = await modalText(page);
    assert.match(about, /关于本服务器/);
    assert.match(about, /版本/);
    assert.match(about, /可用模式/);
    assert.match(about, /标准模拟/);
    assert.match(about, /终极模拟/);
    assert.match(about, /仅支持网页版（桌面浏览器）；手机端可能存在兼容问题/, 'the dialog states the platform note');
    assert.match(about, /非官方同人复刻/);
    assert.match(about, /github\.com\/dxingkongzhixia/, 'the primary repo is GitHub');
    assert.match(about, /gitee\.com\/marseille1/, 'the 国内下载镜像 is linked too');
    await page.click('.modal__box.title-about [data-autofocus]');
    await page.waitForSelector('.modal__box.title-about', { hidden: true });

    // 公告: opens the changelog overlay (our one notice store) under the 公告 title
    await page.click('.title-about-wrap button');
    await page.waitForSelector('.online-modal', { timeout: 5000 });
    const comm = await page.evaluate(() => document.querySelector('.online-modal')?.textContent.replace(/\s+/g, ' ').trim() ?? null);
    assert.match(comm, /公告/);
    await page.waitForSelector('.changelog-item', { timeout: 8000 });
    const items = await page.evaluate(() => document.querySelectorAll('.changelog-item').length);
    assert.ok(items > 0, 'the seeded changelog lists at least one entry');
    await page.click('.online-modal__close');
    await page.waitForSelector('.online-modal', { hidden: true });
    assert.ok(await page.$('.title-screen'), 'the title screen is still there');

    assert.deepEqual(problems, []);
    await page.close();
  });
});
