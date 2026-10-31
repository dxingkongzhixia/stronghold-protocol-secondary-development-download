// test/keel/native-delivery.test.js — a Keel room's content set carries the native module sources the trust gate
// allowed, pinned by the room's cs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getData } from '../../server/data.js';
import { createKeelContentSets } from '../../server/keel/content-sets.js';
import { loadKeelPluginMap } from '../../server/keel/room-source.js';
import { packPlugin } from '../../server/plugins/pack.js';
import { readPluginFolder } from '../../server/plugins/registry.js';

function plugin(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-native-set-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const id = 'native-set';
  const dir = path.join(tmp, id);
  fs.mkdirSync(path.join(dir, 'content'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'sim'), { recursive: true });
  const record = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'plugins/_template/keel-multi-module/content/enemies.json'), 'utf8'));
  record.entries[0].id = 'enemy_x_native_set_demo';
  record.entries[0].value.key = 'enemy_x_native_set_demo';
  fs.writeFileSync(path.join(dir, 'content/enemies.json'), JSON.stringify(record));
  fs.writeFileSync(path.join(dir, 'sim/index.js'), 'export default { setup() {}, hooks: {} };\n');
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    manifest: 3, id, name: 'Native set', version: '1.0.0', app: '*',
    api: { content: 1, sim: 1 }, scope: ['room'], trust: 'sandbox',
    modules: [
      { kind: 'content', files: ['content/enemies.json'], parts: { data: ['content/enemies.json'] }, permissions: ['content.define'], provides: ['enemy:enemy_x_native_set_demo'] },
      { kind: 'sim', entry: 'sim/index.js', permissions: ['sim.code'] },
    ],
  }, null, 2));
  const locked = packPlugin(dir, { dataDir: path.join(process.cwd(), 'data') });
  assert.equal(locked.wrote, true, JSON.stringify(locked.build?.issues ?? []));
  return { tmp, id };
}

test('the Keel content set serves native module sources and pins them in index.keel', async (t) => {
  const { tmp, id } = plugin(t);
  const map = await loadKeelPluginMap(tmp, { host: '127.0.0.1', mode: 'sandbox' });
  assert.ok(map.has(id), 'the trust gate admitted the plugin');
  const contents = createKeelContentSets({ plugins: map, vanillaData: getData() });
  const resolved = contents.resolve([id], { scope: 'room' });
  assert.equal(resolved.ok, true, JSON.stringify(resolved.problems ?? resolved));
  const cs16 = resolved.set.cs.slice(0, 16);
  const index = JSON.parse(contents.file(cs16, 'index.json').body.toString('utf8'));
  const entry = index.keel?.plugins?.find((p) => p.id === id);
  assert.ok(entry, 'index.keel names the plugin');
  assert.equal(entry.execution, 'sandbox');
  assert.equal(entry.name, 'Native set');
  assert.deepEqual(entry.authors, []);
  assert.deepEqual(entry.modules.map((m) => [m.kind, m.entry]), [['sim', 'sim/index.js']]);
  assert.deepEqual(entry.modules[0].permissions, ['sim.code'], 'capabilities travel to the page');
  const part = index.plugins.find((p) => p.id === id);
  const rel = `keel/${id}/sim/index.js`;
  assert.equal(part.files[rel], entry.modules[0].sha256, 'parts.files pins the module');
  const file = contents.file(cs16, rel);
  assert.ok(file?.body?.length);
  assert.match(file.body.toString('utf8'), /export default/);
  assert.ok(contents.dataOf(resolved.set.cs).enemies.enemy_x_native_set_demo);
});

test('the reference template is delivered as sim only: content, asset and sim reach the browser, policy stays meta', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-reference-set-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.cpSync(path.join(process.cwd(), 'plugins/_template/keel-reference'), path.join(tmp, 'keel-reference'), { recursive: true });
  const map = await loadKeelPluginMap(tmp, { host: '127.0.0.1', mode: 'sandbox' });
  assert.ok(map.has('keel-reference'), 'the shipped pin lets the trust gate admit it');
  const contents = createKeelContentSets({ plugins: map, vanillaData: getData() });
  const resolved = contents.resolve(['keel-reference'], { scope: 'room' });
  assert.equal(resolved.ok, true, JSON.stringify(resolved.problems ?? resolved));
  const cs16 = resolved.set.cs.slice(0, 16);
  const index = JSON.parse(contents.file(cs16, 'index.json').body.toString('utf8'));
  const entry = index.keel.plugins.find((p) => p.id === 'keel-reference');
  assert.deepEqual(entry.modules.map((m) => m.kind), ['sim'], 'policy is not sent to the page');
  assert.ok(entry.modules[0].permissions.includes('sim.spawn'));
  const part = index.plugins.find((p) => p.id === 'keel-reference');
  assert.ok(part.files['keel/keel-reference/sim/index.js']);
  assert.equal(part.files['keel/keel-reference/policy/index.js'] ?? null, null, 'meta code stays on the server');
  assert.equal(contents.file(cs16, 'keel/keel-reference/policy/index.js'), null);
  assert.ok(contents.file(cs16, 'keel/keel-reference/sim/index.js').body.length);
  const data = contents.dataOf(resolved.set.cs);
  assert.ok(data.enemies.enemy_x_keel_reference_crystal);
  assert.ok(data.bands.band_x_keel_reference_sigil);
});

test('a manifest-2 folder is not in the Keel plugin map', async (t) => {
  const { tmp, id } = plugin(t);
  const map = await loadKeelPluginMap(tmp, { host: '127.0.0.1', mode: 'sandbox' });
  assert.equal(map.has(id), true);
  const dir = path.join(tmp, 'data-demo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ manifest: 2, id: 'data-demo', name: 'demo', version: '1.0.0', app: '*', api: 1, class: 'content', scope: ['room'] }));
  const after = await loadKeelPluginMap(tmp, { host: '127.0.0.1', mode: 'sandbox' });
  assert.equal(after.has('data-demo'), false, 'only manifest 3 reaches the room map');
});
