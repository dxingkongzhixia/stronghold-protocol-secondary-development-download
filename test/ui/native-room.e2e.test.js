// Real-browser 4-seat native room (N4): 2 humans + 2 AI, one native sim plugin. Every player's own field runs in its
// own page; the two AI fields are delegated to the browsers as background `b.start` (the room host first), never run by
// the server. The room has MAX_SEATS = 4 (humans + AI), so "4 humans + bots" is 4 seats with a mix.
//
// Opt-in: SP_E2E=1 node --test test/ui/native-room.e2e.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, ROOT, hasChrome, sleep, problemsOf, startRealServer } from '../e2e/client.mjs';
import { packPlugin } from '../../server/plugins/pack.js';

const ENABLED = process.env.SP_E2E === '1' && hasChrome();

function nativePlugin(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-native-room-e2e-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const id = 'native-room';
  const dir = path.join(tmp, id);
  fs.mkdirSync(path.join(dir, 'sim'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sim/index.js'), [
    'export default {',
    '  setup({ api }) { api.state.patch({ ticks: 0 }); },',
    "  hooks: { 'sim.tick'(_ctx, api) { const s = api.state.get(); api.state.patch({ ticks: s.ticks + 1 }); api.setView({ ticks: s.ticks + 1 }); } },",
    '};',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    manifest: 3, id, name: 'Native room E2E', version: '1.0.0', app: '*',
    api: { sim: 1 }, scope: ['room'], trust: 'sandbox',
    modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.code'] }],
  }, null, 2));
  const packed = packPlugin(dir, { dataDir: path.join(ROOT, 'data') });
  assert.equal(packed.wrote, true, JSON.stringify(packed.build?.issues ?? []));
  return { tmp, id };
}

/** The two chess of a starter kit for the humans and the bots. */
function starterKit() {
  const chess = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/chess.json'), 'utf8'));
  const list = Object.values(chess.chess || chess)
    .filter((c) => c && !c.isGolden && !c.isDiy && c.visible !== false && !c.isHidden && (!c.baseId || c.baseId === c.chessId))
    .map((c) => c.chessId);
  assert.ok(list.length >= 2, 'the data has at least two field operators');
  return [list[0], list[1]];
}

/** Pick a band whenever it is this client's turn, until the draft ends. */
async function draftBands(clients) {
  const t0 = Date.now();
  const picked = new Set();
  while (Date.now() - t0 < 120000) {
    let drafting = false;
    for (const c of clients) {
      const s = await c.st();
      if (s.phase !== 'BAND_DRAFT') continue;
      drafting = true;
      if (s.draft?.turn !== s.me || picked.has(c.label)) continue;
      picked.add(c.label);
      await c.click('.dband', null, { nth: 1 });
      await c.click('.draft-detail__btns .btn--primary', '确认选择');
    }
    if (!drafting) return;
    await sleep(200);
  }
  throw new Error('band draft did not finish');
}

