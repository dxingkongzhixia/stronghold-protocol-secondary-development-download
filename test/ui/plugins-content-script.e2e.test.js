// Content / script plugin browser E2E (DESIGN §32.5 / §32.7). Opt-in:
//   SP_E2E=1 CHROME_PATH=... SP_E2E_BOOT_MS=120000 node --test test/ui/plugins-content-script.e2e.test.js
//
// 1. A real content plugin is switched on in the room's 插件 panel: the room's cs stops being vanilla, the
//    operator it adds is in the client data, and a match reaches PREP with the plugin's content set.
// 2. A script plugin is selected through plugins/config.json `default` (the room panel deliberately does not list
//    script/trusted classes): the sandbox build loads its operator and a match reaches PREP without a plugin failure.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, ROOT, hasChrome, startRealServer } from '../e2e/client.mjs';
import { writePlugin } from '../helpers/pluginFixtures.js';
import { packPlugin } from '../../server/plugins/pack.js';

const ENABLED = process.env.SP_E2E === '1' && hasChrome();

async function openRoom(c) {
  await c.open();
  await c.page.waitForFunction(() => !!globalThis.__SP__.data.get('assets'), { timeout: 60000 });
  await c.enter('凯尔希');
  await c.click('.mode-card', '独立模拟');
  await c.click('.diff-card', '标准模拟');
  await c.click('.create-box button', '开始独立模拟');
  await c.waitFor((s) => !!s.room, 'solo room');
}

async function startMatch(c) {
  if (!(await c.st()).phase) await c.click('.room-bar__right button', '开始模拟', { timeout: 20000 });
  await c.waitFor((s) => s.phase === 'INFO_CHECK', 'briefing', 30000);
  await c.click('.brief__foot .btn--primary', '准备就绪');
  await c.waitFor((s) => s.phase === 'BAND_DRAFT', 'band draft', 30000);
  await c.click('.dband', null, { nth: 1 });
  await c.click('.draft-detail__btns .btn--primary', '确认选择');
  await c.waitFor((s) => s.phase === 'PREP', 'prep', 60000);
}

