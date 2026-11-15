// test/versions-boss-top.test.js — 规程's 领袖战 top-3 (config.bossDamageStats, from the official
// bossDamageStatsStyleList): m.public.bossHp.top lists the shared leader pool's per-player damage, largest first. The
// default 盟约 config has no such field, so its bossHp stays the plain hp/max pair.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, setData, resetData } from '../server/data.js';
import { makeMatch, DATA } from './match/harness.js';
import { SharedBossPool } from '../server/match/finalAssault.js';
import { bossDamageTop } from '../server/match/match/views.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
after(() => resetData());

test('bossDamageTop: largest first, top 3, share of the leader max HP', () => {
  const pool = new SharedBossPool(1000);
  pool.damage('p_0', 400);
  pool.damage('p_1', 250);
  pool.damage('p_2', 100);
  pool.damage('ai_0', 50);
  const order = [{ playerId: 'p_0', name: 'P0' }, { playerId: 'p_1', name: 'P1' }, { playerId: 'p_2', name: 'P2' }, { playerId: 'ai_0', name: 'AI0' }];
  assert.deepEqual(bossDamageTop(pool, order), [
    { playerId: 'p_0', name: 'P0', damage: 400, pct: 40 },
    { playerId: 'p_1', name: 'P1', damage: 250, pct: 25 },
    { playerId: 'p_2', name: 'P2', damage: 100, pct: 10 },
  ]);
  assert.deepEqual(bossDamageTop(pool, order, 2).map((r) => r.playerId), ['p_0', 'p_1']);
  assert.deepEqual(bossDamageTop(new SharedBossPool(100), order), [], 'nobody damaged it');
});

test('规程 exposes the top-3; the default 盟约 bossHp has no such list', () => {
  const act3 = loadData(DIR, { log: quiet });
  setData(act3);
  assert.equal(act3.config.bossDamageStats.length, 3);
  const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 2, bots: 1, seed: 41, data: act3, fake: true });
  h.start();
  const m = h.m;
  m.phase = 'FINAL_ASSAULT';
  m.bossPool = new SharedBossPool(5000);
  m.bossPool.damage('p_0', 1200);
  m.bossPool.damage('p_1', 600);
  const v = m.publicView();
  assert.equal(v.bossHp.max, 5000);
  assert.deepEqual(v.bossHp.top.map((r) => [r.playerId, r.damage, r.pct]), [['p_0', 1200, 24], ['p_1', 600, 12]]);
  m.bossPool.damage('ai_0', 300);
  assert.equal(m.publicView().bossHp.top.length, 3);

  setData(DATA);
  const d = makeMatch({ mode: 'solo', humans: 1, seed: 42, data: DATA, fake: true }).start();
  const dm = d.m;
  dm.phase = 'FINAL_ASSAULT';
  dm.bossPool = new SharedBossPool(1000);
  dm.bossPool.damage('p_0', 100);
  assert.equal(DATA.config.bossDamageStats, undefined);
  assert.equal(dm.publicView().bossHp.top, undefined, 'the default 盟约 keeps its bossHp shape');
});