test('1 human + 3 AI: one browser runs its own field and all three AI fields', { timeout: 8 * 60 * 1000 }, async (t) => {
  if (!ENABLED) { t.skip('set SP_E2E=1 (and have Chrome)'); return; }
  const { tmp, id } = nativePlugin(t);
  const [a] = starterKit();
  const srv = await startRealServer({
    fast: { timerScale: 1, combatSpeed: 2, startRound: 1, kits: [[a]], botChess: [a], autoPlace: true },
    pluginsDir: tmp,
    env: { KEEL: '1', SP_PLUGIN_SCRIPTS: 'sandbox' },
  });
  const P = (await import('puppeteer-core')).default;
  const host = new Client(P, srv.base, 'host', { prefix: 'native-room', w: 1600, h: 900 });
  const logs = [];
  try {
    await host.open();
    host.page.on('console', (m) => logs.push(`host ${m.type()}: ${m.text()}`));
    await host.enter('凯尔希');
    await host.click('.hub-entry--coop');
    await host.page.waitForSelector('.protocol-screen', { timeout: 15000 });
    await host.click('.pcard', '标准模拟');
    await host.click('.proto-start', '创建同盟');
    await host.waitFor((s) => !!s.room?.code, 'room created');
    for (let n = 0; n < 3; n++) {
      await host.click('button', '添加 AI 队友');
      await host.page.waitForFunction((k) => document.querySelectorAll('.seat.is-bot').length >= k, { timeout: 15000 }, n + 1);
    }
    await sleep(2500);
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
    await host.click('.room-bar__right button', '开始模拟', { timeout: 20000 });
    await host.waitFor((s) => s.phase === 'INFO_CHECK', 'briefing', 30000);
    await host.click('.brief__foot .btn--primary', '准备就绪');
    await host.waitFor((s) => s.phase === 'BAND_DRAFT', 'band draft', 40000);
    await draftBands([host]);
    await host.waitFor((s) => s.phase === 'PREP', 'prep', 60000);
    if ((await host.st()).phase === 'PREP') await host.click('.readybtn', null, { timeout: 30000 });
    await host.waitFor((s) => s.phase === 'COMBAT', 'combat', 60000);
    await host.page.waitForFunction(() => {
      const r = globalThis.__SP_RUNNER__;
      return [...(r?._entries?.values() ?? [])].filter((e) => e && e.battle).length === 4;
    }, { timeout: 60000 });
    await host.page.waitForFunction(() => {
      const r = globalThis.__SP_RUNNER__;
      const list = [...(r?._entries?.values() ?? [])].filter((e) => e && e.battle);
      return list.length === 4 && list.every((e) => (e.battle.keelAll ?? []).flatMap((rt) => Object.values(rt.views ?? {})).some((v) => v && v.ticks > 0));
    }, { timeout: 30000 });
    const entries = await host.page.evaluate(() => {
      const r = globalThis.__SP_RUNNER__;
      return [...(r?._entries?.values() ?? [])].filter((e) => e && e.battle).map((e) => ({
        fieldId: e.fieldId,
        background: !!e.background,
        own: !!e.own,
        host: !!e.host,
        keels: (e.battle.keelAll ?? []).length,
        keelError: e.battle.keelError ?? null,
        keelInfo: e.battle.keelInfo ?? null,
        ticks: (e.battle.keelAll ?? []).flatMap((rt) => Object.values(rt.views ?? {})).reduce((n, v) => n + (v && v.ticks > 0 ? 1 : 0), 0),
      }));
    });
    assert.equal(entries.length, 4, 'own + three AI fields');
    assert.equal(entries.filter((e) => !e.background).length, 1, 'one own field');
    assert.equal(entries.filter((e) => e.background).length, 3, 'three background fields');
    const aiFields = entries.filter((e) => e.background).map((e) => e.fieldId);
    assert.equal(new Set(aiFields).size, 3, 'three distinct AI fields');
    assert.ok(aiFields.every((f) => /^n:ai_/.test(f)), `the delegated fields are AI fields: ${aiFields}`);
    assert.ok(entries.every((e) => e.ticks > 0), `the native module ticks in every field: ${JSON.stringify(entries)}`);
    assert.equal(await host.page.$eval('[data-testid="native-code-mark"]', (el) => el.textContent.trim()), '原生代码', 'the battle HUD marks native code');
    assert.deepEqual(problemsOf([host]), [], 'no console errors, page errors, failed requests or HTTP errors');
  } finally {
    if (logs.length) console.log(logs.slice(-20).join('\n'));
    await host.close().catch(() => {});
    await srv.stop().catch(() => {});
  }
});