/** Wait for the page-side content set (content.js contentSet) to finish downloading and checking. */
async function waitContentReady(c) {
  const t0 = Date.now();
  for (;;) {
    const status = await c.page.evaluate(() => import('/js/content.js').then((m) => m.contentSet.get().status, () => 'import-failed'));
    if (status === 'ready') return;
    if (status === 'failed') throw new Error('the content set failed to load');
    if (Date.now() - t0 > 90000) throw new Error(`content set still ${status}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

describe('content and script plugins in the browser', { skip: !ENABLED }, () => {
  test('a room content plugin changes the cs, adds its operator, and reaches PREP', { timeout: 5 * 60 * 1000 }, async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-content-e2e-'));
    fs.cpSync(path.join(ROOT, 'plugins/_template/content'), path.join(tmp, 'data-demo'), { recursive: true });
    const srv = await startRealServer({ fast: { timerScale: 1, combatSpeed: 2, startRound: 1, autoPlace: true }, pluginsDir: tmp });
    const P = (await import('puppeteer-core')).default;
    const c = new Client(P, srv.base, 'content', { prefix: 'content-plugin', w: 1600, h: 900 });
    try {
      await openRoom(c);
      await c.click('[data-testid="plugin-tag"]');
      await c.page.waitForSelector('[data-plugin="data-demo"]', { timeout: 30000 });
      const vanillaCs = await c.page.evaluate(() => globalThis.__SP__.store.get().content?.vanilla);
      assert.match(await c.page.$eval('[data-plugin="data-demo"]', (e) => e.textContent), /改变玩法/);
      await c.click('[data-plugin="data-demo"] button[role="switch"]');
      await c.page.waitForFunction(() => document.querySelector('[data-plugin="data-demo"] button[role="switch"]')?.getAttribute('aria-checked') === 'true', { timeout: 15000 });
      await waitContentReady(c);
      const room = await c.page.evaluate(() => globalThis.__SP__.store.get().room.content);
      assert.notEqual(room.cs, vanillaCs, 'the room is no longer vanilla');
      assert.ok(room.cs, 'the room has a content set hash');
      assert.ok(room.plugins?.some((p) => p.id === 'data-demo'), 'the content plugin is in the room set');
      assert.ok(await c.page.evaluate(async () => (await import('/js/content.js')).contentSet.get().kitted?.includes('char_x_data_demo_guard')), 'the plugin operator is in the room kit');
      await c.click('.modal__actions button', '完成');
      await startMatch(c);
      assert.equal((await c.st()).phase, 'PREP');
      assert.deepEqual(c.problems.filter((p) => !/fonts|woff2/.test(p)), []);
    } finally {
      await c.close().catch(() => {});
      await srv.stop().catch(() => {});
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('a sandbox script plugin required by a room content plugin loads and reaches PREP', { timeout: 5 * 60 * 1000 }, async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-script-e2e-'));
    fs.cpSync(path.join(ROOT, 'plugins/_template/script'), path.join(tmp, 'script-demo'), { recursive: true });
    assert.ok(packPlugin(path.join(tmp, 'script-demo')).wrote, 'the script plugin gets a lock file');
    writePlugin(path.join(tmp, 'script-wrapper'), {
      manifest: 2, id: 'script-wrapper', name: { zh: '脚本包装', en: 'Script wrapper' }, version: '1.0.0',
      app: '>=0.3.0 <0.5.0', api: 1, class: 'content', scope: ['room'],
      permissions: ['data.patch'], data: ['data.json'], requires: { 'script-demo': '*' },
    }, { 'data.json': { patch: 1, ops: [] } });
    const srv = await startRealServer({
      fast: { timerScale: 1, combatSpeed: 2, startRound: 1, autoPlace: true },
      pluginsDir: tmp,
      env: { SP_PLUGIN_SCRIPTS: 'sandbox' },
    });
    const P = (await import('puppeteer-core')).default;
    const c = new Client(P, srv.base, 'script', { prefix: 'script-plugin', w: 1600, h: 900 });
    try {
      await openRoom(c);
      const vanillaCs = await c.page.evaluate(() => globalThis.__SP__.store.get().content?.vanilla);
      await c.click('[data-testid="plugin-tag"]');
      await c.page.waitForSelector('[data-plugin="script-wrapper"]', { timeout: 30000 });
      await c.click('[data-plugin="script-wrapper"] button[role="switch"]');
      await c.page.waitForFunction(() => document.querySelector('[data-plugin="script-wrapper"] button[role="switch"]')?.getAttribute('aria-checked') === 'true', { timeout: 15000 });
      await waitContentReady(c);
      const room = await c.page.evaluate(() => globalThis.__SP__.store.get().room.content);
      assert.notEqual(room.cs, vanillaCs, 'the wrapper content plugin changes the room');
      assert.ok(room.plugins?.some((p) => p.id === 'script-wrapper'), 'the wrapper is in the room set');
      assert.ok(room.plugins?.some((p) => p.id === 'script-demo' && p.class === 'script' && p.execution === 'sandbox' && p.auto === true), 'the required script plugin is auto-added as a sandbox script');
      assert.ok(await c.page.evaluate(async () => {
        const m = await import('/js/content.js');
        if (m.contentSet.get().kitted?.includes('char_x_script_demo_guard')) return true;
        await globalThis.__SP__.data.load('chess');
        const chess = globalThis.__SP__.data.get('chess') || {};
        return !!(chess['char_x_script_demo_guard'] || Object.values(chess).some((x) => x && x.charId === 'char_x_script_demo_guard'));
      }), 'the script plugin operator is in the room content');
      await c.click('.modal__actions button', '完成');
      await startMatch(c);
      assert.equal((await c.st()).phase, 'PREP');
      assert.doesNotMatch(srv.logs.join('\n'), /plugin.*(failed|error)|PLUGIN_SCRIPT_/i);
    } finally {
      await c.close().catch(() => {});
      await srv.stop().catch(() => {});
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
