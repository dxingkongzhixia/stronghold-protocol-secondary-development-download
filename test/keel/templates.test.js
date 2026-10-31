// test/keel/templates.test.js — the native Keel templates load through the existing registry, runtime and content set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getData } from '../../server/data.js';
import { readPluginFolder } from '../../server/plugins/registry.js';
import { loadKeelPlugin } from '../../server/keel/room-source.js';
import { runV2Setup } from '../../server/keel/v2-script.js';
import { mergeKeelData } from '../../server/keel/content.js';
import { createFakeHost, createKeelRuntime } from '../../shared/keel/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const vanilla = () => {
  const assets = getData().assets;
  return { manifest: assets, baseManifest: assets, sha256: 'template' };
};

test('the native Keel cosmetic template builds an asset composition', async () => {
  const r = await readPluginFolder(path.join(ROOT, 'plugins/_template/keel-cosmetic'), { vanilla: vanilla() });
  assert.deepEqual(r.problems, []);
  assert.equal(r.plugin.keel.manifest, 3);
  assert.equal(r.plugin.manifest.class, 'cosmetic');
  assert.ok(r.plugin.visual.ops.length > 0);
  assert.equal(r.plugin.manifest.scope.includes('personal'), true);
});

test('the native Keel UI template builds a sandbox frame', async () => {
  const r = await readPluginFolder(path.join(ROOT, 'plugins/_template/keel-ui'), { vanilla: vanilla() });
  assert.deepEqual(r.problems, []);
  assert.equal(r.plugin.keel.manifest, 3);
  assert.equal(r.plugin.manifest.class, 'ui');
  assert.equal(r.plugin.ui.entry, 'ui/index.html');
  assert.deepEqual(r.plugin.ui.slots, ['hud.right']);
});

test('the Keel v2 script template registers through compat.v2Script', async () => {
  const plugin = await loadKeelPlugin(path.join(ROOT, 'plugins/_template/keel-script'));
  assert.ok(plugin.v2, 'v2 descriptor');
  assert.equal(typeof plugin.v2.setup, 'function');
  const result = runV2Setup({ setup: plugin.v2.setup, plugin: { id: 'keel-script', permissions: ['sim.code'] } });
  assert.equal(result.registrations.some((r) => r.key === 'kit:char_x_script_demo_guard'), true);
});

test('a native Keel lang module projects to the v2 lang files.ui', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-lang-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'en.json'), JSON.stringify({ hello: 'Hello' }));
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    manifest: 3, id: 'lang-demo', name: 'English', version: '1.0.0', app: '*',
    api: { lang: 1 }, scope: ['personal'], trust: 'data',
    modules: [{ kind: 'lang', entry: 'en.json', permissions: [] }],
  }));
  const r = await readPluginFolder(dir);
  assert.deepEqual(r.problems, []);
  assert.equal(r.plugin.manifest.class, 'lang');
  assert.equal(r.plugin.manifest.files.ui, 'en.json');
  assert.ok(r.plugin.strings > 0);
});

test('the native Keel content template carries one enemy record', async () => {
  const dir = path.join(ROOT, 'plugins/_template/keel-content');
  const read = await readPluginFolder(dir);
  assert.deepEqual(read.problems, []);
  assert.equal(read.plugin.manifest.class, 'content');
  const plugin = await loadKeelPlugin(dir);
  assert.deepEqual(plugin.problems, []);
  assert.ok(plugin.content.records.some((r) => r.table === 'enemies' && r.id === 'enemy_x_keel_content_demo'));
  const merged = mergeKeelData(getData(), plugin.content);
  assert.equal(merged.enemies.enemy_x_keel_content_demo.key, 'enemy_x_keel_content_demo');
});

test('the native Keel lang template is a three-string personal pack', async () => {
  const r = await readPluginFolder(path.join(ROOT, 'plugins/_template/keel-lang'));
  assert.deepEqual(r.problems, []);
  assert.equal(r.plugin.manifest.class, 'lang');
  assert.equal(r.plugin.manifest.files.ui, 'lang/en.json');
  assert.equal(r.plugin.strings, 3);
});

test('the native Keel policy template decides from its observation', async () => {
  const dir = path.join(ROOT, 'plugins/_template/keel-policy');
  const read = await readPluginFolder(dir);
  assert.deepEqual(read.problems, []);
  const plugin = await loadKeelPlugin(dir);
  assert.deepEqual(plugin.problems, []);
  assert.deepEqual(plugin.modules.map((m) => m.kind), ['policy']);
  const runtime = createKeelRuntime({ manifest: plugin.manifest, modules: plugin.modules, host: createFakeHost({ seed: 1 }), seed: 1 });
  runtime.start();
  const key = 'keel-policy:policy:policy/index.js';
  assert.equal(runtime.runHook('policy.decide', { observation: { gold: 2 } }).ok, true);
  assert.equal(runtime.runHook('policy.decide', { observation: { gold: 6 } }).ok, true);
  const snap = runtime.snapshot();
  assert.deepEqual(snap.state[key].value.decisions, ['save', 'upgrade']);
  assert.equal(snap.views[key].last, 'upgrade');
});

