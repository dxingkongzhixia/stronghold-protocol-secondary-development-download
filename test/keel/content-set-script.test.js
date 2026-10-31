// test/keel/content-set-script.test.js — V2 of the compatibility line: a Keel room's v2 script reaches the browser
// through its content set, and native trust is refused there (no consent flow exists for a Keel room).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getData } from '../../server/data.js';
import { loadKeelPlugin, loadKeelPluginMap } from '../../server/keel/room-source.js';
import { createKeelContentSets } from '../../server/keel/content-sets.js';

function pluginDir(t, id, manifest, files) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `keel-${id}-`));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const dir = path.join(tmp, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ ...manifest, id }, null, 2));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  return { tmp, dir };
}

const scriptManifest = (id) => ({
  manifest: 3, id, name: { zh: '脚本示例', en: 'Script demo' }, version: '1.0.0', app: '*',
  api: { sim: 1 }, scope: ['room'], trust: 'sandbox',
  modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.code'] }],
  compat: { v2Script: true },
  legacy: { class: 'script', entry: { sim: 'sim/index.js' }, permissions: ['sim.code'] },
});

test('a Keel v2 script is served to the browser by the Keel content set', { timeout: 30000 }, async (t) => {
  const { dir } = pluginDir(t, 'keel-script-demo', scriptManifest('keel-script-demo'), {
    'sim/index.js': 'export default function setup(sp) { sp.log?.("keel script demo"); }\n',
  });
  const plugin = await loadKeelPlugin(dir);
  assert.deepEqual(plugin.problems, [], plugin.problems.join('\n'));
  assert.ok(plugin.v2?.script?.sources?.['sim/index.js'], 'the entry source is read');
  // What applyTrust (server/plugins/trusted.js) decides in an owner-enabled room; the sandbox probe needs SES.
  plugin.v2.script.execution = 'trusted';
  const contents = createKeelContentSets({ plugins: new Map([[plugin.id, plugin]]), vanillaData: getData() });
  const resolved = contents.resolve([plugin.id], { scope: 'room' });
  assert.equal(resolved.ok, true, JSON.stringify(resolved.problems ?? resolved));
  const cs16 = resolved.set.cs.slice(0, 16);
  const index = JSON.parse(contents.file(cs16, 'index.json').body.toString('utf8'));
  assert.equal(index.execution, 'trusted');
  assert.ok(index.scripts['keel-script-demo'], 'the index names the script');
  const descriptor = JSON.parse(contents.file(cs16, 'scripts/keel-script-demo.json').body.toString('utf8'));
  assert.equal(descriptor.id, 'keel-script-demo');
  assert.match(descriptor.manifestSource, /"class":"script"/);
  assert.ok(descriptor.sources['sim/index.js'].includes('setup'), 'the descriptor carries the entry source');
  const body = contents.file(cs16, 'scripts/keel-script-demo/sim/index.js');
  assert.ok(body?.body?.length, 'the browser entry is served');
  assert.match(body.body.toString('utf8'), /setup/);
});

test('native trust is refused on the Keel path (it stays on the legacy loader)', { timeout: 30000 }, async (t) => {
  const manifest = {
    manifest: 3, id: 'keel-native-demo', name: 'Native demo', version: '1.0.0', app: '*',
    api: { match: 1 }, scope: ['room'], trust: 'native',
    modules: [{ kind: 'match', entry: 'server.js', permissions: ['native.execute'] }],
    compat: { v2Script: true },
    legacy: { class: 'trusted', entry: { server: 'server.js' }, permissions: ['trusted.server'] },
  };
  const { tmp, dir } = pluginDir(t, 'keel-native-demo', manifest, { 'server.js': 'export default {};\n' });
  const plugin = await loadKeelPlugin(dir);
  assert.match(plugin.problems.join('\n'), /PLUGIN_KEEL_NATIVE/);
  const map = await loadKeelPluginMap(tmp, { host: '127.0.0.1', mode: 'trusted-force' });
  assert.equal(map.has('keel-native-demo'), false, 'a native-trust plugin is not a Keel room plugin');
});
