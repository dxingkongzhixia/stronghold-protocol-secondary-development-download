// Browser check of the title screen's three new surfaces (opt-in, ~15 s):
//   SP_E2E=1 CHROME_PATH=… node --test test/ui/title-surfaces.e2e.test.js
//
// On the title screen: the 公告 / 关于本服务器 entries sit under the login console; 关于本服务器 opens a dialog with the
// version, the mode list and the disclaimer, and 公告 opens our changelog overlay re-titled 公告. The 添加到桌面 button
// must NOT appear here — our build ships no PWA manifest / service worker, so no browser fires beforeinstallprompt and
// InstallButton hides (a graceful no-op; see title-surfaces.test.js). No console / page errors.

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

  const modalText = (page) => page.evaluate(() => document.querySelector('.modal')?.textContent.replace(/\s+/g, ' ').trim() ?? null);

  test('关于本服务器 / 公告 open from the title; the install button stays hidden (no manifest in our build)', async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
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

    // the install button must be absent: our build has no manifest/SW, so no beforeinstallprompt fires
    assert.equal(await page.$('[data-testid="pwa-install"]'), null, 'no installable app → 添加到桌面 hidden');

    // 关于本服务器: version · modes · disclaimer
    await page.click('.title-about-wrap .title-about-button');
    await page.waitForSelector('.modal.title-about', { timeout: 5000 });
    const about = await modalText(page);
    assert.match(about, /关于本服务器/);
    assert.match(about, /版本/);
    assert.match(about, /可用模式/);
    assert.match(about, /标准模拟/);
    assert.match(about, /终极模拟/);
    assert.match(about, /仅支持网页版（桌面浏览器）；手机端可能存在兼容问题/, 'the dialog states the platform note');
    assert.match(about, /非官方同人复刻/);
    assert.match(about, /gitee\.com\/marseille1/);
    await page.click('.modal.title-about [data-autofocus]');
    await page.waitForSelector('.modal.title-about', { hidden: true });

    // 公告: opens the changelog overlay (our one notice store) under the 公告 title
    await page.click('.title-about-wrap button');
    await page.waitForSelector('.modal', { timeout: 5000 });
    const comm = await modalText(page);
    assert.match(comm, /公告/);
    const items = await page.evaluate(() => document.querySelectorAll('.changelog-item').length);
    assert.ok(items > 0, 'the seeded changelog lists at least one entry');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.modal', { hidden: true });
    assert.ok(await page.$('.title-screen'), 'the title screen is still there');

    assert.deepEqual(problems, []);
    await page.close();
  });
});
