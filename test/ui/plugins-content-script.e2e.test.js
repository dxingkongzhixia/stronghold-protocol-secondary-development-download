// Content / script plugin browser E2E (DESIGN §32.5 / §32.7). Opt-in:
//   SP_E2E=1 CHROME_PATH=... SP_E2E_BOOT_MS=120000 node --test test/ui/plugins-content-script.e2e.test.js
//
// 1. A real content plugin is switched on in the room's 插件 panel: the room's cs stops being vanilla, the
//    operator it adds is in the client data, and a match reaches PREP with the plugin's content set.
// 2. A script plugin is selected through plugins/config.json `default` (the room panel deliberately does not list
//    script/trusted classes): the sandbox build loads its operator and a match reaches PREP without a plugin failure.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, ROOT, hasChrome, startRealServer } from '../e2e/client.mjs';
import { writePlugin, png } from '../helpers/pluginFixtures.js';
import { packPlugin } from '../../server/plugins/pack.js';
import { importForge } from '../../server/plugins/forgeImport.js';
import { readVanillaAssets } from '../../server/plugins/registry.js';

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

  test('a real Forge pack imports into content + cosmetic + sandbox script and reaches PREP', { timeout: 8 * 60 * 1000 }, async () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-forge-e2e-'));
    const plugins = path.join(work, 'plugins');
    const pack = path.join(work, 'pack');
    fs.mkdirSync(plugins);
    fs.cpSync(path.join(ROOT, 'test/fixtures/forge/numbers-pack'), pack, { recursive: true });
    fs.writeFileSync(path.join(pack, 'kits/guard.js'), "export default function kit() { return { skill: { kind: 'passive' } }; }\n");
    fs.mkdirSync(path.join(pack, 'chars'), { recursive: true });
    fs.writeFileSync(path.join(pack, 'chars/rose.png'), png(8, 8, [255, 0, 255, 255]));
    const meta = JSON.parse(fs.readFileSync(path.join(pack, 'pack.json'), 'utf8'));
    meta.art = { chars: { char_102_texas: { portrait: 'chars/rose.png' } } };
    fs.writeFileSync(path.join(pack, 'pack.json'), JSON.stringify(meta));
    const imported = await importForge(pack, {
      pluginsDir: plugins, out: path.join(plugins, 'rose-e2e'), root: ROOT,
      dataDir: path.join(ROOT, 'data'), vanilla: readVanillaAssets(path.join(ROOT, 'data')),
    });
    assert.equal(imported.ok, true, imported.markdown);
    assert.ok(imported.report.products.some((p) => p.id === 'rose-e2e' && p.class === 'content'));
    assert.ok(imported.report.products.some((p) => p.id === 'rose-e2e-look' && p.class === 'cosmetic'));
    assert.ok(imported.report.products.some((p) => p.id === 'kits-rose-e2e' && p.class === 'script'));
    const provenance = JSON.parse(fs.readFileSync(path.join(plugins, 'rose-e2e', 'forge-import.json'), 'utf8'));
    assert.equal(provenance.pack.id, 'rose-numbers');
    assert.ok(provenance.products.some((p) => p.id === 'rose-e2e-look'));
    const srv = await startRealServer({
      fast: { timerScale: 1, combatSpeed: 2, startRound: 1, autoPlace: true },
      pluginsDir: plugins,
      env: { SP_PLUGIN_SCRIPTS: 'sandbox' },
    });
    const P = (await import('puppeteer-core')).default;
    const c = new Client(P, srv.base, 'forge', { prefix: 'forge-plugin', w: 1600, h: 900 });
    try {
      await openRoom(c);
      const vanillaCs = await c.page.evaluate(() => globalThis.__SP__.store.get().content?.vanilla);
      await c.click('[data-testid="plugin-tag"]');
      await c.page.waitForSelector('[data-plugin="rose-e2e"]', { timeout: 30000 });
      await c.click('[data-plugin="rose-e2e"] button[role="switch"]');
      await c.page.waitForFunction(() => document.querySelector('[data-plugin="rose-e2e"] button[role="switch"]')?.getAttribute('aria-checked') === 'true', { timeout: 15000 });
      await c.page.waitForSelector('[data-plugin="rose-e2e-look"]', { timeout: 30000 });
      await c.click('[data-plugin="rose-e2e-look"] button[role="switch"]');
      await c.page.waitForFunction(() => document.querySelector('[data-plugin="rose-e2e-look"] button[role="switch"]')?.getAttribute('aria-checked') === 'true', { timeout: 15000 });
      await c.click('.modal__actions button', '完成');
      await waitContentReady(c);
      let room = await c.page.evaluate(() => globalThis.__SP__.store.get().room.content);
      assert.notEqual(room.cs, vanillaCs, 'the imported content changes the room cs');
      assert.ok(room.plugins.some((p) => p.id === 'rose-e2e'), 'the content product is in the room');
      assert.ok(room.plugins.some((p) => p.id === 'rose-e2e-look'), 'the cosmetic product is in the room visual set');
      // The room panel deliberately lists content/cosmetic only; select the imported script product through the
      // same host request the panel would send, so the real Forge kit is part of the room's content set.
      const req = await c.page.evaluate(() => import('/js/net.js').then((m) => m.net.request('room.setPlugins', { plugins: [{ id: 'rose-e2e' }, { id: 'rose-e2e-look' }, { id: 'kits-rose-e2e' }] }).then(() => 'ok', (e) => ({ code: e.code, detail: e.detail }))));
      assert.equal(req, 'ok');
      await c.page.waitForFunction(() => globalThis.__SP__.store.get().room.content.plugins.some((p) => p.id === 'kits-rose-e2e' && p.execution === 'sandbox'), { timeout: 20000 });
      await waitContentReady(c);
      room = await c.page.evaluate(() => globalThis.__SP__.store.get().room.content);
      assert.ok(room.plugins.some((p) => p.id === 'kits-rose-e2e' && p.class === 'script' && p.execution === 'sandbox'));
      await startMatch(c);
      assert.equal((await c.st()).phase, 'PREP');
      assert.deepEqual(c.problems.filter((p) => !/fonts|woff2/.test(p)), []);
    } finally {
      await c.close().catch(() => {});
      await srv.stop().catch(() => {});
      fs.rmSync(work, { recursive: true, force: true });
    }
  });

  test('a trusted plugin waits for per-seat consent before the room starts', { timeout: 6 * 60 * 1000 }, async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-trusted-e2e-'));
    fs.cpSync(path.join(ROOT, 'plugins/_template/script'), path.join(tmp, 'trusted-demo'), { recursive: true });
    const manifestPath = path.join(tmp, 'trusted-demo', 'plugin.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.id = 'trusted-demo';
    manifest.class = 'trusted';
    manifest.name = { zh: '受信任演示', en: 'Trusted demo' };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    for (const rel of ['guard.json', 'sim/index.js']) {
      const file = path.join(tmp, 'trusted-demo', ...rel.split('/'));
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
        .replaceAll('char_x_script_demo_guard', 'char_x_trusted_demo_guard')
        .replaceAll('skx_script_demo_guard', 'skx_trusted_demo_guard'));
    }
    assert.ok(packPlugin(path.join(tmp, 'trusted-demo')).wrote, 'the trusted plugin gets a lock file');
    const pin = createHash('sha256').update(fs.readFileSync(path.join(tmp, 'trusted-demo', 'plugin.lock.json'))).digest('hex');
    fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify({ trusted: { 'trusted-demo': pin } }));
    writePlugin(path.join(tmp, 'trusted-wrapper'), {
      manifest: 2, id: 'trusted-wrapper', name: { zh: '信任包装', en: 'Trusted wrapper' }, version: '1.0.0',
      app: '>=0.3.0 <0.5.0', api: 1, class: 'content', scope: ['room'],
      permissions: ['data.patch'], data: ['data.json'], requires: { 'trusted-demo': '*' },
    }, { 'data.json': { patch: 1, ops: [] } });
    const srv = await startRealServer({
      fast: { timerScale: 1, combatSpeed: 2, startRound: 1, autoPlace: true },
      pluginsDir: tmp,
      env: { SP_PLUGIN_SCRIPTS: 'trusted' },
    });
    const P = (await import('puppeteer-core')).default;
    const c = new Client(P, srv.base, 'trusted', { prefix: 'trusted-plugin', w: 1600, h: 900 });
    try {
      await openRoom(c);
      await c.click('[data-testid="plugin-tag"]');
      await c.page.waitForSelector('[data-plugin="trusted-wrapper"]', { timeout: 30000 });
      await c.click('[data-plugin="trusted-wrapper"] button[role="switch"]');
      await c.page.waitForFunction(() => document.querySelector('[data-plugin="trusted-wrapper"] button[role="switch"]')?.getAttribute('aria-checked') === 'true', { timeout: 15000 });
      await c.click('.modal__actions button', '完成');
      await c.page.waitForSelector('[data-testid="trusted-consent"]', { timeout: 30000 });
      assert.match(await c.page.$eval('[data-testid="trusted-consent"]', (e) => e.textContent), /受信任插件/);
      assert.match(await c.page.$eval('[data-testid="trusted-consent"]', (e) => e.textContent), /trusted-demo/);
      assert.equal(await c.page.$eval('[data-testid="room-start"]', (e) => e.disabled), true, 'start is blocked before consent');
      await c.click('[data-testid="trusted-reject"]');
      await c.page.waitForSelector('[data-testid="trusted-declined"]', { timeout: 10000 });
      assert.equal(await c.page.evaluate(() => globalThis.__SP__.store.get().room.content.trusted.consent[0]), false, 'the seat refused');
      await c.click('[data-testid="trusted-accept"]');
      await c.page.waitForFunction(() => !document.querySelector('[data-testid="trusted-consent"]'), { timeout: 20000 });
      await c.page.waitForFunction(() => document.querySelector('[data-testid="seat-content"]')?.textContent.includes('插件内容就绪'), { timeout: 30000 });
      await startMatch(c);
      assert.equal((await c.st()).phase, 'PREP');
      assert.deepEqual(c.problems.filter((p) => !/fonts|woff2/.test(p)), []);
    } finally {
      await c.close().catch(() => {});
      await srv.stop().catch(() => {});
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