test('2 humans + 2 AI native room: own fields on page, both AI fields delegated to the browsers', { timeout: 8 * 60 * 1000 }, async (t) => {
  if (!ENABLED) { t.skip('set SP_E2E=1 (and have Chrome)'); return; }
  const { tmp, id } = nativePlugin(t);
  const [a, b] = starterKit();
  const srv = await startRealServer({
    fast: { timerScale: 1, combatSpeed: 2, startRound: 1, kits: [[a], [b]], botChess: [a], autoPlace: true },
    pluginsDir: tmp,
    env: { KEEL: '1', SP_PLUGIN_SCRIPTS: 'sandbox' },
  });
  const P = (await import('puppeteer-core')).default;
  const host = new Client(P, srv.base, 'host', { prefix: 'native-room', w: 1600, h: 900 });
  const guest = new Client(P, srv.base, 'guest', { prefix: 'native-room', w: 1600, h: 900 });
  const clients = [host, guest];
  const logs = [];
  try {
    await host.open();
    host.page.on('console', (m) => logs.push(`host ${m.type()}: ${m.text()}`));
    await host.enter('凯尔希');
    await host.click('.hub-entry--coop');
    await host.page.waitForSelector('.protocol-screen', { timeout: 15000 });
    await host.click('.pcard', '标准模拟');
    await host.click('.proto-start', '创建同盟');
    const room = (await host.waitFor((s) => !!s.room?.code, 'room created')).room;

    // two AI seats fill the co-op room (MAX_SEATS = 4)
    await host.click('button', '添加 AI 队友');
    await host.page.waitForFunction(() => document.querySelectorAll('.seat.is-bot').length >= 1, { timeout: 15000 });
    await host.click('button', '添加 AI 队友');
    await host.page.waitForFunction(() => document.querySelectorAll('.seat.is-bot').length >= 2, { timeout: 15000 });

    await guest.open(`?room=${room.code}`);
    guest.page.on('console', (m) => logs.push(`guest ${m.type()}: ${m.text()}`));
    await guest.enter('阿米娅');
    await guest.waitFor((s) => s.room?.code === room.code, 'guest joined', 20000);

    // switch the native plugin on (the room entry spends a heavy bucket: let it refill)
    await sleep(2500);
    await host.click('[data-testid="plugin-tag"]');
    await host.click('[data-category="gameplay"]');
    await host.page.waitForSelector('[data-plugin="' + id + '"]', { timeout: 15000 });
    await host.click(`[data-plugin="${id}"] button[role="switch"]`);
    await host.page.waitForFunction((k) => document.querySelector(`[data-plugin="${k}"] button[role="switch"]`)?.getAttribute('aria-checked') === 'true', { timeout: 15000 }, id);
    await host.click('.modal__actions button', '完成');

    // every browser checks the content set and answers the consent gate for itself
    for (const c of clients) {
      await c.page.waitForFunction(() => globalThis.__SP__.store.get().room?.content?.vanilla === false, { timeout: 30000 });
      await c.page.waitForSelector('[data-testid="native-consent"]', { timeout: 30000 });
      await c.click('[data-testid="native-accept"]');
      await c.page.waitForFunction(() => globalThis.__SP_CONTENT__.state().nativeConsent === true, { timeout: 20000 });
      await c.page.waitForFunction(() => {
        const s = globalThis.__SP__.store.get();
        const seat = (s.room?.seats || []).find((x) => x && x.playerId === s.me?.playerId);
        return !seat || seat.content === 'ready';
      }, { timeout: 60000 });
    }

    // ready + start (bots ready by themselves)
    for (const c of clients) if (c !== host) await c.click('.room-bar__right button', '准备就绪', { timeout: 20000 });
    await host.click('.room-bar__right button', '开始模拟', { timeout: 20000 });
    for (const c of clients) await c.waitFor((s) => s.phase === 'INFO_CHECK', 'briefing', 30000);
    for (const c of clients) await c.click('.brief__foot .btn--primary', '准备就绪');
    for (const c of clients) await c.waitFor((s) => s.phase === 'BAND_DRAFT', 'band draft', 40000);
    await draftBands(clients);
    for (const c of clients) await c.waitFor((s) => s.phase === 'PREP', 'prep', 60000);
    for (const c of clients) if ((await c.st()).phase === 'PREP') await c.click('.readybtn', null, { timeout: 30000 });
    for (const c of clients) await c.waitFor((s) => s.phase === 'COMBAT', 'combat', 60000);

    // each page simulates its own field plus one AI field; both AI fields are background entries
    const entriesOf = (c) => c.page.evaluate(() => {
      const r = globalThis.__SP_RUNNER__;
      return [...(r?._entries?.values() ?? [])]
        .filter((e) => e && e.battle)
        .map((e) => ({ fieldId: e.fieldId, background: !!e.background, authoritative: !!e.authoritative, own: !!e.own }));
    });
    for (const c of clients) {
      await c.page.waitForFunction(() => {
        const r = globalThis.__SP_RUNNER__;
        return [...(r?._entries?.values() ?? [])].filter((e) => e && e.battle).length === 2;
      }, { timeout: 60000 });
    }
    const hostEntries = await entriesOf(host);
    const guestEntries = await entriesOf(guest);
    for (const [label, list] of [['host', hostEntries], ['guest', guestEntries]]) {
      const own = list.filter((e) => !e.background);
      const back = list.filter((e) => e.background);
      assert.equal(own.length, 1, `${label}: exactly one own field`);
      assert.equal(back.length, 1, `${label}: exactly one delegated AI field`);
      assert.equal(own[0].authoritative, true, `${label}: its own field reports`);
      assert.equal(back[0].authoritative, true, `${label}: the background field reports`);
      assert.match(back[0].fieldId, /^n:ai_/, `${label}: the delegated field is an AI field`);
    }
    assert.notEqual(hostEntries.find((e) => e.background)?.fieldId, guestEntries.find((e) => e.background)?.fieldId, 'the two AI fields went to different browsers');

    // the native module runs in both pages
    for (const c of clients) {
      await c.page.waitForFunction(() => {
        const b = globalThis.__SP_RUNNER__?.currentBattle?.();
        return [...(b?.keels ?? (b?.keel ? [b.keel] : []))].every((r) => Object.values(r.views ?? {}).some((v) => v && v.ticks > 0));
      }, { timeout: 60000 });
    }
    // the room host leaves: its fields move to the remaining browser (D12 delegation, not a server run)
    const hostId = (await host.st()).me;
    await host.close();
    await guest.page.waitForFunction((fid) => {
      const list = [...(globalThis.__SP_RUNNER__?._entries?.values() ?? [])].filter((e) => e && e.battle);
      const f = list.find((e) => e.fieldId === fid);
      return !!f && !!f.background && !!f.authoritative;
    }, { timeout: 30000 }, `n:${hostId}`);
    const taken = await guest.page.evaluate((fid) => {
      const list = [...(globalThis.__SP_RUNNER__?._entries?.values() ?? [])].filter((e) => e && e.battle);
      const f = list.find((e) => e.fieldId === fid);
      return { ticks: (f?.battle.keelAll ?? []).flatMap((rt) => Object.values(rt.views ?? {})).filter((v) => v && v.ticks > 0).length, workers: list.filter((e) => e.host).length };
    }, `n:${hostId}`);
    assert.ok(taken.ticks > 0, 'the native module runs in the taken-over field');
    assert.deepEqual(problemsOf([guest]), [], 'no console errors, page errors, failed requests or HTTP errors after the host leaves');
  } finally {
    if (logs.length) console.log(logs.slice(-20).join('\n'));
    if (clients.some((c) => c.problems.length)) console.log(clients.map((c) => `${c.label}: ${c.problems.slice(0, 10).join(' | ')}`).join('\n'));
    for (const c of clients) await c.close().catch(() => {});
    await srv.stop().catch(() => {});
  }
});

