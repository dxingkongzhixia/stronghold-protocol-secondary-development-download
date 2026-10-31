// test/keel/keel-only.test.js — after N5 the loader has one format: a folder that still carries manifest 2 is refused
// with a coded problem, no environment switch brings it back, and a native manifest 3 still loads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPluginFolder } from '../../server/plugins/registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function manifest2(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-legacy-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const folder = path.join(dir, 'data-demo');
  fs.mkdirSync(path.join(folder, 'data'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'plugin.json'), JSON.stringify({
    manifest: 2, id: 'data-demo', name: 'demo', version: '1.0.0', app: '*', api: 1, class: 'content', scope: ['room'],
    permissions: ['data.patch'], data: ['data/patch.json'],
  }));
  fs.writeFileSync(path.join(folder, 'data/patch.json'), JSON.stringify({ patch: 1, ops: [] }));
  return folder;
}

for (const env of [{}, { KEEL: '1' }, { KEEL: '0' }]) {
  test(`a manifest-2 folder is refused (${JSON.stringify(env)})`, async (t) => {
    const dir = manifest2(t);
    const old = { KEEL: process.env.KEEL, KEEL_ONLY: process.env.KEEL_ONLY };
    if (env.KEEL === undefined) delete process.env.KEEL; else process.env.KEEL = env.KEEL;
    delete process.env.KEEL_ONLY;
    try {
      const r = await readPluginFolder(dir, { vanilla: { manifest: null, sha256: null } });
      assert.equal(r.plugin, null);
      assert.ok(r.issues.some((i) => i.code === 'PLUGIN_LEGACY_REMOVED'), r.problems.join('\n'));
    } finally {
      if (old.KEEL === undefined) delete process.env.KEEL; else process.env.KEEL = old.KEEL;
      if (old.KEEL_ONLY === undefined) delete process.env.KEEL_ONLY; else process.env.KEEL_ONLY = old.KEEL_ONLY;
    }
  });
}

test('a native manifest 3 still loads', async () => {
  const dir = path.join(ROOT, 'plugins/_template/keel-survival');
  const r = await readPluginFolder(dir, { vanilla: { manifest: null, sha256: null } });
  assert.deepEqual(r.problems, []);
  assert.equal(r.plugin.keel.manifest, 3);
});
