// test/keel/runtime.test.js — the M1 runtime on the fake host: capabilities, budgets, state, snapshots, replay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import demo from '../fixtures/keel-demo/sim/index.js';
import { createFakeHost, createKeelRuntime, loadKeelModules } from '../../shared/keel/index.js';

const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/keel-demo');

const manifest = (over = {}) => ({
  manifest: 3,
  id: 'demo',
  name: 'Demo',
  version: '1.0.0',
  app: '*',
  api: { sim: 1 },
  scope: ['room'],
  trust: 'sandbox',
  modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.read', 'sim.damage.write', 'sim.spawn', 'sim.rng'] }],
  state: { version: 1 },
  ...over,
});

const modules = (code = demo, permissions = ['sim.read', 'sim.damage.write', 'sim.spawn', 'sim.rng']) => [
  { kind: 'sim', entry: 'sim/index.js', permissions, code },
];

const hostWithTarget = (seed = 1) => createFakeHost({ seed, units: [{ id: 'target', side: 'enemy', hp: 100, maxHp: 100 }] });

test('the demo module runs 60 frames: ticks, hits and a kill', () => {
  const host = hostWithTarget();
  const rt = createKeelRuntime({ manifest: manifest(), modules: modules(), host });
  const snap = rt.run({ frames: 60 });
  const key = 'demo:sim:sim/index.js';
  assert.equal(rt.errors.length, 0, JSON.stringify(rt.errors));
  assert.deepEqual(snap.state[key].value, { ticks: 60, hits: 4, kills: 1, ended: true, frame: 60 });
  assert.equal(host.units({ id: 'target' })[0].alive, false);
});

test('the same seed and inputs give the same hash', () => {
  const ra = createKeelRuntime({ manifest: manifest(), modules: modules(), host: hostWithTarget(7) });
  const rb = createKeelRuntime({ manifest: manifest(), modules: modules(), host: hostWithTarget(7) });
  ra.run({ frames: 30 });
  rb.run({ frames: 30 });
  assert.equal(ra.hash(), rb.hash());
});

test('a denied capability disables the module, with a coded error', () => {
  const bad = { hooks: { 'sim.tick'(_ctx, api) { api.damage({ target: 'target', amount: 1 }); } } };
  const rt = createKeelRuntime({ manifest: manifest(), modules: modules(bad, ['sim.read']), host: hostWithTarget() });
  rt.start();
  const r = rt.runHook('sim.tick');
  assert.equal(r.ok, false);
  assert.equal(rt.errors[0].code, 'KEEL_DENIED');
  assert.equal(rt.modules[0].disabled, true);
  assert.equal(rt.runHook('sim.tick').errors.length, 0);
});

test('a budget overrun disables the module', () => {
  const slow = { hooks: { 'sim.tick'() {} } };
  const rt = createKeelRuntime({ manifest: manifest(), modules: modules(slow), host: hostWithTarget(), budget: { perHook: 0.5 } });
  rt.start();
  const r = rt.runHook('sim.tick', {}, { cost: 1 });
  assert.equal(r.ok, false);
  assert.equal(rt.errors[0].code, 'KEEL_BUDGET');
  assert.equal(rt.modules[0].disabled, true);
});

test('snapshot/restore round-trips plugin state and the command log', () => {
  const host = hostWithTarget();
  const rt = createKeelRuntime({ manifest: manifest(), modules: modules(), host });
  rt.start();
  for (let i = 0; i < 5; i++) rt.tick();
  const snap = rt.snapshot();
  const hash = rt.hash();
  for (let i = 0; i < 5; i++) rt.tick();
  assert.notEqual(rt.hash(), hash);
  rt.restore(snap);
  assert.equal(rt.hash(), hash);
  assert.equal(rt.snapshot().state['demo:sim:sim/index.js'].value.ticks, 5);
});

test('a module with match.economy.write records commands through the bus', () => {
  const code = {
    setup({ api }) { api.state.patch({ n: 0 }); },
    hooks: { 'sim.tick'(_ctx, api) { api.command({ type: 'grant', amount: 1 }); } },
  };
  const applied = [];
  const rt = createKeelRuntime({
    manifest: manifest({ api: { sim: 1, match: 1 } }),
    modules: modules(code, ['match.economy.write']),
    host: hostWithTarget(),
    applyCommand: (cmd, id) => applied.push([id, cmd.type]),
  });
  rt.run({ frames: 3 });
  assert.deepEqual(applied, [['demo:sim:sim/index.js', 'grant'], ['demo:sim:sim/index.js', 'grant'], ['demo:sim:sim/index.js', 'grant']]);
  assert.equal(rt.snapshot().commands['demo:sim:sim/index.js'].length, 3);
});

