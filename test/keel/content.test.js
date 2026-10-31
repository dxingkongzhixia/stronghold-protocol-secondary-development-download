// test/keel/content.test.js — content modules load and overlay the data source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKeelPlugin } from '../../server/keel/room-source.js';
import { mergeKeelData, overlayData } from '../../server/keel/content.js';
import { DATA, makeMatch } from '../match/harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATE = path.join(ROOT, 'plugins/_template/keel-survival');

test('content/enemies.json loads into the Keel content map', async () => {
  const plugin = await loadKeelPlugin(TEMPLATE);
  assert.equal(plugin.content.records.length, 1);
  const enemy = plugin.content.enemies.get('enemy_x_keel_survival_refractor');
  assert.equal(enemy.name, '折射者');
  assert.equal(enemy.stats.res, 30);
});

test('the overlay prefers Keel records and falls back to the base source', () => {
  const pluginContent = {
    records: [{ table: 'enemies', id: 'enemy_x_demo', value: { key: 'enemy_x_demo', name: 'Demo' } }],
    enemies: new Map([['enemy_x_demo', { key: 'enemy_x_demo', name: 'Demo' }]]),
    operators: new Map(), stages: new Map(), modes: new Map(), waves: new Map(), bosses: new Map(), tokens: new Map(), bands: new Map(),
  };
  const base = { getEnemy: (id) => (id === 'base' ? { key: 'base', name: 'Base' } : undefined) };
  const data = overlayData(base, pluginContent);
  assert.equal(data.getEnemy('enemy_x_demo').name, 'Demo');
  assert.equal(data.getEnemy('base').name, 'Base');
  assert.equal(data.getEnemy('missing'), undefined);
});

test('mergeKeelData writes full tables for GameData without mutating the input', async () => {
  const plugin = await loadKeelPlugin(TEMPLATE);
  const base = { ...DATA, enemies: { ...DATA.enemies } };
  const merged = mergeKeelData(base, plugin.content);
  assert.equal(merged.enemies.enemy_x_keel_survival_refractor.name, '折射者');
  assert.equal(merged.enemies.enemy_x_keel_survival_refractor.key, 'enemy_x_keel_survival_refractor');
  assert.equal(base.enemies.enemy_x_keel_survival_refractor, undefined, 'input table unchanged');
});

test('Match({ keel: { data } }) reads the expanded content set, including chess records', () => {
  const base = JSON.parse(JSON.stringify(DATA.chess.chess_char_1_01_a));
  base.chessId = 'chess_x_demo';
  base.baseId = 'chess_x_demo';
  const data = { ...DATA, chess: { ...DATA.chess, chess_x_demo: base } };
  const h = makeMatch({ keel: { data, plugins: [] }, humans: 1, seed: 1 });
  assert.equal(h.m.gd.chess('chess_x_demo')?.chessId, 'chess_x_demo');
  h.m.dispose();
});
