// test/versions-custom.test.js — 规程 选择自编 (CUSTOM_CHECK): the official enterSteps step between the strategy draft and
// BATTLE_CHECK. The player takes at most 2 tier-5 and 2 tier-6 自选编队 slots into the run; the rest leave the pool.
// The default 盟约 config has no such step.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, setData, resetData } from '../server/data.js';
import { makeMatch, DATA } from './match/harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
after(() => resetData());

const act3 = () => {
  const data = loadData(DIR, { log: quiet });
  setData(data);
  return data;
};

/** Five valid 自选 picks of this data: three tier-5 and two tier-6 prototypes (backups.diy.locked). */
function diyPicks(data) {
  const locked = data.backups.diy.locked;
  const picks = {};
  for (const tier of ['5', '6']) {
    for (const c of Object.keys(locked[tier]).slice(0, tier === '5' ? 3 : 2)) {
      picks[`chess_char_${tier}_diy${Object.keys(picks).length + 1}_a`] = { charId: c, ...locked[tier][c] };
    }
  }
  return picks;
}

const reachCustom = (h) => {
  const ok = h.drive(() => h.m.phase === 'CUSTOM_CHECK', { custom: false, band: 'band_random' });
  assert.ok(ok, `reached CUSTOM_CHECK (${h.m.phase})`);
};

test('规程: CUSTOM_CHECK offers the picked 自编 slots, at most 2 per tier', () => {
  const data = act3();
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: diyPicks(data) }];
  const h = makeMatch({ mode: 'solo', humans: 1, seats, seed: 31, data, fake: true });
  h.start();
  reachCustom(h);
  const m = h.m, ps = h.ps('p_0');
  assert.deepEqual(m.gd.customStep, { time: 30, hint: 10 });
  const view = ps.privateView().custom;
  assert.equal(view.slots.length, 5);
  assert.equal(view.picked.length, 4);
  assert.equal(view.ready, false);
  assert.deepEqual(m.publicView().custom, { ready: 0, total: 1, maxPerTier: 2 });
  const t5 = view.slots.filter((s) => s.tier === 5).map((s) => s.slotId);
  const t6 = view.slots.filter((s) => s.tier === 6).map((s) => s.slotId);
  assert.equal(t5.length, 3);
  assert.equal(t6.length, 2);
  // three tier-5 slots (over the per-tier limit), a foreign id and a duplicate are refused
  assert.equal(m.handle('p_0', { t: 'g.custom', slots: [t5[0], t5[1], t5[2]] }).error, 'BAD_TARGET');
  assert.equal(m.handle('p_0', { t: 'g.custom', slots: ['chess_char_5_diy6_a'] }).error, 'BAD_TARGET');
  assert.equal(m.handle('p_0', { t: 'g.custom', slots: [t5[0], t5[0]] }).error, 'BAD_TARGET');
  assert.deepEqual(m.handle('p_0', { t: 'g.custom', slots: [t5[0], t6[0]] }), { ok: true });
  assert.deepEqual(ps.customPick, [t5[0], t6[0]]);
  // confirm: BATTLE_CHECK starts, and only the two taken slots stay in the 自选 stock
  assert.deepEqual(m.handle('p_0', { t: 'g.customReady', ready: true }), { ok: true });
  assert.equal(m.phase, 'BATTLE_CHECK');
  assert.deepEqual(Object.keys(ps.diy).sort(), [t5[0], t6[0]].sort());
  assert.deepEqual(Object.keys(ps.diyStock.snapshot()).sort(), [t5[0], t6[0]].sort());
  assert.equal(m.handle('p_0', { t: 'g.custom', slots: [t5[1]] }).error, 'WRONG_PHASE');
});

test('规程: the step ends when every living player confirmed (bots confirm at once)', () => {
  const data = act3();
  const picks = diyPicks(data);
  const seats = [
    { seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: picks },
    { seat: 1, playerId: 'p_1', name: 'P1', isBot: false, connected: true, diy: picks },
    { seat: 2, playerId: 'ai_0', name: 'AI0', isBot: true, connected: true },
  ];
  const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 2, seats, seed: 32, data, fake: true });
  h.start();
  reachCustom(h);
  const m = h.m;
  assert.equal(m.publicView().custom.total, 3);
  assert.equal(m.publicView().custom.ready, 1, 'the bot is ready');
  m.handle('p_0', { t: 'g.customReady', ready: true });
  assert.equal(m.phase, 'CUSTOM_CHECK', 'p_1 still deciding');
  assert.equal(m.publicView().custom.ready, 2);
  m.handle('p_1', { t: 'g.customReady', ready: true });
  assert.equal(m.phase, 'BATTLE_CHECK');
});

test('规程: a timeout applies the current (default) selection', () => {
  const data = act3();
  const seats = [
    { seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: diyPicks(data) },
    { seat: 1, playerId: 'p_1', name: 'P1', isBot: false, connected: true, diy: diyPicks(data) },
  ];
  const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 2, seats, seed: 33, data, fake: true });
  h.start();
  reachCustom(h);
  const ps = h.ps('p_0');
  const before = ps.customPick.slice();
  assert.equal(before.length, 4);
  h.run(() => h.m.phase !== 'CUSTOM_CHECK');
  assert.equal(h.m.phase, 'BATTLE_CHECK');
  assert.deepEqual(Object.keys(ps.diy).sort(), before.slice().sort());
});

test('the default 盟约 flow has no 选择自编 step', () => {
  setData(DATA);
  const h = makeMatch({ mode: 'solo', humans: 1, seed: 34, data: DATA, fake: true });
  h.start();
  assert.equal(h.m.gd.customStep, null);
  h.autoHumans();
  h.toPrep(1);
  assert.equal(h.m.gd.customStep, null);
  assert.equal(h.ps('p_0').customPick, null);
  assert.equal(h.ps('p_0').privateView().custom, null);
});
