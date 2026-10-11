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
//
// Since 2026-10-11 the dialog is also the home of the 玩法说明 and bug提交 entries (its action row): both opened from the
// lobby top bar before, they sit next to 完成 now, and 玩法说明 is gone from the room's top bar too (docs/MATCHMAKING.md
// §36). This file checks that the top bar no longer carries them and that the dialog's 玩法说明 / bug提交 open the guide
// viewer and the player bug-report overlay above the modal.

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
  /** The community buttons still on `screen`'s top bar: 公开房间 / 更新日志 stay, 玩法说明 / bug提交 must be gone. */
  const topbarCommunity = (page, screen) => page.evaluate((s) => {
    const bar = document.querySelector(`${s} .topbar`);
    const has = (re) => [...(bar?.querySelectorAll('button') || [])].some((b) => re.test(b.textContent));
    return { guide: !!document.querySelector(`${s} .lobby-guide, ${s} .room-guide`), bug: has(/bug提交/), rooms: has(/公开房间/), changelog: has(/更新日志/) };
  }, screen);

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
    const topbar = await topbarCommunity(page, '.lobby-screen');
    assert.equal(topbar.guide, false, '玩法说明 is no longer a lobby top-bar button (it lives in settings)');
    assert.equal(topbar.bug, false, 'bug提交 is no longer a lobby top-bar button (it lives in settings)');
    assert.equal(topbar.rooms, true, '公开房间 stays on the lobby top bar');
    assert.equal(topbar.changelog, true, '更新日志 stays on the lobby top bar');
    assert.equal(await modalText(page), null, 'closed until asked');
    await page.click('.lobby-screen [data-testid="settings-btn"]');
    await page.waitForSelector('.modal', { timeout: 5000 });
    const text = await modalText(page);
    assert.match(text, /设置/);
    assert.match(text, /背景音乐/);
    assert.match(text, /快捷键/);
    assert.doesNotMatch(text, /棋盘/, 'no board-style option (declined)');
    assert.doesNotMatch(text, /后台/, 'no background-music option (declined)');

    // the action row's two entries: 玩法说明 (guide) and bug提交 (bug report)
    const entries = await page.evaluate(() => ({
      guide: document.querySelector('.modal .set-guide')?.textContent.trim() ?? null,
      bug: document.querySelector('.modal .set-bug')?.textContent.trim() ?? null,
    }));
    assert.equal(entries.guide, '玩法说明');
    assert.equal(entries.bug, 'bug提交');
    // bug提交 opens the player bug-report overlay above the settings modal; its ✕ closes only the overlay
    await page.click('.modal .set-bug');
    await page.waitForSelector('.bug-host .online-modal', { timeout: 5000 });
    const bugText = await page.evaluate(() => document.querySelector('.bug-host .online-modal')?.textContent.replace(/\s+/g, ' ').trim() ?? null);
    assert.match(bugText, /提交 bug/);
    assert.match(bugText, /标题/);
    assert.match(bugText, /问题描述/);
    await page.click('.bug-host .online-modal__close');
    await page.waitForSelector('.bug-host', { hidden: true });
    assert.ok(await page.$('.modal'), 'closing the bug report keeps settings');
    // 玩法说明 opens the guide viewer above the settings modal; Esc closes only the viewer
    await page.click('.modal .set-guide');
    await page.waitForSelector('.guide', { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.guide', { hidden: true });
    assert.ok(await page.$('.modal'), 'closing the guide keeps settings');

    await page.keyboard.press('Escape');
    await sleep(300);
    assert.equal(await modalText(page), null, 'Esc closes it');
    assert.ok(await page.$('.lobby-screen'), 'the lobby is still there');

    // the room: 创建同盟 → the same button, closed with 完成
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /创建同盟/.test(b.textContent))?.click());
    await page.waitForSelector('.room-screen', { timeout: 15000 });
    await sleep(500);
    assert.ok(await settingsByAccount(page, '.room-screen'), '设置 sits in the room top bar\'s right group');
    const roomTopbar = await topbarCommunity(page, '.room-screen');
    assert.equal(roomTopbar.guide, false, '玩法说明 is no longer a room top-bar button (it lives in settings)');
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