test('2 humans + 2 AI native room: the host quits through the exit dialog; the guest becomes host and takes its field', { timeout: 8 * 60 * 1000 }, async (t) => {
  if (!ENABLED) { t.skip('set SP_E2E=1 (and have Chrome)'); return; }
  const { tmp, id } = nativePlugin(t);
  const [a, b] = starterKit();
  const srv = await startRealServer({
    fast: { timerScale: 1, combatSpeed: 2, startRound: 1, kits: [[a], [b]], botChess: [a], autoPlace: true },
    pluginsDir: tmp,
    env: { KEEL: '1', SP_PLUGIN_SCRIPTS: 'sandbox' },
  });
  const P = (await import('puppeteer-core')).default;
  const host = new Client(P, srv.base, 'host', { prefix: 'native-leave', w: 1600, h: 900 });
  const guest = new Client(P, srv.base, 'guest', { prefix: 'native-leave', w: 1600, h: 900 });
  const clients = [host, guest];
  const logs = [];
  try {
    await host.open();
    host.page.on('console', (m) => logs.push(`host ${m.type()}: ${m.text()}`));
    await host.enter('凯尔希');
    await host.click('.hub-entry--coop');
    await host.page.waitForSelector('.protocol-screen', { timeout: 15000 });
    await host.click('.pcard', '标准模拟');
    await host.click('.proto-start', '创建同盟');
    const room = (await host.waitFor((s) => !!s.room?.code, 'room created')).room;
    for (let n = 0; n < 2; n++) {
      await host.click('button', '添加 AI 队友');
      await host.page.waitForFunction((k) => document.querySelectorAll('.seat.is-bot').length >= k, { timeout: 15000 }, n + 1);
    }
    await guest.open(`?room=${room.code}`);
    guest.page.on('console', (m) => logs.push(`guest ${m.type()}: ${m.text()}`));
    await guest.enter('阿米娅');
    await guest.waitFor((s) => s.room?.code === room.code, 'guest joined', 20000);

    await sleep(2500);
    await host.click('[data-testid="plugin-tag"]');
    await host.click('[data-category="gameplay"]');
    await host.page.waitForSelector(`[data-plugin="${id}"]`, { timeout: 15000 });
    await host.click(`[data-plugin="${id}"] button[role="switch"]`);
    await host.page.waitForFunction((k) => document.querySelector(`[data-plugin="${k}"] button[role="switch"]`)?.getAttribute('aria-checked') === 'true', { timeout: 15000 }, id);
    await host.click('.modal__actions button', '完成');
    for (const c of clients) {
      await c.page.waitForFunction(() => globalThis.__SP__.store.get().room?.content?.vanilla === false, { timeout: 30000 });
      await c.page.waitForSelector('[data-testid="native-consent"]', { timeout: 30000 });
      await c.click('[data-testid="native-accept"]');
      await c.page.waitForFunction(() => globalThis.__SP_CONTENT__.state().nativeConsent === true, { timeout: 20000 });
      await c.page.waitForFunction(() => {
        const s = globalThis.__SP__.store.get();
        const seat = (s.room?.seats || []).find((x) => x && x.playerId === s.me?.playerId);
        return !seat || seat.content === 'ready';
      }, { timeout: 60000 });
    }
    for (const c of clients) if (c !== host) await c.click('.room-bar__right button', '准备就绪', { timeout: 20000 });
    await host.click('.room-bar__right button', '开始模拟', { timeout: 20000 });
    for (const c of clients) await c.waitFor((s) => s.phase === 'INFO_CHECK', 'briefing', 30000);
    for (const c of clients) await c.click('.brief__foot .btn--primary', '准备就绪');
    for (const c of clients) await c.waitFor((s) => s.phase === 'BAND_DRAFT', 'band draft', 40000);
    await draftBands(clients);
    for (const c of clients) await c.waitFor((s) => s.phase === 'PREP', 'prep', 60000);
    for (const c of clients) if ((await c.st()).phase === 'PREP') await c.click('.readybtn', null, { timeout: 30000 });
    for (const c of clients) await c.waitFor((s) => s.phase === 'COMBAT', 'combat', 60000);
    for (const c of clients) {
      await c.page.waitForFunction(() => {
        const r = globalThis.__SP_RUNNER__;
        return [...(r?._entries?.values() ?? [])].filter((e) => e && e.battle).length === 2;
      }, { timeout: 60000 });
    }

    const hostId = (await host.st()).me;
    const guestId = (await guest.st()).me;
    // the real UI flow: top-bar exit -> confirm 放弃模拟 (g.leave + room.leave)
    await host.click('.gtop__exit');
    await host.page.waitForSelector('.exitm', { timeout: 15000 });
    await host.click('.modal__actions button', '放弃模拟');
    await host.waitFor((s) => !s.room && !s.match?.public, 'host returned to the lobby', 20000);

    await guest.page.waitForFunction((id) => globalThis.__SP__.store.get().room?.hostId === id, { timeout: 30000 }, guestId);
    await guest.page.waitForFunction((fid) => {
      const list = [...(globalThis.__SP_RUNNER__?._entries?.values() ?? [])].filter((e) => e && e.battle);
      const f = list.find((e) => e.fieldId === fid);
      return !!f && !!f.background && !!f.authoritative;
    }, { timeout: 30000 }, `n:${hostId}`);
    const taken = await guest.page.evaluate((fid) => {
      const list = [...(globalThis.__SP_RUNNER__?._entries?.values() ?? [])].filter((e) => e && e.battle);
      const f = list.find((e) => e.fieldId === fid);
      return { ticks: (f?.battle.keelAll ?? []).flatMap((rt) => Object.values(rt.views ?? {})).filter((v) => v && v.ticks > 0).length, workers: list.filter((e) => e.host).length };
    }, `n:${hostId}`);
    assert.ok(taken.ticks > 0, 'the native module runs in the host field taken over after the UI quit');
    assert.deepEqual(problemsOf([guest]), [], 'the guest page stays clean through host migration');
  } finally {
    if (logs.length) console.log(logs.slice(-20).join('\n'));
    if (clients.some((c) => c.problems.length)) console.log(clients.map((c) => `${c.label}: ${c.problems.slice(0, 10).join(' | ')}`).join('\n'));
    for (const c of clients) await c.close().catch(() => {});
    await srv.stop().catch(() => {});
  }
});
