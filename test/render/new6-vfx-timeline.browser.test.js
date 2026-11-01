// test/render/new6-vfx-timeline.browser.test.js — the official prefab particle TIMELINE of the 2026-11 additions, in
// headless Chrome: 丰川祥子 (char_4182_oblvns), 冻河 (char_4244_tocka) and 塔露拉 (char_4247_oxi). Each of their three
// skills is started through the dev viewer's skill demo and hand-stepped frame by frame; screenshots at 0 / 0.25 / 0.5 /
// 0.75 / 1 s land in test/e2e/out/vfx-timeline-<op>-s<n>-<frame>.png. The assertions are:
//   • the skill's own prefab keys are live inside the first second (the index's effect set),
//   • at least one sampled frame shows pixels away from the flat grey (the particles really draw),
//   • a finite prefab stops within its own index duration (+2 s of fade) while the skill is still on,
//   • a looping prefab stops after the skill turns off (it does not outlive the cast).
// This complements new6-fx-alignment.test.js (data/resource level) with the frame-level playback check.
//
// Opt-in (starts Chrome, needs the effects extracted from the local client: extract.py --only fx):
//   RENDER_E2E=1 node --test test/render/new6-vfx-timeline.browser.test.js
// Run browser test files one at a time. Chrome path: $CHROME_PATH or the macOS default.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../../tools/crop-board-atlas.mjs';
import { gpuArgs } from '../../tools/perfbench.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'test/e2e/out');
const IDX = path.join(ROOT, 'public', 'assets', 'local', 'fx', 'index.json');
const CHROME = process.env.CHROME_PATH || {
  win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: '/usr/bin/google-chrome',
}[process.platform];
const enabled = process.env.RENDER_E2E === '1' && !!CHROME && existsSync(CHROME) && existsSync(IDX);
const skip = enabled ? false : 'set RENDER_E2E=1 (needs Chrome and the effects extracted from the local client)';

const BG = [64, 64, 64];
const W = 960, H = 540;
const FPS = 60;
/** Screenshot marks (frames): 0 / 0.25 / 0.5 / 0.75 / 1 s. */
const MARKS = [0, 15, 30, 45, 60];

/** Pixels of a region that differ from the flat background. */
function changed(img, cx, cy, r) {
  let n = 0;
  for (let y = Math.max(0, Math.round(cy - r)); y < Math.min(img.h, Math.round(cy + r)); y++) {
    for (let x = Math.max(0, Math.round(cx - r)); x < Math.min(img.w, Math.round(cx + r)); x++) {
      const o = (y * img.w + x) * 4;
      if (Math.abs(img.rgba[o] - BG[0]) + Math.abs(img.rgba[o + 1] - BG[1]) + Math.abs(img.rgba[o + 2] - BG[2]) > 12) n++;
    }
  }
  return n;
}

const INDEX = existsSync(IDX) ? JSON.parse(readFileSync(IDX, 'utf8')) : { prefabs: {}, skills: {} };
/** The prefab keys a skill's index record names (effects ∪ every use's keys). */
function skillKeys(sid) {
  const rec = INDEX.skills[sid] || {};
  const keys = new Set([...(rec.effects || [])]);
  for (const u of rec.uses || []) for (const k of u.keys || []) keys.add(k);
  return [...keys].filter((k) => INDEX.prefabs?.[k]);
}

/**
 * Index rows the client cannot place are none today: a support skill's mark is a buff on an ally, so its aura rows
 * (target-carried, carrier `EmptyAnimatedAbility._activeBuffs`) reach the client as the sim's mark status
 * (`EXTRA_STATUS_LOOPS`, render/vfx/wiring.js) and play on the marked unit.
 */
