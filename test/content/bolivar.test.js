// 玻利瓦尔：猎犬主导的追猎 / 渴血（Keel 原型）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createPluginRegistry } from '../../server/plugins/registry.js';
import { buildContentSet } from '../../server/plugins/contentSet.js';
import { loadKeelPlugin } from '../../server/keel/room-source.js';
import { createFakeHost, createKeelRuntime } from '../../shared/keel/index.js';
import { DataSource, getDefaultSource } from '../../server/sim/simdata.js';
import { makeBattle } from '../helpers/battleHarness.js';
import { attachKeel } from '../../server/keel/attach.js';

const DIR = path.resolve('plugins/bolivar');
const BOND = 'bond_x_bolivar_pack';
const skip = fs.existsSync(DIR) ? false : 'plugins/bolivar is not installed in this checkout';

let cached = null;
async function plugin() {
  cached ??= await loadKeelPlugin(DIR);
  return cached;
}

function content() {
  const registry = createPluginRegistry({
    publicDir: 'public', dataDir: 'data', packsDir: 'packs', pluginsDir: 'plugins',
  }, { app: '0.4.0', log: { info() {}, warn() {}, error() {} } });
  const set = buildContentSet({ registry, ids: ['bolivar'] });
  assert.deepEqual(set.problems, []);
  return { set, entry: registry.plugin('bolivar') };
}

function host(n) {
  const members = Array.from({ length: n }, (_, i) => ({
    id: `m${i}`, side: 'ally', hp: 1000, maxHp: 1000, x: 5 + i, y: 10, bonds: [BOND],
  }));
  return createFakeHost({ units: [...members, { id: 'e1', side: 'enemy', hp: 5000, maxHp: 5000, x: 9, y: 10 }] });
}

function run(p, n) {
  const h = host(n);
  const rt = createKeelRuntime({ manifest: p.manifest, modules: p.modules, host: h });
  rt.start();
  const state = () => rt.snapshot().state['bolivar:sim:sim/index.js'].value;
  return { h, rt, state };
}

test('bolivar: the content set carries the bond, members and the hound token', { skip }, async () => {
  const p = await plugin();
  assert.deepEqual(p.problems, []);
  const { set, entry } = content();
  const bond = set.data.bonds[BOND];
  assert.ok(bond, 'the bond reaches the content set');
  assert.deepEqual(bond.thresholds, [3, 6]);
  assert.deepEqual(bond.members, ['chess_char_1_09_a', 'chess_char_1_14_a', 'chess_char_4229_aphris_a']);
  assert.ok(set.data.tokens.token_x_bolivar_hound, 'the hound token is composed');
  assert.ok(entry.visual?.ops?.length > 0, 'the hound Spine / icon are in the visual set');
  // 谬因 ships hidden (哥伦比亚 阵营加强): the bond plugin offers its own roster, both forms.
  assert.equal(set.data.chess.chess_char_4229_aphris_a.visible, true);
  assert.equal(set.data.chess.chess_char_4229_aphris_b.visible, true);
  assert.ok(set.data.chess.chess_char_1_09_b.bonds.includes(BOND), 'the elite form counts too');
  assert.ok(set.data.chess.chess_char_4229_aphris_b.bonds.includes(BOND));
});

test('bolivar: 3 members summon one hound, mark prey and deal +15%', { skip }, async () => {
  const p = await plugin();
  const { h, rt, state } = run(p, 3);
  assert.equal(state().members, 3);
  assert.equal(state().hounds.length, 1, '3-tier: one hound');
  const ally = h.units({ id: 'm0' })[0];
  const foe = h.units({ id: 'e1' })[0];
  rt.runHook('sim.beforeAttack', { attacker: ally, targets: [foe] });
  assert.ok(state().marks.e1 > 0, 'the target is marked');
  const hit = { source: ally, target: foe, dmg: { amount: 100 } };
  rt.runHook('sim.hit', hit);
  assert.ok(Math.abs(hit.dmg.amount - 115) < 1e-6, 'prey takes +15%');
  assert.deepEqual(rt.errors, []);
});

test('bolivar: 6 members summon two hounds, heal on prey and grant bloodthirst', { skip }, async () => {
  const p = await plugin();
  const { h, rt, state } = run(p, 6);
  assert.equal(state().members, 6);
  assert.equal(state().hounds.length, 2, '6-tier: two hounds');
  const ally = h.units({ id: 'm0' })[0];
  h.damage({ target: 'm0', amount: 600 });
  const before = h.units({ id: 'm0' })[0].hp;
  const foe = h.units({ id: 'e1' })[0];
  rt.runHook('sim.beforeAttack', { attacker: ally, targets: [foe] });
  const hit = { source: ally, target: foe, dmg: { amount: 100 } };
  rt.runHook('sim.hit', hit);
  assert.ok(h.units({ id: 'm0' })[0].hp > before, 'damage to prey heals the attacker');
  rt.runHook('sim.kill', { killer: ally, victim: foe });
  assert.ok(state().blood.m0?.stacks >= 1, 'killing prey grants bloodthirst');
  assert.ok(h.buffs.list('m0').some((b) => b.buff === 'bolivar:bloodthirst'));
  assert.deepEqual(rt.errors, []);
});

test('bolivar: a real battle fields the three roster members and summons the hound', { skip }, async () => {
  const p = await plugin();
  const { set } = content();
  const data = new DataSource({
    chess: set.data.chess, enemies: set.data.enemies, tokens: set.data.tokens,
    stages: set.data.stages, waves: set.data.waves,
  }, getDefaultSource());
  const h = makeBattle({
    data,
    units: [
      { chessId: 'chess_char_1_09_a', row: 10, col: 5 },
      { chessId: 'chess_char_1_14_a', row: 10, col: 6 },
      { chessId: 'chess_char_4229_aphris_a', row: 10, col: 7 },
    ],
    enemies: [{ key: 'enemy_1000_gopro', pos: [10, 10] }],
    timeLimit: 30,
    autoFinish: false,
  });
  h.b.start();
  h.step(2);
  const handle = attachKeel(h.b, { manifest: p.manifest, modules: p.modules });
  try {
    assert.deepEqual(handle.runtime.runHook('sim.battleStart').errors, []);
    const state = handle.runtime.snapshot().state['bolivar:sim:sim/index.js'].value;
    assert.equal(state.members, 3, '跃跃 + 格雷伊 + 谬因');
    assert.equal(state.hounds.length, 1, '3-tier: one hound');
    assert.ok(h.b.units.some((u) => u.defId === 'token_x_bolivar_hound'), 'the hound token is on the field');
  } finally {
    handle.detach();
  }
});
