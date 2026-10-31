// Real-browser Final Assault check for a boss field with no human in it (D12): 1 human + 3 AI, jumped to the boss round.
// The AI+AI pair is a boss field whose two players are bots; the only browser is delegated that field as a background
// `b.start`. The check covers the shared boss pool, the merged team LP, the native sim ticking in that field and the
// settlement rows of its two AI players.
//
//   SP_E2E=1 CHROME_PATH=... node --test test/ui/native-boss.e2e.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, ROOT, hasChrome, problemsOf, startRealServer } from '../e2e/client.mjs';
import { packPlugin } from '../../server/plugins/pack.js';

const ENABLED = process.env.SP_E2E === '1' && hasChrome();

function nativePlugin(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-native-boss-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const id = 'native-boss';
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
    manifest: 3, id, name: 'Native boss E2E', version: '1.0.0', app: '*',
    api: { sim: 1 }, scope: ['room'], trust: 'sandbox',
    modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.code'] }],
  }, null, 2));
  const packed = packPlugin(dir, { dataDir: path.join(ROOT, 'data') });
  assert.equal(packed.wrote, true, JSON.stringify(packed.build?.issues ?? []));
  return { tmp, id };
}

function starterKit() {
  const chess = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/chess.json'), 'utf8'));
  const list = Object.values(chess.chess || chess)
    .filter((c) => c && !c.isGolden && !c.isDiy && c.visible !== false && !c.isHidden && (!c.baseId || c.baseId === c.chessId))
    .map((c) => c.chessId);
  assert.ok(list.length >= 1);
  return [list[0]];
}

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
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('band draft did not finish');
}

test('1 human + 3 AI at the boss round: the AI-only boss field runs in the browser, with pool, merged LP and result', { timeout: 8 * 60 * 1000 }, async (t) => {
  if (!ENABLED) { t.skip('set SP_E2E=1 (and have Chrome)'); return; }
  const { tmp, id } = nativePlugin(t);
  const [a] = starterKit();
  const srv = await startRealServer({
    fast: { timerScale: 1, combatSpeed: 8, startRound: 'boss', kits: [[a]], botChess: [a], autoPlace: true, idleBots: true },
    pluginsDir: tmp,
    env: { KEEL: '1', SP_PLUGIN_SCRIPTS: 'sandbox' },
  });
  const P = (await import('puppeteer-core')).default;
  const host = new Client(P, srv.base, 'boss', { prefix: 'native-boss', w: 1600, h: 900 });
  try {
    await host.open();
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
    await new Promise((r) => setTimeout(r, 2500));
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
    await host.waitFor((s) => s.phase === 'PREP', 'boss prep', 60000);
    if ((await host.st()).phase === 'PREP') await host.click('.readybtn', null, { timeout: 30000 });
    await host.waitFor((s) => s.phase === 'FINAL_ASSAULT', 'Final Assault', 90000);

    // both boss fields exist; one pair contains the human, the other pair contains only AI
    await host.page.waitForFunction(() => {
      const s = globalThis.__SP__.store.get();
      return (s.match?.public?.fields || []).filter((f) => f && (f.kind === 'boss' || f.kind === 'hidden')).length === 2;
    }, { timeout: 30000 });
    await host.page.waitForFunction(() => {
      const r = globalThis.__SP_RUNNER__;
      return [...(r?._entries?.values() ?? [])].filter((e) => e && e.battle).length === 2;
    }, { timeout: 60000 });

    const before = await host.page.evaluate(() => {
      const s = globalThis.__SP__.store.get();
      const me = s.me.playerId;
      const fields = (s.match.public.fields || []).filter((f) => f && (f.kind === 'boss' || f.kind === 'hidden'));
      const entries = [...(globalThis.__SP_RUNNER__?._entries?.values() ?? [])]
        .filter((e) => e && e.battle)
        .map((e) => ({ fieldId: e.fieldId, background: !!e.background, authoritative: !!e.authoritative, host: !!e.host,
          ticks: (e.battle.keelAll ?? []).flatMap((rt) => Object.values(rt.views ?? {})).filter((v) => v && v.ticks > 0).length }));
      return { me, fields, entries, teamLp: s.match.public.teamLp, bossHp: s.match.public.bossHp, players: s.match.public.players };
    });
    assert.equal(before.fields.length, 2, '4 players form two boss pairs');
    const noHuman = before.fields.find((f) => !f.players.includes(before.me));
    assert.ok(noHuman, 'one boss pair has no human');
    assert.equal(noHuman.players.length, 2);
    const entry = before.entries.find((e) => e.fieldId === noHuman.fieldId);
    assert.ok(entry, `the browser has the no-human boss field (${JSON.stringify(before.entries)})`);
    assert.equal(entry.background, true, 'it is a background field, not the player view');
    assert.equal(entry.authoritative, true, 'the browser reports it');
    await host.page.waitForFunction((fid) => {
      const list = [...(globalThis.__SP_RUNNER__?._entries?.values() ?? [])].filter((e) => e && e.battle);
      const f = list.find((e) => e.fieldId === fid);
      return !!f && (f.battle.keelAll ?? []).flatMap((rt) => Object.values(rt.views ?? {})).some((v) => v && v.ticks > 0);
    }, { timeout: 30000 }, noHuman.fieldId);
    const ticks = await host.page.evaluate((fid) => {
      const list = [...(globalThis.__SP_RUNNER__?._entries?.values() ?? [])].filter((e) => e && e.battle);
      const f = list.find((e) => e.fieldId === fid);
      return (f?.battle.keelAll ?? []).flatMap((rt) => Object.values(rt.views ?? {})).filter((v) => v && v.ticks > 0).length;
    }, noHuman.fieldId);
    assert.ok(ticks > 0, 'the native sim ticks in the no-human boss field');
    assert.ok(before.bossHp && Number(before.bossHp.max) > 0, `shared boss pool ${JSON.stringify(before.bossHp)}`);
    assert.ok(Number(before.bossHp.hp) >= 0 && Number(before.bossHp.hp) <= Number(before.bossHp.max), 'the pool stays within its max');
    assert.equal(before.teamLp, before.players.reduce((n, p) => n + (Number(p.lp) || 0), 0), 'the merged LP is the sum of the players\' LP');

    // the fast test jump finishes after the boss round: the result carries both AI rows from the no-human field
    await host.waitFor((s) => s.result === true || s.phase === 'RESULT', 'settlement', 180000);
    const result = await host.page.evaluate(() => globalThis.__SP__.store.get().match.result);
    assert.ok(result && Array.isArray(result.players), JSON.stringify(result));
    const rows = result.players.filter((p) => noHuman.players.includes(p.playerId));
    assert.equal(rows.length, 2, 'both players of the no-human boss field are in the settlement');
    assert.ok(rows.every((p) => p.isBot), 'they are the AI players');
    assert.ok(rows.every((p) => Number.isFinite(p.roundsPassed)), 'each row has its rounds');
    assert.deepEqual(problemsOf([host]), [], 'no console errors, page errors, failed requests or HTTP errors');
  } finally {
    if (host.problems.length) console.log(host.problems.slice(0, 20).join('\n'));
    await host.close().catch(() => {});
    await srv.stop().catch(() => {});
  }
});
