// Browser check of the settings entry of the lobby and the room (GitHub #238 — 设置 was reachable only from the title
// screen and a running match; opt-in, ~15 s):
//   SP_E2E=1 CHROME_PATH=… node --test test/ui/settings-entry.e2e.test.js
//
// After 开始 the lobby's top bar carries a 设置 button in its right-hand group, immediately before the 档案 account chip
// (ui/settings.js SettingsButton), and the room's after 创建同盟 (its top bar's right group, beside the invite key);
// each opens the very settings modal of the title screen (language, sound, 快捷键 …) and closes
// with Esc or 完成, leaving the screen as it was. No console / page errors. The modal itself and its contents are covered
// by the title screen's tests; this file is about the entry. Not in the modal, deliberately: background music in a
// hidden tab and the board style (the owner's decision of 2026-10-07 on #238).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('the settings entry of the lobby and the room', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
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

  /** Is the 设置 button in `screen`'s top-bar right group — and, when the screen carries a 档案 chip, right before it? */
  const settingsByAccount = (page, screen) => page.evaluate((s) => {
    const btn = document.querySelector(`${s} [data-testid="settings-btn"]`);
    const right = document.querySelector(`${s} .topbar__right`);
    const chip = document.querySelector(`${s} .me-chip`);
    return !!btn && !!right && right.contains(btn)
      && (!chip || btn.nextElementSibling === chip)
      && /设置/.test(btn.textContent) && btn.querySelector('svg.btn__icon') != null;
  }, screen);
  const modalText = (page) => page.evaluate(() => document.querySelector('.modal')?.textContent.replace(/\s+/g, ' ').trim() ?? null);

  test('the lobby: 设置 beside the 档案 chip opens the settings modal; Esc closes it; the room has the same entry', async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await page.goto(`${base}/`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('input', { timeout: 15000 });
    await page.type('input', '测试博士');
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /开始/.test(b.textContent))?.click());
    await page.waitForSelector('.lobby-screen', { timeout: 15000 });
    await sleep(500);

    assert.ok(await settingsByAccount(page, '.lobby-screen'), '设置 sits in the lobby top bar\'s right group, right before the 档案 chip');
    assert.equal(await modalText(page), null, 'closed until asked');
    await page.click('.lobby-screen [data-testid="settings-btn"]');
    await page.waitForSelector('.modal', { timeout: 5000 });
    const text = await modalText(page);
    assert.match(text, /设置/);
    assert.match(text, /背景音乐/);
    assert.match(text, /快捷键/);
    assert.doesNotMatch(text, /棋盘/, 'no board-style option (declined)');
    assert.doesNotMatch(text, /后台/, 'no background-music option (declined)');
    await page.keyboard.press('Escape');
    await sleep(300);
    assert.equal(await modalText(page), null, 'Esc closes it');
    assert.ok(await page.$('.lobby-screen'), 'the lobby is still there');

    // the room: 创建同盟 → the same button, closed with 完成
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /创建同盟/.test(b.textContent))?.click());
    await page.waitForSelector('.room-screen', { timeout: 15000 });
    await sleep(500);
    assert.ok(await settingsByAccount(page, '.room-screen'), '设置 sits in the room top bar\'s right group');
    await page.click('.room-screen [data-testid="settings-btn"]');
    await page.waitForSelector('.modal', { timeout: 5000 });
    assert.match(await modalText(page), /背景音乐/);
    await page.evaluate(() => [...document.querySelectorAll('.modal button')].find((b) => /完成/.test(b.textContent))?.click());
    await sleep(300);
    assert.equal(await modalText(page), null, '完成 closes it');
    assert.ok(await page.$('.room-screen'), 'the room is still there');
    assert.deepEqual(problems, []);
    await page.close();
  });
});