test('the native Keel multi-module template runs sim + policy and carries content + ui', async () => {
  const dir = path.join(ROOT, 'plugins/_template/keel-multi-module');
  const read = await readPluginFolder(dir);
  assert.deepEqual(read.problems, []);
  const plugin = await loadKeelPlugin(dir);
  assert.deepEqual(plugin.problems, []);
  assert.deepEqual(plugin.modules.map((m) => m.kind).sort(), ['policy', 'sim']);
  const runtime = createKeelRuntime({ manifest: plugin.manifest, modules: plugin.modules, host: createFakeHost({ seed: 1 }), seed: 1 });
  const snap = runtime.run({ frames: 60 });
  const simKey = 'keel-multi-module:sim:sim/index.js';
  const policyKey = 'keel-multi-module:policy:policy/index.js';
  assert.deepEqual(runtime.errors, []);
  assert.equal(snap.state[simKey].value.ticks, 60);
  assert.ok(snap.state[simKey].value.spawned >= 1);
  assert.ok(snap.state[simKey].value.hits > 0);
  assert.equal(snap.state[simKey].value.ended, true);
  assert.equal(runtime.runHook('policy.decide', { observation: { gold: 6 } }).ok, true);
  assert.deepEqual(runtime.snapshot().state[policyKey].value.decisions, ['upgrade']);
  assert.ok(plugin.content.records.some((r) => r.table === 'enemies' && r.id === 'enemy_x_keel_multi_module_demo'));
  assert.equal(plugin.ui.slots[0].slot, 'hud.right');
  assert.deepEqual(plugin.manifest.modules.find((m) => m.kind === 'ui').slots, ['hud.right']);
});

test('the native Keel reference template runs content + asset + sim + policy + ui and ships a valid pin', async () => {
  const dir = path.join(ROOT, 'plugins/_template/keel-reference');
  const read = await readPluginFolder(dir, { vanilla: vanilla() });
  assert.deepEqual(read.problems, []);
  assert.equal(read.plugin.keel.manifest, 3);
  assert.ok(read.plugin.visual.ops.length > 0, 'the asset module composes the strategy icon');
  const plugin = await loadKeelPlugin(dir);
  assert.deepEqual(plugin.problems, []);
  assert.deepEqual(plugin.modules.map((m) => m.kind).sort(), ['policy', 'sim'], 'only native code is evaluated');
  assert.equal(plugin.native.lockValid, true, 'the shipped lock pins every file (repack after editing)');
  assert.match(plugin.native.lockHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(plugin.native.entries.sort(), ['policy/index.js', 'sim/index.js']);
  assert.equal(plugin.assets.bands.band_x_keel_reference_sigil, 'assets/icon.png');
  assert.ok(plugin.content.records.some((r) => r.table === 'enemies' && r.id === 'enemy_x_keel_reference_crystal'));
  assert.ok(plugin.content.records.some((r) => r.table === 'bands' && r.id === 'band_x_keel_reference_sigil'));
  const merged = mergeKeelData(getData(), plugin.content);
  assert.equal(merged.enemies.enemy_x_keel_reference_crystal.key, 'enemy_x_keel_reference_crystal');
  assert.ok(merged.bands.band_x_keel_reference_sigil, 'the strategy record is merged');
  const runtime = createKeelRuntime({ manifest: plugin.manifest, modules: plugin.modules, host: createFakeHost({ seed: 1 }), seed: 1 });
  const snap = runtime.run({ frames: 60 });
  assert.deepEqual(runtime.errors, []);
  const simKey = 'keel-reference:sim:sim/index.js';
  const policyKey = 'keel-reference:policy:policy/index.js';
  assert.equal(snap.state[simKey].value.ticks, 60);
  assert.ok(snap.state[simKey].value.waves >= 3, 'a shard wave every 20 frames');
  assert.ok(snap.state[simKey].value.hits >= 20, 'two targets every 5 frames');
  assert.ok(snap.state[simKey].value.kills >= 1);
  assert.ok(snap.state[simKey].value.mitigated > 0, 'refractor shards take the halved hit');
  assert.ok(snap.state[simKey].value.mitigated <= snap.state[simKey].value.hits);
  assert.equal(snap.state[simKey].value.ended, true);
  assert.equal(snap.views[simKey].waves, snap.state[simKey].value.waves, 'the sim publishes its read-only view');
  assert.equal(runtime.runHook('policy.decide', { observation: { gold: 6, hand: 2 } }).ok, true);
  assert.equal(runtime.runHook('policy.decide', { observation: { gold: 6, hand: 6 } }).ok, true);
  assert.deepEqual(runtime.snapshot().state[policyKey].value.decisions, ['deploy', 'save']);
  assert.equal(runtime.snapshot().views[policyKey].last, 'save');
  assert.equal(plugin.ui.slots[0].slot, 'hud.right');
});
