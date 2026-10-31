// No connected real player: the server may take the fields (content only), then the lobby disposes the room. This is
// the browser-side half of the D12 fallback rule; the field-level fallback is covered headlessly.
//
//   SP_E2E=1 CHROME_PATH=... node --test test/ui/native-room-fallback.e2e.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, ROOT, hasChrome, sleep, problemsOf } from '../e2e/client.mjs';
import { packPlugin } from '../../server/plugins/pack.js';
import { startServer } from '../../server/index.js';

const ENABLED = process.env.SP_E2E === '1' && hasChrome();

function nativePlugin(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-native-fallback-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const id = 'native-fallback';
  const dir = path.join(tmp, id);
  fs.mkdirSync(path.join(dir, 'sim'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sim/index.js'), "export default { setup() {}, hooks: {} };\n");
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    manifest: 3, id, name: 'Native fallback', version: '1.0.0', app: '*',
    api: { sim: 1 }, scope: ['room'], trust: 'sandbox',
    modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.code'] }],
  }, null, 2));
  const packed = packPlugin(dir, { dataDir: path.join(ROOT, 'data') });
  assert.equal(packed.wrote, true, JSON.stringify(packed.build?.issues ?? []));
  return { tmp, id };
}

test('the last connected player leaves: the room is disposed (no real player is left)', { timeout: 5 * 60 * 1000 }, async (t) => {
  if (!ENABLED) { t.skip('set SP_E2E=1 (and have Chrome)'); return; }
  const { tmp, id } = nativePlugin(t);
  const oldKeel = process.env.KEEL;
  const oldScripts = process.env.SP_PLUGIN_SCRIPTS;
  process.env.KEEL = '1';
  process.env.SP_PLUGIN_SCRIPTS = 'sandbox';
  t.after(() => {
    if (oldKeel === undefined) delete process.env.KEEL; else process.env.KEEL = oldKeel;
    if (oldScripts === undefined) delete process.env.SP_PLUGIN_SCRIPTS; else process.env.SP_PLUGIN_SCRIPTS = oldScripts;
  });
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, pluginsDir: tmp, assetIndex: false, studio: false, lobbyGraceMs: 2000 });
  t.after(() => srv.close());
  const P = (await import('puppeteer-core')).default;
  const host = new Client(P, srv.url, 'fallback', { prefix: 'native-fallback', w: 1600, h: 900 });
  try {
    await host.open();
    await host.enter('凯尔希');
    await host.click('.hub-entry--coop');
    await host.page.waitForSelector('.protocol-screen', { timeout: 15000 });
    await host.click('.pcard', '标准模拟');
    await host.click('.proto-start', '创建同盟');
    const room = (await host.waitFor((s) => !!s.room?.code, 'room created')).room;
    await host.click('button', '添加 AI 队友');
    await host.page.waitForFunction(() => document.querySelectorAll('.seat.is-bot').length >= 1, { timeout: 15000 });
    await sleep(1500);
    await host.click('[data-testid="plugin-tag"]');
    await host.click('[data-category="gameplay"]');
    await host.page.waitForSelector(`[data-plugin="${id}"]`, { timeout: 15000 });
    await host.click(`[data-plugin="${id}"] button[role="switch"]`);
    await host.page.waitForFunction((k) => document.querySelector(`[data-plugin="${k}"] button[role="switch"]`)?.getAttribute('aria-checked') === 'true', { timeout: 15000 }, id);
    await host.click('.modal__actions button', '完成');
    await host.page.waitForFunction(() => globalThis.__SP__.store.get().room?.content?.vanilla === false, { timeout: 30000 });
    await host.page.waitForSelector('[data-testid="native-consent"]', { timeout: 30000 });
    await host.click('[data-testid="native-accept"]');
    await host.page.waitForFunction(() => globalThis.__SP_CONTENT__.state().nativeConsent === true, { timeout: 20000 });
    await host.page.waitForFunction(() => {
      const s = globalThis.__SP__.store.get();
      const seat = (s.room?.seats || []).find((x) => x && x.playerId === s.me?.playerId);
      return !seat || seat.content === 'ready';
    }, { timeout: 60000 });
    assert.equal(srv.lobby.rooms.has(room.code), true, 'the room is alive before the player leaves');
    await host.click('.room-bar__right button', '开始模拟', { timeout: 20000 });
    await host.waitFor((s) => s.phase === 'INFO_CHECK', 'briefing', 30000);
    await host.close();
    const t0 = Date.now();
    while (srv.lobby.rooms.has(room.code) && Date.now() - t0 < 30000) await sleep(250);
    assert.equal(srv.lobby.rooms.has(room.code), false, 'the room is disposed after the last human leaves');
    assert.deepEqual(problemsOf([host]), [], 'no console errors, page errors, failed requests or HTTP errors');
  } finally {
    await host.close().catch(() => {});
  }
});