const OPS = [
  { unit: 'char_4182_oblvns', op: 'oblvns', name: '丰川祥子', s: 0, sid: 'skchr_oblvns_1', kind: 'arts' },
  { unit: 'char_4182_oblvns', op: 'oblvns', name: '丰川祥子', s: 1, sid: 'skchr_oblvns_2', kind: 'arts' },
  { unit: 'char_4182_oblvns', op: 'oblvns', name: '丰川祥子', s: 2, sid: 'skchr_oblvns_3', kind: 'arts' },
  { unit: 'char_4244_tocka', op: 'tocka', name: '冻河', s: 0, sid: 'skchr_tocka_1', kind: 'bolt', fx: ['mark', { target: 2 }], status: 'tocka_s1_mark' },
  { unit: 'char_4244_tocka', op: 'tocka', name: '冻河', s: 1, sid: 'skchr_tocka_2', kind: 'bolt' },
  { unit: 'char_4244_tocka', op: 'tocka', name: '冻河', s: 2, sid: 'skchr_tocka_3', kind: 'bolt' },
  { unit: 'char_4247_oxi', op: 'oxi', name: '塔露拉', s: 0, sid: 'skchr_oxi_1', kind: 'none' },
  { unit: 'char_4247_oxi', op: 'oxi', name: '塔露拉', s: 1, sid: 'skchr_oxi_2', kind: 'none', fx: ['stance', { target: 2 }] },
  { unit: 'char_4247_oxi', op: 'oxi', name: '塔露拉', s: 2, sid: 'skchr_oxi_3', kind: 'arts' },
];

