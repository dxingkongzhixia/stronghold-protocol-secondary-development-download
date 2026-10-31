// test/keel/content.test.js — content modules load and overlay the data source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKeelPlugin } from '../../server/keel/room-source.js';
import { mergeKeelData, overlayData } from '../../server/keel/content.js';
import { createKeelContentSet } from '../../server/keel/content-set.js';
import { reconcilePluginBonds } from '../../server/plugins/gameplayRecords.js';
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

const BOND_FIXTURE = path.join(ROOT, 'test/fixtures/keel-bond');

test('a content module can add a new bond record (bond_x_*)', async () => {
  const plugin = await loadKeelPlugin(BOND_FIXTURE);
  assert.ok(plugin.content.records.some((r) => r.table === 'bonds' && r.id === 'bond_x_keel_bond_demo'));
  const merged = mergeKeelData(DATA, plugin.content);
  assert.equal(merged.bonds.bond_x_keel_bond_demo.name, '示例盟约');
  assert.deepEqual(merged.bonds.bond_x_keel_bond_demo.thresholds, [3, 6]);
  assert.equal(merged.bonds.bond_x_keel_bond_demo.activeCount, 3);
  assert.ok(merged.effects.effect_x_keel_bond_demo, 'the compiler writes the bond effect shell');
});

test('bond membership comes from chess bonds (golden copies do not count)', () => {
  const data = {
    bonds: { bond_x_keel_bond_demo: { members: [], visibleMembers: [] } },
    chess: {
      chess_x_keel_bond_demo_a: { chessId: 'chess_x_keel_bond_demo_a', bonds: ['bond_x_keel_bond_demo'], visible: true, isGolden: false },
      chess_x_keel_bond_demo_b: { chessId: 'chess_x_keel_bond_demo_b', bonds: ['bond_x_keel_bond_demo'], visible: true, isGolden: true },
    },
  };
  const out = reconcilePluginBonds(data);
  assert.deepEqual(out.bonds.bond_x_keel_bond_demo.members, ['chess_x_keel_bond_demo_a']);
  assert.deepEqual(out.bonds.bond_x_keel_bond_demo.visibleMembers, ['chess_x_keel_bond_demo_a']);
});

test('the Keel content set carries a new bond into the room data', async () => {
  const plugin = await loadKeelPlugin(BOND_FIXTURE);
  const built = createKeelContentSet({ plugins: [plugin] });
  assert.deepEqual(built.problems, []);
  assert.ok(built.data.bonds.bond_x_keel_bond_demo, 'the bond reaches the content set');
  assert.equal(built.data.bonds.bond_x_keel_bond_demo.members.length, 0, 'members wait for chess records');
});
