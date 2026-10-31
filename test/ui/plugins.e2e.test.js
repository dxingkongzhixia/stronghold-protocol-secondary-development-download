// Real-server browser E2E — cosmetic plugins (DESIGN §32 P1a; opt-in, ~40 s):
//   SP_E2E=1 node --test test/ui/plugins.e2e.test.js
//
// A server with a plugins folder of its own (art made on the spot: a red and a green 8 × 8 square; no file of the game):
// the title screen names the server's plugins (the two here and the built-in factions); in a co-op room both players
// read 原版 at the top; the host opens the 插件 panel and switches the room plugin on — the other player's page now draws
// that operator's avatar from the plugin (/p/…, and that image really loads) and reads 插件 ×1, while the room's cs stays
// the vanilla one. A personal
// plugin nobody switched on changes nothing; switched on in the guest's 设置 → 外观插件 it changes the guest's page only
// (kept in that browser, never the host's), on top of the room's art. The host switches the room plugin off: its art
// leaves the guest's page (the personal one stays). No console / page errors, no failed request but the game's own art
// when this checkout has none.
// A match already drawn (the fast server's starter kit placed on the board): a personal plugin switched on during the
// match changes the picture the piece already on the board draws (render/units.js retryAssets — the field view's
// pieceArt introspection), and switched off brings the installation's back (DESIGN §32 P1a review round 2).
// A server without plugins: its page never asks for the catalogue, a visual set or a plugin file — the title shows no
// count, the room's 插件 panel says there is none, 设置 has no 外观插件 (/healthz and welcome send no count) — and its title
// page loads none of the plugin panel, the asset store or what composes a set (the panel's code only once it opens).
// A server without folder plugins still has the built-in faction plugins (they are in every catalogue), so the page of a
// truly plugin-less server no longer exists: that test stays skipped; the lazy-loading checks live in
// test/ui/plugins-client.test.js.
// One click: the host's 插件 panel 「全部开启」 switches every offered room plugin (built-in factions included) on in one
// request, and 「全部关闭」 clears them; the host's choice is remembered (sp.pref.roomPlugins), so the next room the host
// creates switches the same set on by itself — no panel, no switch — while an empty choice keeps a new room vanilla.
//
// Screenshots: test/e2e/out/plugins-*.png, plugins-board-*.png.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, ROOT, hasChrome, sleep, problemsOf, startRealServer } from '../e2e/client.mjs';
import { png, writePlugin, cosmetic } from '../helpers/pluginFixtures.js';
import { packPlugin } from '../../server/plugins/pack.js';

const ENABLED = process.env.SP_E2E === '1' && hasChrome();

/** Two operators of the 干员调配 roster with an avatar in data/assets.json: [chess record, its avatar asset id]. */
function twoOperators() {
  const chess = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/chess.json'), 'utf8'));
  const assets = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
  const list = Object.values(chess.chess || chess)
    .filter((c) => c && !c.isGolden && !c.isDiy && c.visible !== false && !c.isHidden && (!c.baseId || c.baseId === c.chessId))
    .map((c) => [c, c.assets?.avatar || c.charId])
    .filter(([, id]) => typeof id === 'string' && !id.endsWith('_2') && assets.chars?.[id]?.avatar);
  return [list[0], list[1]];
}

/** The avatar a page draws for an asset id now (data.get('assets'): the art every screen reads). */
const avatarOf = (c, id) => c.page.evaluate((k) => globalThis.__SP__.data.get('assets')?.chars?.[k]?.avatar ?? null, id);