describe('new 6★ official prefab particle timelines in headless Chrome', { skip }, () => {
  let srv, browser, page;
  const problems = [];
  before(async () => {
    const puppeteer = (await import('puppeteer-core')).default;
    const { startServer } = await import('../../server/index.js');
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: gpuArgs() });
    mkdirSync(OUT, { recursive: true });
    page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${srv.port}/dev/fx-viewer.html?panel=0&grid=0&bg=%23404040&key=common_hit_01&model=0`);
    await page.waitForFunction('window.__fx && window.__fx.ready', { timeout: 60000 });
    const err = await page.evaluate(() => window.__fx.error);
    assert.equal(err, null, `viewer: ${err}`);
    await page.evaluate(() => { window.__fx.stopTicker(); window.__fx.setLoop(false); window.__fx.clear(); });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  /** Let prefabs, meshes and textures arrive while no battle time passes. */
  async function settle() {
    for (let i = 0; i < 40; i++) { await page.evaluate(() => window.__fx.render()); await new Promise((r) => setTimeout(r, 25)); }
  }

  /**
   * Play one skill demo by hand: start it, settle, run the commands (on/attack), then walk MARKS frame by frame and
   * screenshot each. Returns the per-frame live keys, the decoded pictures and the on-screen anchors.
   */
  async function timeline(unit, o, kind, fx, status) {
    const plan = await page.evaluate(async (u, opt) => {
      const fx = window.__fx;
      fx.clear(); fx.stopDemo();
      fx.setTier('full');
      const r = fx.skillDemo(u, { ...opt, manual: true });
      if (!r.plan) return { sid: r.sid, plan: null };
      // What the official layer schedules (the client's own rows): the keys the wiring can place.
      const keys = new Set();
      for (const e of [...r.plan.start, ...r.plan.loop, ...r.plan.range]) keys.add(e.key);
      for (const a of r.plan.attacks || []) {
        for (const e of a.cast || []) keys.add(e.key);
        for (const g of a.hit || []) for (const e of g) keys.add(e.key);
      }
      return { sid: r.sid, plan: { kind: r.plan.kind, keys: [...keys] } };
    }, unit, o);
    await settle();
    await page.evaluate((k) => { window.__fx.skillCmd('on'); window.__fx.skillCmd('attack', k); }, kind);
    if (fx) await page.evaluate((f) => window.__fx.skillCmd('fx', f[0], f[1]), fx);
    if (status) await page.evaluate((st) => window.__fx.skillCmd('status', st, 'target'), status);
    const frames = [];
    let cur = 0;
    for (const mark of MARKS) {
      if (mark > cur) { await page.evaluate((n) => window.__fx.step(n, 1 / 60), mark - cur); cur = mark; }
      await page.evaluate(() => window.__fx.render());
      const keys = await page.evaluate(() => window.__fx.liveKeys(true));
      const buf = await page.screenshot({ path: path.join(OUT, `vfx-timeline-${o.op}-s${o.s}-${mark}.png`) });
      frames.push({ mark, t: mark / FPS, keys, img: decodePng(Buffer.from(buf)) });
    }
    const geo = await page.evaluate(() => {
      const fx = window.__fx;
      const { src, tgt } = fx.skillUnits();
      return { src: fx.project(src.x, src.y, 0.4), tgt: fx.project(tgt.x, tgt.y, 0.4) };
    });
    return { plan, frames, ...geo };
  }

  for (const c of OPS) {
    const keys = skillKeys(c.sid);
    test(`${c.name} S${c.s + 1} (${c.sid}): official prefab keys live frame by frame, finite ones expire`, async (t) => {
      assert.ok(INDEX.skills[c.sid], `${c.sid}: the index has the skill`);
      if (keys.length === 0) {
        // The official bundle names no prefab rows for this skill (a pure stat/buff skill): nothing to sample.
        t.diagnostic(`${c.sid}: the official bundle has no prefab rows`);
        return;
      }
      const r = await timeline(c.unit, { s: c.s, op: c.op }, c.kind, c.fx, c.status);
      assert.equal(r.plan?.sid, c.sid, `${c.unit} slot ${c.s}`);
      const planned = r.plan?.keys || [];
      const seen = new Set(r.frames.flatMap((f) => f.keys));
      // Every key the official plan schedules must be live inside the first second: cast/buff rows on the unit, hit rows
      // on the dummy (the skill attack above), the attack's own cast where the plan puts it.
      const missing = planned.filter((k) => !seen.has(k));
      assert.deepEqual(missing, [], `${c.name} S${c.s + 1} scheduled keys missing in the first second (seen: ${[...seen].join(', ')})`);
      // Rows the plan does not schedule still play when the sim's mark status carries them (the support skill's aura on
      // an ally): every index row must be seen.
      const unplaced = keys.filter((k) => !planned.includes(k) && !seen.has(k)).sort();
      assert.deepEqual(unplaced, [], `${c.name} S${c.s + 1}: index rows never played (seen: ${[...seen].join(', ')})`);
      // The particles really draw: at least one of the sampled frames has pixels off the flat grey near the two units.
      const drawn = Math.max(...r.frames.map((f) => changed(f.img, r.src.x, r.src.y, 80) + changed(f.img, r.tgt.x, r.tgt.y, 80)));
      assert.ok(drawn > 300, `${c.name} S${c.s + 1}: particles drawn (max changed px ${drawn})`);
      // Finite prefabs end by their own duration; looping ones stop when the skill turns off (and the mark status ends).
      const loops = [...new Set([...planned, ...keys])].filter((k) => seen.has(k) && INDEX.prefabs[k]?.looping);
      const finite = planned.filter((k) => !INDEX.prefabs[k]?.looping);
      const maxDur = Math.max(0, ...finite.map((k) => Number(INDEX.prefabs[k].duration) || 0));
      await page.evaluate((n) => { window.__fx.step(n, 1 / 60); window.__fx.render(); }, Math.ceil(maxDur * FPS) + 2 * FPS);
      const left = await page.evaluate(() => window.__fx.liveKeys(true));
      for (const k of finite) assert.ok(!left.includes(k), `${c.name} S${c.s + 1}: ${k} ended by ${maxDur + 2}s (${left.join(', ')})`);
      if (loops.length) {
        await page.evaluate((st) => {
          window.__fx.skillCmd('off');
          if (st) window.__fx.skillCmd('statusOff', st, 'target');
          window.__fx.step(180, 1 / 60);
          window.__fx.render();
        }, c.status || null);
        const after = await page.evaluate(() => window.__fx.liveKeys(true));
        for (const k of loops) assert.ok(!after.includes(k), `${c.name} S${c.s + 1}: loop ${k} stopped 3s after off (${after.join(', ')})`);
      }
    });
  }

  test('the console stays clean', () => {
    assert.deepEqual(problems, []);
  });
});
