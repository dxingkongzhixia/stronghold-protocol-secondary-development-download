// test/versions-bands-handlers.test.js — the first act3 band meta handlers (bands/meta.js): 全力熔铸 random items by
// round, 雪域礼赠 first bond purchase at 1 gold, 量体裁衣 refresh coin, 自发制造 bond-buy item, 替身娃娃 sell exchange.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setGameData } from '../server/sim/content/support/index.js';
import { bandMetaHandler } from '../server/sim/content/bands/meta.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const ACT3 = Object.fromEntries(fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => [path.basename(f, '.json'), JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))]));

setGameData(ACT3);
after(() => setGameData(null));

function ctxStub(extra = {}) {
  const calls = { items: [], chess: [], funds: 0, price: null };
  return {
    calls,
    round: 3,
    gd: { chess: (id) => ({ bonds: id.startsWith('kjerag') ? ['kjeragShip'] : ['victoriaShip'] }), item: (id) => ({ id }), baseIdOf: (id) => id },
    shopLevel: () => 6,
    rollItem: () => 'item_random',
    grantItem: (id) => { calls.items.push(id); return {}; },
    rollChess: () => 'chess_random',
    grantChess: (id) => { calls.chess.push(id); return {}; },
    setPrice: (v) => { calls.price = v; return v; },
    addFunds: (n) => { calls.funds += n; return n; },
    counters: {},
    counter(k) { return this.counters[k] || 0; },
    setCounter(k, v) { this.counters[k] = v; return v; },
    incCounter(k, n = 1) { this.counters[k] = (this.counters[k] || 0) + n; return this.counters[k]; },
    ...extra,
  };
}

test('全力熔铸: a random item on the listed rounds only', () => {
  const h = bandMetaHandler('band_smith');
  const ctx = ctxStub();
  h.onPrepStart(ctx, { round: 3 });
  assert.deepEqual(ctx.calls.items, ['item_random']);
  ctx.round = 4;
  h.onPrepStart(ctx, { round: 4 });
  assert.equal(ctx.calls.items.length, 1);
  ctx.round = 14;
  h.onPrepStart(ctx, { round: 14 });
  assert.equal(ctx.calls.items.length, 2);
});

test('雪域礼赠: the first bond purchase of the round costs 1, the next one does not', () => {
  const h = bandMetaHandler('band_kjerag');
  const ctx = ctxStub();
  const ev = { kind: 'chess', id: 'kjerag_a', price: 4 };
  h.onPrice(ctx, ev);
  assert.equal(ctx.calls.price, 1);
  h.onBuy(ctx, { kind: 'chess', slot: { id: 'kjerag_a' } });
  const ev2 = { kind: 'chess', id: 'kjerag_b', price: 4 };
  h.onPrice(ctx, ev2);
  assert.equal(ctx.calls.price, 1, 'not lowered again this round');
});

test('量体裁衣: the first refresh of the round grants one coin', () => {
  const h = bandMetaHandler('band_siracusa');
  const ctx = ctxStub();
  h.onRefresh(ctx);
  h.onRefresh(ctx);
  assert.equal(ctx.calls.funds, 1);
});

test('自发制造: every third Victoria purchase grants a random item', () => {
  const h = bandMetaHandler('band_victoria');
  const ctx = ctxStub();
  for (let i = 0; i < 3; i++) h.onBuy(ctx, { kind: 'chess', slot: { id: 'victoria_a' } });
  assert.equal(ctx.calls.items.length, 1);
  for (let i = 0; i < 3; i++) h.onBuy(ctx, { kind: 'chess', slot: { id: 'victoria_a' } });
  assert.equal(ctx.calls.items.length, 2);
});

test('替身娃娃: the first normal sale of the round is exchanged for a shop operator (no funds)', () => {
  const h = bandMetaHandler('band_substitute');
  const ctx = ctxStub();
  const ev = { piece: { kind: 'chess', id: 'base_a' }, gain: 4 };
  h.onSold(ctx, ev);
  assert.equal(ev.gain, 0);
  assert.deepEqual(ctx.calls.chess, ['chess_random']);
  const ev2 = { piece: { kind: 'chess', id: 'base_b' }, gain: 4 };
  h.onSold(ctx, ev2);
  assert.equal(ev2.gain, 4);
  assert.equal(ctx.calls.chess.length, 1);
});
