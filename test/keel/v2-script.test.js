// test/keel/v2-script.test.js 鈥?the `sp:sdk@1` compatibility layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTENSIONS, resetExtensions } from '../../server/sim/content/extensions.js';
import { kitOf } from '../../server/sim/content/index.js';
import { isV2Script, loadV2ScriptPlugin, loadV2Setup, runV2Setup } from '../../server/keel/v2-script.js';
import { loadKeelPluginMap } from '../../server/keel/room-source.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'test/fixtures/keel/v2-script.js');
const manifest = () => ({ manifest: 2, id: 'script-demo', name: 'Script demo', version: '1.0.0', app: '*', api: 1, class: 'script', scope: ['room'], permissions: ['sim.code'], entry: { sim: 'sim/index.js' } });
function v2Dir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-v2-src-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'sim'));
  fs.copyFileSync(SCRIPT, path.join(dir, 'sim/index.js'));
  return dir;
}

test('a v2 setup(sp) script loads and registers its kit in an isolated extension registry', async (t) => {
  assert.equal(isV2Script(manifest()), true);
  const loaded = await loadV2ScriptPlugin(v2Dir(t), manifest());
  const result = runV2Setup({ setup: loaded.setup, plugin: { id: 'script-demo', permissions: ['sim.code'], overrides: [] } });
  try {
    assert.equal(result.registrations.some((r) => r.key === 'kit:char_x_script_demo_guard'), true);
    assert.equal(typeof result.registry.EXTENSIONS.char_x_script_demo_guard, 'function');
    assert.equal(typeof kitOf({ charId: 'char_x_script_demo_guard' }, undefined, result.registry.EXTENSIONS), 'function');
    assert.equal(EXTENSIONS.char_x_script_demo_guard, undefined, 'the process-global registry is not polluted');
  } finally {
    resetExtensions();
  }
});

test('two v2 setups keep separate registries (two rooms, two scripts)', async (t) => {
  const loaded = await loadV2ScriptPlugin(v2Dir(t), manifest());
  const a = runV2Setup({ setup: loaded.setup, plugin: { id: 'script-demo-a', permissions: ['sim.code'], overrides: [] } });
  const b = runV2Setup({ setup: loaded.setup, plugin: { id: 'script-demo-b', permissions: ['sim.code'], overrides: [] } });
  assert.notEqual(a.registry, b.registry);
  assert.equal(a.registry.owners.get('kit:char_x_script_demo_guard'), 'script-demo-a');
  assert.equal(b.registry.owners.get('kit:char_x_script_demo_guard'), 'script-demo-b');
  assert.equal(EXTENSIONS.char_x_script_demo_guard, undefined);
  resetExtensions();
});

test('the compat layer refuses a non-function default and an async setup', async () => {
  await assert.rejects(() => loadV2Setup('export default 1'), /setup\(sp\)/);
  await assert.rejects(() => loadV2Setup(''), /empty/);
  assert.throws(() => runV2Setup({ setup: async () => {}, plugin: { id: 'x' } }), /synchronous/);
  assert.throws(() => runV2Setup({ setup: () => {}, plugin: {} }), /plugin.id/);
  resetExtensions();
});

test('a lock that does not match the script bytes is refused', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-v2-lock-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'sim'));
  fs.copyFileSync(SCRIPT, path.join(dir, 'sim/index.js'));
  fs.writeFileSync(path.join(dir, 'plugin.lock.json'), JSON.stringify({ version: 1, files: { 'sim/index.js': { sha256: '0'.repeat(64), bytes: 1 } } }));
  const loaded = await loadV2ScriptPlugin(dir, manifest());
  assert.equal(loaded.tampered, true);
  assert.throws(() => runV2Setup({ setup: loaded.setup, plugin: { id: 'script-demo', permissions: ['sim.code'] }, tampered: loaded.tampered }), /plugin\.lock\.json/);
});

test('a plugin map applies the script trust gates to a Keel v2 script', async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-v2-map-'));
  const dir = path.join(parent, 'keel-v2-demo');
  fs.mkdirSync(path.join(dir, 'sim'), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(dir, 'sim/index.js'));
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    manifest: 3, id: 'keel-v2-demo', name: 'v2 demo', version: '1.0.0', app: '*', api: { sim: 1 }, scope: ['room'], trust: 'sandbox',
    modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.code'] }],
    compat: { v2Script: true },
    legacy: { class: 'script', permissions: ['sim.code'], entry: { sim: 'sim/index.js' } },
  }));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const map = await loadKeelPluginMap(parent, { mode: undefined });
  assert.equal(map.get('keel-v2-demo').v2.disabled.code, 'PLUGIN_SCRIPTS_DISABLED');
});

test('isV2Script is only true for a manifest-2 script/trusted entry', () => {
  assert.equal(isV2Script({ manifest: 2, class: 'content', entry: { sim: 'x.js' } }), false);
  assert.equal(isV2Script({ manifest: 2, class: 'script', entry: { sim: 'x.js' } }), true);
  assert.equal(isV2Script({ manifest: 2, class: 'trusted', entry: { server: 'x.js' } }), true);
  assert.equal(isV2Script({ manifest: 3, class: 'script', entry: { sim: 'x.js' } }), false);
});