test('loadKeelModules reads the fixture default export', async () => {
  const mods = await loadKeelModules(manifest(), { urlOf: (rel) => pathToFileURL(path.join(FIXTURE, rel)).href });
  assert.equal(mods.length, 1);
  assert.equal(mods[0].kind, 'sim');
  assert.equal(typeof mods[0].code.setup, 'function');
});

test('api.bonds reads and adds layers with the bond capabilities', () => {
  const host = createFakeHost({ seed: 1, bonds: [{ id: 'bond_x_demo', layers: 2, active: true, tier: 1, count: 3 }] });
  let seen = null;
  const code = { hooks: { 'sim.tick'(_ctx, api) { seen = api.bonds.get('bond_x_demo'); api.bonds.addLayers('bond_x_demo', 2); } } };
  const rt = createKeelRuntime({ manifest: manifest(), modules: modules(code, ['sim.bond.read', 'sim.bond.write']), host });
  rt.run({ frames: 1 });
  assert.equal(rt.errors.length, 0, JSON.stringify(rt.errors));
  assert.equal(seen.layers, 2);
  assert.equal(seen.active, true);
  assert.equal(host.bonds.get('bond_x_demo').layers, 4);
  assert.deepEqual(host.bonds.list().map((b) => b.id), ['bond_x_demo']);
});

test('api.bonds.addLayers needs sim.bond.write', () => {
  const code = { hooks: { 'sim.tick'(_ctx, api) { api.bonds.addLayers('bond_x_demo', 1); } } };
  const rt = createKeelRuntime({ manifest: manifest(), modules: modules(code, ['sim.bond.read']), host: createFakeHost({}) });
  rt.run({ frames: 1 });
  assert.equal(rt.errors[0]?.code, 'KEEL_DENIED');
  assert.match(rt.errors[0]?.message ?? '', /sim\.bond\.write/);
});

test('api.spawn creates ally tokens and devices on the fake host', () => {
  const host = createFakeHost({});
  const code = { hooks: { 'sim.battleStart'(_ctx, api) {
    api.spawn({ kind: 'token', tokenId: 'token_x_demo', x: 1, y: 2 });
    api.spawn({ kind: 'device', deviceKey: 'device_x_demo', x: 3, y: 4 });
  } } };
  const rt = createKeelRuntime({ manifest: manifest(), modules: modules(code, ['sim.spawn']), host });
  rt.start();
  assert.equal(rt.errors.length, 0, JSON.stringify(rt.errors));
  assert.deepEqual(host.units().map((u) => u.kind).sort(), ['device', 'token']);
});

test('api.status applies and removes a custom status', () => {
  const host = createFakeHost({ units: [{ id: 'u1', side: 'enemy', hp: 10 }] });
  let applied = null;
  const code = { hooks: { 'sim.tick'(_ctx, api) {
    applied = api.status.apply('u1', 'x_keel_status', { duration: 2 });
    api.status.remove('u1', 'x_keel_status');
  } } };
  const rt = createKeelRuntime({ manifest: manifest(), modules: modules(code, ['sim.status.write']), host });
  rt.run({ frames: 1 });
  assert.equal(rt.errors.length, 0, JSON.stringify(rt.errors));
  assert.equal(applied.ok, true);
});

test('api.status needs sim.status.write', () => {
  const host = createFakeHost({ units: [{ id: 'u1', side: 'enemy', hp: 10 }] });
  const code = { hooks: { 'sim.tick'(_ctx, api) { api.status.apply('u1', 'x_keel_status', { duration: 1 }); } } };
  const rt = createKeelRuntime({ manifest: manifest(), modules: modules(code, ['sim.read']), host });
  rt.run({ frames: 1 });
  assert.equal(rt.errors[0]?.code, 'KEEL_DENIED');
  assert.match(rt.errors[0]?.message ?? '', /sim\.status\.write/);
});
