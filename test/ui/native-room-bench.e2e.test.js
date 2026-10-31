// 4-seat / 4-Worker benchmark (D9, opt-in): 1 human + 3 AI on a CPU-throttled browser. It records the runner's
// average tick time, the JS heap and the animation-frame rate, and keeps the page responsive. The real room cap is 4
// seats (own field + 3 delegated), so a real browser never runs more than 4 Workers; the headless 8-field cap is a
// scheduler stress case, not a real room.
//
//   SP_E2E=1 CHROME_PATH=... node --test test/ui/native-room-bench.e2e.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, ROOT, hasChrome, sleep, problemsOf, startRealServer } from '../e2e/client.mjs';
import { packPlugin } from '../../server/plugins/pack.js';

const ENABLED = process.env.SP_E2E === '1' && hasChrome();

function nativePlugin(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-native-bench-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const id = 'native-bench';
  const dir = path.join(tmp, id);
  fs.mkdirSync(path.join(dir, 'sim'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sim/index.js'), [
    'export default {',
    '  setup({ api }) { api.state.patch({ ticks: 0 }); },',
    "  hooks: { 'sim.tick'(_ctx, api) { const s = api.state.get(); api.state.patch({ ticks: s.ticks + 1 }); } },",
    '};',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    manifest: 3, id, name: 'Native bench', version: '1.0.0', app: '*',
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
    await sleep(200);
  }
  throw new Error('band draft did not finish');
}

test('1 human + 3 AI at 4× CPU throttle: 4 Workers stay responsive; page heap and tick time are recorded', { timeout: 8 * 60 * 1000 }, async (t) => {
  if (!ENABLED) { t.skip('set SP_E2E=1 (and have Chrome)'); return; }
  const { tmp, id } = nativePlugin(t);
  const [a] = starterKit();
  const srv = await startRealServer({
    fast: { timerScale: 1, combatSpeed: 2, startRound: 1, kits: [[a]], botChess: [a], autoPlace: true },
    pluginsDir: tmp,
    env: { KEEL: '1', SP_PLUGIN_SCRIPTS: 'sandbox' },
  });
  const P = (await import('puppeteer-core')).default;
  const host = new Client(P, srv.base, 'bench', { prefix: 'native-bench', w: 1600, h: 900 });
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
    await host.page.waitForFunction(() => [...(globalThis.__SP_RUNNER__?._entries?.values() ?? [])].filter((e) => e && e.battle).length === 4, { timeout: 60000 });

    // a low-end approximation: 4× CPU throttle while four Workers step
    const cdp = await host.page.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await host.page.evaluate(() => {
      globalThis.__BENCH_FRAMES__ = 0;
      const loop = () => { globalThis.__BENCH_FRAMES__ = (globalThis.__BENCH_FRAMES__ || 0) + 1; requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
    const samples = [];
    for (let i = 0; i < 6; i++) {
      await sleep(1000);
      const s = await host.page.evaluate(() => {
        const r = globalThis.__SP_RUNNER__;
        const entries = [...(r?._entries?.values() ?? [])].filter((e) => e && e.battle);
        return {
          at: Math.round(performance.now()),
          entries: entries.length,
          workers: entries.filter((e) => e.host).length,
          avgTickMs: r?.stats?.().avgTickMs ?? null,
          heap: performance.memory?.usedJSHeapSize ?? null,
          frames: globalThis.__BENCH_FRAMES__ ?? 0,
        };
      });
      samples.push(s);
    }
    const last = samples[samples.length - 1];
    const first = samples[0];
    const frames5 = last.frames - (samples[0].frames || 0);
    console.log('bench', JSON.stringify({ samples, frames: frames5 }));
    assert.equal(last.entries, 4, 'four fields are simulated');
    assert.equal(last.workers, 4, 'one Worker per field (the real-room cap)');
    assert.ok(frames5 >= 20, `the page stays animating under 4× throttle (${frames5} frames / 5 s)`);
    if (typeof last.heap === 'number') assert.ok(last.heap < 500 * 1024 * 1024, `JS heap ${Math.round(last.heap / 1048576)} MB`);
    assert.ok(last.avgTickMs == null || last.avgTickMs < 50, `average tick ${last.avgTickMs} ms under 4× throttle`);
    assert.ok(last.at >= first.at, 'the page clock advanced');
    assert.deepEqual(problemsOf([host]), [], 'no console errors, page errors, failed requests or HTTP errors');
  } finally {
    await host.close().catch(() => {});
    await srv.stop().catch(() => {});
  }
});