describe('cosmetic plugins in the browser (P1a)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome)' }, () => {
  test('the host switches a room plugin on → the other player sees the new avatar; a personal plugin changes its own page only', { timeout: 4 * 60 * 1000 }, async () => {
    const [[, roomId], [, personalId]] = twoOperators();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-plugins-e2e-'));
    writePlugin(path.join(tmp, 'room-skin'), cosmetic({ name: { zh: '红色头像', en: 'Red avatar' }, authors: ['e2e'],
      assets: { chars: { [roomId]: { avatar: 'art/red.png' } } } }), { 'art/red.png': png(8, 8, [255, 0, 0, 255]) });
    writePlugin(path.join(tmp, 'my-skin'), cosmetic({ name: { zh: '绿色头像', en: 'Green avatar' }, scope: ['personal'],
      assets: { chars: { [personalId]: { avatar: 'art/green.png' } } } }), { 'art/green.png': png(8, 8, [0, 255, 0, 255]) });
    const { startServer } = await import('../../server/index.js');
    const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, pluginsDir: tmp });
    // the content-hash index (built ~1 s after the start): the page then loads the served manifest's /assets/~<hash>/ URLs
    for (const t0 = Date.now(); Date.now() - t0 < 20000;) {
      const h = await fetch(`${srv.url}/healthz?traffic=1`).then((r) => r.json(), () => null);
      if (!h?.assetHashes || h.assetHashes.ready) break;
      await sleep(150);
    }
    const P = (await import('puppeteer-core')).default;
    const host = new Client(P, srv.url, 'host', { prefix: 'plugins', w: 1600, h: 900 });
    const guest = new Client(P, srv.url, 'guest', { prefix: 'plugins', w: 1600, h: 900 });
    try {
      await host.open();
      // the title screen names the server's plugins (its own two plus the built-in factions)
      await host.page.waitForSelector('[data-testid="title-plugins"]', { timeout: 15000 });
      const installedText = await host.page.$eval('[data-testid="title-plugins"]', (e) => e.textContent);
      const installed = Number((installedText.match(/(\d+)/) || [])[1]);
      assert.ok(installed >= 2, `${installedText}: the two room plugins are among the server's`);
      await host.shot('title');
      await host.enter('凯尔希');
      await host.click('.hub-entry--coop');
      await host.page.waitForSelector('.protocol-screen', { timeout: 15000 });
      await host.click('.pcard', '标准模拟');
      await host.click('.proto-start', '创建同盟');
      const code = (await host.waitFor((s) => !!s.room?.code, 'room created')).room.code;
      await guest.open();
      await guest.enter('阿米娅');
      await guest.click('.hub-tile', '加入同盟');
      await guest.page.waitForSelector('.join-row input', { timeout: 10000 });
      await guest.click('.join-row input');
      await guest.page.keyboard.type(code);
      await guest.click('.join-row button', '加入同盟');
      await guest.page.waitForSelector('.room-screen', { timeout: 15000 });
      for (const c of [host, guest]) {
        await c.page.waitForFunction(() => !!globalThis.__SP__.data.get('assets'), { timeout: 20000 });
        assert.match(await c.page.$eval('[data-testid="plugin-tag"]', (e) => e.textContent), /原版/, `${c.label}: 原版 at the top`);
        assert.doesNotMatch(String(await avatarOf(c, roomId)), /^\/p\//);
      }
      const vanilla = await avatarOf(guest, roomId);
      const vanillaCs = await guest.page.evaluate(() => globalThis.__SP__.store.get().content?.vanilla);

      // the host switches the room plugin on in the 插件 panel (a room entry spends the heavy request bucket: let it refill)
      await sleep(2500);
      await host.click('[data-testid="plugin-tag"]');
      await host.page.waitForSelector('[data-testid="plugin-panel"] [data-plugin="room-skin"]', { timeout: 10000 });
      assert.equal(await host.page.$('[data-testid="plugin-panel"] [data-plugin="my-skin"]'), null, 'a personal-only plugin is not offered to the room');
      await host.click('[data-plugin="room-skin"] button[role="switch"]');
      await host.page.waitForFunction(() => document.querySelector('[data-plugin="room-skin"] button[role="switch"]')?.getAttribute('aria-checked') === 'true', { timeout: 10000 });
      await host.shot('panel-host');
      await host.click('.modal__actions button', '完成');

      // the other player: the room's art, its avatar loaded in the 干员调配 card; 插件 ×1; the vanilla cs
      await guest.page.waitForFunction((k) => /^\/p\/room-skin\/[0-9a-f]{8}\/art\/red\.png$/.test(globalThis.__SP__.data.get('assets')?.chars?.[k]?.avatar || ''), { timeout: 20000 }, roomId);
      assert.match(await guest.page.$eval('[data-testid="plugin-tag"]', (e) => e.textContent), /插件 ×1/);
      const content = await guest.page.evaluate(() => globalThis.__SP__.store.get().room.content);
      assert.equal(content.cs, vanillaCs, 'art never changes a battle: the vanilla cs');
      assert.deepEqual(content.plugins.map((p) => p.id), ['room-skin']);
      // the room's avatar URL is the plugin's file, and that file really loads in the guest's page
      const roomAvatar = await avatarOf(guest, roomId);
      assert.match(String(roomAvatar), /^\/p\/room-skin\/[0-9a-f]{8}\/art\/red\.png$/);
      assert.equal(await guest.page.evaluate(async (url) => {
        const img = new Image();
        img.src = url;
        try { await img.decode(); return img.naturalWidth === 8; } catch { return false; }
      }, roomAvatar), true, 'the plugin image loads in the other player\'s page');
      await guest.shot('room-avatar');

      // a personal plugin nobody switched on changes nothing
      for (const c of [host, guest]) assert.doesNotMatch(String(await avatarOf(c, personalId)), /^\/p\//, `${c.label}: the personal plugin is off`);
      // the guest switches it on in 设置 → 外观插件: the guest's page only
      await guest.click('.room-screen [data-testid="settings-btn"]');
      await guest.page.waitForSelector('[data-testid="personal-plugins"] [data-plugin="my-skin"]', { timeout: 10000 });
      await guest.page.$eval('[data-testid="personal-plugins"]', (e) => e.scrollIntoView({ block: 'center' }));
      await guest.click('[data-testid="personal-plugins"] [data-plugin="my-skin"] button[role="switch"]');
      await guest.page.waitForFunction((k) => /^\/p\/my-skin\//.test(globalThis.__SP__.data.get('assets')?.chars?.[k]?.avatar || ''), { timeout: 20000 }, personalId);
      await guest.shot('settings-personal');
      await guest.click('.modal__actions button', '完成');
      assert.match(String(await avatarOf(guest, roomId)), /^\/p\/room-skin\//, 'the room\'s art stays under the personal one');
      assert.deepEqual(await guest.page.evaluate(() => JSON.parse(localStorage.getItem('sp.pref.cosmetics'))), ['my-skin'], 'kept in this browser');
      await sleep(800);
      assert.doesNotMatch(String(await avatarOf(host, personalId)), /^\/p\//, 'the host\'s page never sees the guest\'s personal plugin');
      assert.equal(await host.page.evaluate(() => localStorage.getItem('sp.pref.cosmetics')), null);

      // the host switches the room plugin off: its art leaves the guest's page, the personal one stays
      await host.click('[data-testid="plugin-tag"]');
      await host.click('[data-plugin="room-skin"] button[role="switch"]');
      await guest.page.waitForFunction((k, v) => globalThis.__SP__.data.get('assets')?.chars?.[k]?.avatar === v, { timeout: 20000 }, roomId, vanilla);
      assert.match(String(await avatarOf(guest, personalId)), /^\/p\/my-skin\//);
      assert.match(await guest.page.$eval('[data-testid="plugin-tag"]', (e) => e.textContent), /原版/);
      await guest.shot('room-vanilla-again');

      // no errors; a failed request only for the game's own art when this checkout has none
      const art = fs.existsSync(path.join(ROOT, 'public/assets'));
      const problems = problemsOf([host, guest]).filter((p) => art || !/\/assets\//.test(p));
      assert.deepEqual(problems, []);
    } finally {
      await host.close();
      await guest.close();
      await srv.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('the host turns every room plugin on at once, and a new room restores that choice', { timeout: 4 * 60 * 1000 }, async () => {
    const [[, idA], [, idB]] = twoOperators();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-plugins-all-'));
    writePlugin(path.join(tmp, 'room-a'), cosmetic({ name: { zh: '外观 A', en: 'Skin A' },
      assets: { chars: { [idA]: { avatar: 'art/a.png' } } } }), { 'art/a.png': png(8, 8, [255, 0, 0, 255]) });
    writePlugin(path.join(tmp, 'room-b'), cosmetic({ name: { zh: '外观 B', en: 'Skin B' },
      assets: { chars: { [idB]: { avatar: 'art/b.png' } } } }), { 'art/b.png': png(8, 8, [0, 0, 255, 255]) });
    const { startServer } = await import('../../server/index.js');
    const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, pluginsDir: tmp });
    for (const t0 = Date.now(); Date.now() - t0 < 20000;) {
      const h = await fetch(`${srv.url}/healthz?traffic=1`).then((r) => r.json(), () => null);
      if (!h?.assetHashes || h.assetHashes.ready) break;
      await sleep(150);
    }
    const P = (await import('puppeteer-core')).default;
    const host = new Client(P, srv.url, 'host', { prefix: 'plugins-all', w: 1600, h: 900 });
    /** Create a room through the lobby's own clicks (the hub's 同盟模拟 entry or the protocol screen left open). */
    const createRoom = async () => {
      if (!(await host.page.$('.protocol-screen'))) {
        await host.click('.hub-entry--coop');
        await host.page.waitForSelector('.protocol-screen', { timeout: 15000 });
      }
      await host.click('.pcard', '标准模拟');
      await host.click('.proto-start', '创建同盟');
      await host.page.waitForSelector('.room-screen', { timeout: 15000 });
      await host.page.waitForSelector('[data-testid="plugin-tag"]', { timeout: 15000 });
      await host.page.waitForFunction(() => !!globalThis.__SP__.store.get().room, { timeout: 15000 });
      return (await host.waitFor((s) => !!s.room?.code, 'room created')).room.code;
    };
    /** Leave through the room's own danger button (a solo host leaves at once; with others a confirm dialog asks). */
    const leaveRoom = async () => {
      await host.click('button[aria-label="离开同盟"]');
      await host.click('.modal__actions button', '离开', { optional: true, timeout: 3000 });
      await host.page.waitForFunction(() => !globalThis.__SP__.store.get().room, { timeout: 15000 });
    };
    const roomPlugins = () => host.page.evaluate(() => (globalThis.__SP__.store.get().room?.content?.plugins || []).map((p) => p.id));
    /** The host's own choice (what the server did not add because another plugin requires it): what a new room restores. */
    const chosenPlugins = () => host.page.evaluate(() => (globalThis.__SP__.store.get().room?.content?.plugins || []).filter((p) => !p.auto).map((p) => p.id));
    try {
      await host.open();
      await host.enter('凯尔希');
      await createRoom();
      assert.match(await host.page.$eval('[data-testid="plugin-tag"]', (e) => e.textContent), /原版/);

      // one click: every offered room plugin on (the built-in factions are offered too)
      await host.click('[data-testid="plugin-tag"]');
      await host.page.waitForSelector('[data-testid="plugin-all-on"]', { timeout: 10000 });
      await sleep(2000);
      await host.click('[data-testid="plugin-all-on"]');
      await host.page.waitForFunction(() => {
        const ids = (globalThis.__SP__.store.get().room?.content?.plugins || []).map((p) => p.id);
        return ids.includes('room-a') && ids.includes('room-b');
      }, { timeout: 30000 });
      const chosen = await chosenPlugins();
      assert.ok(chosen.includes('room-a') && chosen.includes('room-b'), JSON.stringify(chosen));
      // every switch in the panel is on
      assert.equal(await host.page.evaluate(() => [...document.querySelectorAll('[data-testid="plugin-panel"] [data-plugin] button[role="switch"]')].every((b) => b.getAttribute('aria-checked') === 'true')), true);
      assert.match(await host.page.$eval('[data-testid="plugin-tag"]', (e) => e.textContent), /插件 ×\d+/);
      await host.shot('all-on');
      await host.click('.modal__actions button', '完成');
      assert.match(String(await host.page.evaluate(() => localStorage.getItem('sp.pref.roomPlugins'))), /room-a/);

      // the next room the host creates switches the same set on by itself (no panel, no switch)
      await leaveRoom();
      await createRoom();
      await host.page.waitForFunction(() => {
        const ids = (globalThis.__SP__.store.get().room?.content?.plugins || []).map((p) => p.id);
        return ids.includes('room-a') && ids.includes('room-b');
      }, { timeout: 30000 });
      assert.deepEqual(await chosenPlugins(), chosen, 'a new room restores the remembered set');
      assert.match(await host.page.$eval('[data-testid="plugin-tag"]', (e) => e.textContent), /插件 ×\d+/);
      await host.shot('auto-restored');

      // 全部关闭 is remembered too: the next room stays vanilla
      await host.click('[data-testid="plugin-tag"]');
      await host.page.waitForSelector('[data-testid="plugin-all-off"]', { timeout: 10000 });
      await sleep(2000);
      await host.click('[data-testid="plugin-all-off"]');
      await host.page.waitForFunction(() => (globalThis.__SP__.store.get().room?.content?.plugins || []).length === 0, { timeout: 30000 });
      await host.click('.modal__actions button', '完成');
      await leaveRoom();
      await createRoom();
      await sleep(1500);
      assert.deepEqual(await roomPlugins(), [], 'an empty choice is remembered as well');
      assert.match(await host.page.$eval('[data-testid="plugin-tag"]', (e) => e.textContent), /原版/);

      const art = fs.existsSync(path.join(ROOT, 'public/assets'));
      const problems = problemsOf([host]).filter((p) => art || !/\/assets\//.test(p));
      assert.deepEqual(problems, []);
    } finally {
      await host.close();
      await srv.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('a native Keel sim module (and the reference template) runs inside the browser battle', { timeout: 5 * 60 * 1000 }, async () => {
    const [[chess]] = twoOperators();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-keel-native-e2e-'));
    const dir = path.join(tmp, 'native-e2e');
    fs.mkdirSync(path.join(dir, 'content'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'sim'), { recursive: true });
    const record = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/_template/keel-multi-module/content/enemies.json'), 'utf8'));
    record.entries[0].id = 'enemy_x_native_e2e_demo';
    record.entries[0].value.key = 'enemy_x_native_e2e_demo';
    fs.writeFileSync(path.join(dir, 'content/enemies.json'), JSON.stringify(record));
    fs.writeFileSync(path.join(dir, 'sim/index.js'), [
      // The module runs in SES (keelSandbox.js): this write lands in the compartment's global, never in this page.
      'globalThis.__KEEL_NATIVE_E2E__ = (globalThis.__KEEL_NATIVE_E2E__ || 0) + 1;',
      // The membrane hides the page's intrinsics: this must throw instead of polluting the page's Object.prototype.
      'let pwned = false;',
      'let spawnedOk = false;',
      'let damagedOk = false;',
      'export default {',
      '  setup({ api }) {',
      '    api.state.patch({ ticks: 0 });',
      '    try { api.constructor.prototype.__KEEL_PWN__ = 1; pwned = true; } catch { pwned = false; }',
      '  },',
      '  hooks: {',
      "    'sim.tick'(_ctx, api) {",
      '      const s = api.state.get();',
      '      const next = { ticks: s.ticks + 1 };',
      // exercise the host capability surface once: spawn a content enemy, damage it, read units, roll the host rng
      '      if (next.ticks === 1) {',
      '        const spawned = api.spawn({ side: "enemy", enemyKey: "enemy_x_native_e2e_demo", tag: "refractor", hp: 50, maxHp: 50, x: 1, y: 0 });',
      '        spawnedOk = spawned?.ok === true;',
      '        damagedOk = spawnedOk ? api.damage({ target: spawned.id, amount: 1, type: "arts" })?.ok === true : false;',
      '      }',
      '      api.state.patch(next);',
      '      const units = api.units({ side: "enemy", alive: true, limit: 3 });',
      '      api.setView({ ticks: next.ticks, pwned, spawn: spawnedOk, hit: damagedOk, units: units.length,',
      '        roll: api.rng("e2e").int(4), document: typeof globalThis.document, host: typeof globalThis.__KEEL_NATIVE_E2E__ });',
      '    },',
      '  },',
      '};',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
      manifest: 3, id: 'native-e2e', name: 'Native E2E', version: '1.0.0', app: '*',
      api: { content: 1, sim: 1 }, scope: ['room'], trust: 'sandbox',
      modules: [
        { kind: 'content', files: ['content/enemies.json'], parts: { data: ['content/enemies.json'] }, permissions: ['content.define'], provides: ['enemy:enemy_x_native_e2e_demo'] },
        { kind: 'sim', entry: 'sim/index.js', permissions: ['sim.read', 'sim.damage.write', 'sim.spawn', 'sim.rng'] },
      ],
    }, null, 2));
    // The reference template (content + asset + sim + policy + ui) joins the same room: the E2E proves the documented
    // author chain, not only the purpose-built security probe above.
    fs.cpSync(path.join(ROOT, 'plugins/_template/keel-reference'), path.join(tmp, 'keel-reference'), { recursive: true });
    const packed = packPlugin(dir, { dataDir: path.join(ROOT, 'data') });
    assert.equal(packed.wrote, true, JSON.stringify(packed.build?.issues ?? []));
    const srv = await startRealServer({
      fast: { timerScale: 1, combatSpeed: 2, startRound: 1, chess: [chess.chessId], autoPlace: true },
      pluginsDir: tmp,
      env: { KEEL: '1', SP_PLUGIN_SCRIPTS: 'sandbox' },
    });
    const P = (await import('puppeteer-core')).default;
    const c = new Client(P, srv.base, 'native', { prefix: 'plugins-native', w: 1600, h: 900 });
    const pageLogs = [];
    try {
      await c.open();
      c.page.on('console', (m) => pageLogs.push(`${m.type()}: ${m.text()}`));
      await c.enter('凯尔希');
      await c.click('.hub-entry--solo');
      await c.page.waitForSelector('.protocol-screen', { timeout: 15000 });
      await c.click('.pcard', '标准模拟');
      await c.click('.proto-start', '开始独立模拟');
      await c.waitFor((s) => !!s.room, 'solo room');
      await sleep(2000);
      await c.click('[data-testid="plugin-tag"]');
      await c.click('[data-category="gameplay"]');
      await c.page.waitForSelector('[data-plugin="native-e2e"]', { timeout: 15000 });
      await c.click('[data-plugin="native-e2e"] button[role="switch"]');
      await c.page.waitForFunction(() => document.querySelector('[data-plugin="native-e2e"] button[role="switch"]')?.getAttribute('aria-checked') === 'true', { timeout: 15000 });
      await c.click('[data-category="enemy"]');
      await c.page.waitForSelector('[data-plugin="keel-reference"]', { timeout: 15000 });
      await c.click('[data-plugin="keel-reference"] button[role="switch"]');
      await c.page.waitForFunction(() => document.querySelector('[data-plugin="keel-reference"] button[role="switch"]')?.getAttribute('aria-checked') === 'true', { timeout: 15000 });
      await c.click('.modal__actions button', '完成');
      // the content set with the native module downloads and checks, then waits for THIS browser's native-code consent
      await c.page.waitForFunction(() => globalThis.__SP__.store.get().room?.content?.vanilla === false, { timeout: 30000 });
      await c.page.waitForSelector('[data-testid="native-consent"]', { timeout: 30000 });
      const before = await c.page.evaluate(() => {
        const s = globalThis.__SP__.store.get();
        const seat = (s.room?.seats || []).find((x) => x && x.playerId === s.me?.playerId);
        return {
          cs: s.room?.content?.cs ?? null,
          consent: globalThis.__SP_CONTENT__.state().nativeConsent,
          seat: seat?.content ?? null,
          stored: localStorage.getItem('sp.plugin.native.' + s.room?.content?.cs),
          mark: !!document.querySelector('[data-testid="native-code-mark"]'),
        };
      });
      assert.equal(before.consent, false, 'native code is not authorized before the answer');
      assert.notEqual(before.seat, 'ready', 'the seat is not ready while consent is missing');
      assert.equal(before.stored, null);
      assert.equal(before.mark, true, 'the room marks the native-code set');
      // Declining keeps the seat un-ready and the gate up; accepting then marks it ready.
      await c.click('[data-testid="native-reject"]');
      await c.page.waitForSelector('[data-testid="native-declined"]', { timeout: 15000 });
      const stillOff = await c.page.evaluate(() => {
        const s = globalThis.__SP__.store.get();
        const seat = (s.room?.seats || []).find((x) => x && x.playerId === s.me?.playerId);
        return { consent: globalThis.__SP_CONTENT__.state().nativeConsent, seat: seat?.content ?? null };
      });
      assert.equal(stillOff.consent, false);
      assert.notEqual(stillOff.seat, 'ready');
      await c.click('[data-testid="native-accept"]');
      await c.page.waitForFunction(() => globalThis.__SP_CONTENT__.state().nativeConsent === true, { timeout: 15000 });
      await c.page.waitForFunction(() => {
        const s = globalThis.__SP__.store.get();
        const seat = (s.room?.seats || []).find((x) => x && x.playerId === s.me?.playerId);
        return !seat || seat.content === 'ready';
      }, { timeout: 60000 });
      const after = await c.page.evaluate(() => ({
        stored: localStorage.getItem('sp.plugin.native.' + globalThis.__SP__.store.get().room?.content?.cs),
        bar: !!document.querySelector('[data-testid="native-consent"]'),
        mark: !!document.querySelector('[data-testid="native-code-mark"]'),
      }));
      assert.equal(after.stored, 'yes', 'the answer is remembered for this content set');
      assert.equal(after.bar, false, 'the consent bar goes away after the answer');
      assert.equal(after.mark, true, 'the marker stays');
      if (!(await c.st()).phase) await c.click('.room-bar__right button', '开始模拟', { timeout: 20000 });
      await c.waitFor((s) => s.phase === 'INFO_CHECK', 'briefing', 30000);
      await c.click('.brief__foot .btn--primary', '准备就绪');
      await c.waitFor((s) => s.phase === 'BAND_DRAFT', 'band draft', 30000);
      await c.click('.dband', null, { nth: 1 });
      await c.click('.draft-detail__btns .btn--primary', '确认选择');
      await c.waitFor((s) => s.phase === 'PREP', 'prep', 60000);
      if ((await c.st()).phase === 'PREP') await c.click('.readybtn', null, { timeout: 30000 });
      // the battle runs: both modules' sim.tick reaches the page through the Keel runtime, and their code stays in SES
      await c.page.waitForFunction(() => {
        const b = globalThis.__SP_RUNNER__?.currentBattle?.();
        const rts = b?.keels ?? (b?.keel ? [b.keel] : []);
        return rts.length === 2 && rts.every((r) => r.started)
          && rts.some((r) => Object.values(r.views ?? {}).some((v) => v && v.ticks > 0))
          && rts.some((r) => Object.values(r.views ?? {}).some((v) => v && v.waves > 0));
      }, { timeout: 60000 });
      const probe = await c.page.evaluate(() => {
        const b = globalThis.__SP_RUNNER__.currentBattle();
        const rts = b.keels ?? (b.keel ? [b.keel] : []);
        return {
          pageGlobal: typeof globalThis.__KEEL_NATIVE_E2E__, pagePwn: ({}).__KEEL_PWN__ ?? null,
          errors: rts.flatMap((r) => r.errors), views: Object.assign({}, ...rts.map((r) => r.views)), modules: rts.flatMap((r) => r.modules),
          runtimes: rts.length,
        };
      });
      assert.equal(probe.pageGlobal, 'undefined', 'the module never touches the page global');
      assert.equal(probe.pagePwn, null, 'the membrane keeps the page\'s prototypes out of reach');
      assert.deepEqual(probe.errors, []);
      assert.equal(probe.modules.length, 2, `the security probe and the reference template both ran: ${JSON.stringify({ modules: probe.modules, views: Object.keys(probe.views), errors: probe.errors, runtimes: probe.runtimes, pageGlobal: probe.pageGlobal, logs: pageLogs.slice(-12) })}`);
      const view = Object.values(probe.views).find((v) => v && v.pwned !== undefined);
      assert.ok(view, 'the security probe published its view');
      assert.equal(view.document, 'undefined');
      assert.equal(view.host, 'number');
      assert.equal(view.pwned, false);
      // The host capability surface crosses the membrane intact: spawn + damage + units + rng all answered.
      assert.equal(view.spawn, true);
      assert.equal(view.hit, true);
      assert.ok(view.units >= 1);
      assert.ok(Number.isInteger(view.roll));
      // The reference template's own content enemy and sim: shards spawned and hit their targets in the real battle.
      const reference = Object.values(probe.views).find((v) => v && v.waves !== undefined);
      assert.ok(reference, `the reference template published its view: ${JSON.stringify({ views: probe.views, errors: probe.errors })}`);
      assert.ok(reference.waves >= 1, 'a shard wave spawned');
      assert.ok(reference.hits >= 1, 'the shard aura hit');
      await c.shot('native-module-running');
      const art = fs.existsSync(path.join(ROOT, 'public/assets'));
      assert.deepEqual(problemsOf([c]).filter((p) => art || !/\/assets\//.test(p)), []);
    } finally {
      await c.close().catch(() => {});
      await srv.stop().catch(() => {});
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('a server without plugins: its page never asks for the catalogue (title, the room\'s 插件 panel, 设置)', { skip: 'built-in faction plugins give every server a catalogue; the empty-plugins page this test drove no longer exists', timeout: 2 * 60 * 1000 }, async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-plugins-none-'));
    const { startServer } = await import('../../server/index.js');
    const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, pluginsDir: tmp });
    const seen = [];
    srv.server.on('request', (req) => seen.push(req.url));
    const P = (await import('puppeteer-core')).default;
    const c = new Client(P, srv.url, 'vanilla', { prefix: 'plugins-none', w: 1600, h: 900 });
    try {
      await c.open();
      // the build guard's first /healthz (before any hello) says how many plugins the server has — none here
      for (const t0 = Date.now(); !seen.some((u) => u.startsWith('/healthz')) && Date.now() - t0 < 15000;) await sleep(100);
      await sleep(300);
      assert.equal(await c.page.evaluate(() => globalThis.__SP__.store.get().installedPlugins), 0, '/healthz sent no count');
      assert.equal(await c.page.$('[data-testid="title-plugins"]'), null, 'no count on the title');
      const lazy = ['/js/assets.js', '/js/ui/pluginPanel.js', '/shared/plugins/visual.js'];
      const loaded = (u) => seen.some((x) => x.split('?')[0] === u);
      assert.ok(loaded('/js/content.js') && loaded('/js/cosmetics.js'), 'the small parts load with the page');
      for (const u of lazy) assert.equal(loaded(u), false, `the title page does not load ${u}`);
      await c.enter('凯尔希');
      await c.click('.hub-entry--coop');
      await c.page.waitForSelector('.protocol-screen', { timeout: 15000 });
      await c.click('.pcard', '标准模拟');
      await c.click('.proto-start', '创建同盟');
      await c.waitFor((st) => !!st.room?.code, 'room created');
      await c.click('[data-testid="plugin-tag"]');
      await c.page.waitForSelector('[data-testid="plugin-panel"]', { timeout: 10000 });
      assert.match(await c.page.$eval('[data-testid="plugin-panel"]', (e) => e.textContent), /本服务器没有可在房间中使用的插件/);
      await c.click('.modal__actions button', '完成');
      await c.click('.room-screen [data-testid="settings-btn"]');
      await c.page.waitForSelector('.set-list', { timeout: 10000 });
      assert.equal(await c.page.$('[data-testid="personal-plugins"]'), null, 'no 外观插件 section');
      await sleep(500);
      assert.deepEqual(seen.filter((u) => /^\/(plugins|vs|p)\//.test(u)), [], 'no catalogue, no visual set, no plugin file');
      assert.equal(loaded('/js/ui/pluginPanel.js'), true, 'the panel\'s code once it opened');
      assert.equal(loaded('/shared/plugins/visual.js'), false, 'never what composes a set');
      assert.equal(loaded('/js/assets.js'), false, 'nor the asset store before a match');
      const art = fs.existsSync(path.join(ROOT, 'public/assets'));
      assert.deepEqual(problemsOf([c]).filter((p) => art || !/\/assets\//.test(p)), []);
    } finally {
      await c.close();
      await srv.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('a match already drawn: a personal plugin switched on → the piece on the board draws its picture; off → the installation\'s again', { timeout: 4 * 60 * 1000 }, async () => {
    const [[chess, avatarId]] = twoOperators();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-plugins-board-'));
    writePlugin(path.join(tmp, 'board-skin'), cosmetic({ name: { zh: '棋盘头像', en: 'Board avatar' }, scope: ['personal'],
      assets: { chars: { [avatarId]: { avatar: 'art/blue.png' } } } }), { 'art/blue.png': png(8, 8, [0, 0, 255, 255]) });
    const srv = await startRealServer({ fast: { timerScale: 1, combatSpeed: 2, startRound: 1, chess: [chess.chessId], autoPlace: true }, pluginsDir: tmp });
    const P = (await import('puppeteer-core')).default;
    const c = new Client(P, srv.base, 'solo', { prefix: 'plugins-board', w: 1600, h: 900 });
    const art = (uid) => c.page.evaluate((u) => globalThis.__SP_VIEW__?.raw?.pieceArt?.(u) ?? null, uid);
    try {
      await c.open();
      await c.enter('凯尔希');
      await c.page.waitForFunction(() => !!globalThis.__SP__.data.get('assets'), { timeout: 60000 });
      await c.click('.hub-entry--solo');
      await c.page.waitForSelector('.protocol-screen', { timeout: 15000 });
      await c.click('.pcard', '标准模拟');
      await c.click('.proto-start', '开始独立模拟');
      await c.waitFor((s) => !!s.room, 'solo room');
      if (!(await c.st()).phase) await c.click('.room-bar__right button', '开始模拟', { timeout: 20000 });
      await c.waitFor((s) => s.phase === 'INFO_CHECK', 'briefing', 30000);
      await c.click('.brief__foot .btn--primary', '准备就绪');
      await c.waitFor((s) => s.phase === 'BAND_DRAFT', 'band draft', 30000);
      await c.click('.dband', null, { nth: 1 });
      await c.click('.draft-detail__btns .btn--primary', '确认选择');
      await c.waitFor((s) => s.phase === 'PREP' && s.board > 0, 'prep with the starter kit on the board', 60000);
      const piece = (await c.boardPieces()).find((p) => p.id === chess.chessId);
      assert.ok(piece, 'the kit operator stands on the board');
      // the board drew the installation's picture for it
      await c.page.waitForFunction((u) => !!globalThis.__SP_VIEW__?.raw?.pieceArt?.(u)?.picture, { timeout: 60000 }, piece.uid);
      const before = await art(piece.uid);
      assert.doesNotMatch(before.picture, /^\/p\//);
      // switched on during the match (设置 → 外观插件 — that switch is the first test's): the view already drawn follows
      await c.page.evaluate(() => import('/js/content.js').then((m) => m.setPersonalPlugin('board-skin', true)));
      await c.page.waitForFunction((u) => { const a = globalThis.__SP_VIEW__.raw.pieceArt(u); return /^\/p\/board-skin\/[0-9a-f]{8}\/art\/blue\.png$/.test(a?.picture || '') && a.pictureState === 'img'; },
        { timeout: 20000 }, piece.uid);
      await c.shot('personal-on');
      // switched off: the installation's picture again
      await c.page.evaluate(() => import('/js/content.js').then((m) => m.setPersonalPlugin('board-skin', false)));
      await c.page.waitForFunction((u, v) => globalThis.__SP_VIEW__.raw.pieceArt(u)?.picture === v, { timeout: 20000 }, piece.uid, before.picture);
      const assetsHere = fs.existsSync(path.join(ROOT, 'public/assets'));
      assert.deepEqual(problemsOf([c]).filter((p) => assetsHere || !/\/assets\//.test(p)), []);
    } finally {
      await c.close();
      await srv.stop();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('two room plugins that change the same art warn, and reapply picks up a changed file', { timeout: 4 * 60 * 1000 }, async () => {
    const [[, avatarId]] = twoOperators();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-plugins-conflict-'));
    const art = (color) => png(8, 8, color);
    writePlugin(path.join(tmp, 'red-a'), cosmetic({ name: { zh: '红色A', en: 'Red A' }, assets: { chars: { [avatarId]: { avatar: 'art/red.png' } } } }), { 'art/red.png': art([255, 0, 0, 255]) });
    writePlugin(path.join(tmp, 'blue-b'), cosmetic({ name: { zh: '蓝色B', en: 'Blue B' }, assets: { chars: { [avatarId]: { avatar: 'art/blue.png' } } } }), { 'art/blue.png': art([0, 0, 255, 255]) });
    const srv = await startRealServer({ fast: { timerScale: 1, combatSpeed: 2, startRound: 1 }, pluginsDir: tmp });
    const P = (await import('puppeteer-core')).default;
    const c = new Client(P, srv.base, 'conflict', { prefix: 'plugins-conflict', w: 1600, h: 900 });
    try {
      await c.open();
      await c.enter('凯尔希');
      await c.click('.hub-entry--solo');
      await c.page.waitForSelector('.protocol-screen', { timeout: 15000 });
      await c.click('.pcard', '标准模拟');
      await c.click('.proto-start', '开始独立模拟');
      await c.waitFor((s) => !!s.room, 'solo room');
      await c.click('[data-testid="plugin-tag"]');
      await c.page.waitForSelector('[data-plugin="red-a"]', { timeout: 15000 });
      await c.page.waitForSelector('[data-plugin="blue-b"]', { timeout: 15000 });
      // room.setPlugins shares the heavy request bucket with entering the room: let it refill before each switch
      for (const id of ['red-a', 'blue-b']) {
        await sleep(2200);
        await c.click(`[data-plugin="${id}"] button[role="switch"]`);
        await c.page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('aria-checked') === 'true', { timeout: 15000 }, `[data-plugin="${id}"] button[role="switch"]`);
      }
      const first = await c.page.evaluate(() => globalThis.__SP__.store.get().room.content);
      assert.equal(first.vanilla, true, 'cosmetic plugins never change the battle cs');
      assert.ok(first.vs, 'the room has a visual set');
      assert.deepEqual(first.plugins.map((p) => p.id), ['blue-b', 'red-a'], 'load order, later one wins');
      const warning = await c.page.$eval('[data-testid="plugin-panel"] .plugpanel__warnings', (e) => e.textContent);
      assert.match(warning, /红色A/);
      assert.match(warning, /蓝色B/);
      await c.page.waitForFunction((k) => /^\/p\/red-a\//.test(globalThis.__SP__.data.get('assets')?.chars?.[k]?.avatar || ''), { timeout: 20000 }, avatarId);
      // a file changes on disk: the same choice (重新应用) rebuilds the vs from the files as they are now
      fs.writeFileSync(path.join(tmp, 'red-a', 'art/red.png'), art([255, 128, 0, 255]));
      await sleep(1200);
      await c.click('[data-testid="plugin-reapply"]');
      await c.page.waitForFunction((vs) => globalThis.__SP__.store.get().room.content.vs !== vs, { timeout: 20000 }, first.vs);
      const second = await c.page.evaluate(() => globalThis.__SP__.store.get().room.content);
      assert.notEqual(second.vs, first.vs);
      assert.deepEqual(second.plugins.map((p) => p.id), ['blue-b', 'red-a']);
      assert.deepEqual(problemsOf([c]).filter((p) => !/fonts|woff2/.test(p)), []);
    } finally {
      await c.close().catch(() => {});
      await srv.stop().catch(() => {});
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
