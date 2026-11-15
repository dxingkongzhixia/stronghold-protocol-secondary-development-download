// test/versions-garrisons.test.js — the regulation season's new garrisons (141): every one's effectType/effectKey is
// handled by a prep-side handler (garrisons/meta.js HANDLERS) or a battle-side one (garrisons/battle.js
// BATTLE_HANDLERS), and the new prep handlers (sell price, free refreshes, equipped board, living operators) do what
// their texts say on a stub context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HANDLERS } from '../server/sim/content/garrisons/meta.js';
import { BATTLE_HANDLERS } from '../server/sim/content/garrisons/battle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const ACT3 = Object.fromEntries(fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => [path.basename(f, '.json'), JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))]));
const DEF = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'garrisons.json'), 'utf8'));
const ADDED = Object.entries(ACT3.garrisons).filter(([k]) => !DEF[k]);

test('every new garrison is handled on the prep or battle side', () => {
  const missing = [];
  for (const [id, g] of ADDED) {
    if (HANDLERS[g.effectType] || HANDLERS[g.effectKey] || BATTLE_HANDLERS[g.effectType] || BATTLE_HANDLERS[g.effectKey]) continue;
    missing.push(`${id}:${g.effectType}`);
  }
  assert.deepEqual(missing, []);
});

function ctxWith(source, extra = {}) {
  const added = [];
  return {
    source,
    playerId: extra.playerId || 'p1',
    added,
    board: () => extra.board || [],
    pieceBonds: () => extra.bonds || [],
    addLayers: (b, n, opts) => { added.push([b, n, opts]); return n; },
    grantFreeRefresh: (n) => { added.push(['refresh', n]); return n; },
    counters: {},
    counter(k) { return this.counters[k] || 0; },
    setCounter(k, v) { this.counters[k] = v; return v; },
  };
}

test('sell price: +count, capped at the record max', () => {
  const piece = {};
  const ctx = ctxWith({ piece, bb: { count: 1, max: 4 }, bbStr: {}, garrison: {} });
  HANDLERS.SERVER_SELF_SELL_PRICE_DELTA.run(ctx);
  assert.equal(piece.sellBonus, 1);
  HANDLERS.SERVER_SELF_SELL_PRICE_DELTA.run(ctx);
  HANDLERS.SERVER_SELF_SELL_PRICE_DELTA.run(ctx);
  assert.equal(piece.sellBonus, 3, 'max 4 including the base price of 1');
});

test('free refreshes: at most max_count from the trait', () => {
  const piece = { uid: 7 };
  const ctx = ctxWith({ piece, bb: { delta_count: 1, max_count: 2 }, bbStr: {}, garrison: {} });
  for (let i = 0; i < 5; i++) HANDLERS.SERVER_GAIN_FREE_REFRESH_UPGRADE_COUNT.run(ctx);
  assert.deepEqual(ctx.added, [['refresh', 1], ['refresh', 1]]);
});

test('equipped board and living operators add their bond layers', () => {
  const board = [{ kind: 'chess', items: [{}] }, { kind: 'chess', items: [] }, { kind: 'chess', items: [{}, {}] }];
  const ctx = ctxWith({ bb: { count: 2 }, bbStr: { bond: 'victoriaShip,steadShip' }, garrison: {} }, { board });
  HANDLERS.SERVER_ADD_BOND_BOARD_EQUIP_CHAR.run(ctx);
  assert.deepEqual(ctx.added.map(([b, n]) => [b, n]), [['victoriaShip', 4], ['steadShip', 4]]);

  const ctx2 = ctxWith({ bb: { count: 1, max_count: 9 }, bbStr: { bond: 'SELF' }, garrison: {}, piece: { uid: 3 } }, { bonds: ['iberiaShip', 'docShip'] });
  HANDLERS.SERVER_ADD_ACTIVATED_BOND_BY_ALIVE_CHAR.run(ctx2, { result: { perPlayer: { p1: { unitsEnd: [{ alive: true }, { alive: true }, { alive: false }] } } } });
  assert.deepEqual(ctx2.added.map(([b, n]) => [b, n]), [['iberiaShip', 2], ['docShip', 2]]);
});
