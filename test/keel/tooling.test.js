// test/keel/tooling.test.js — pack / install / check accept a native Keel manifest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getData } from '../../server/data.js';
import { checkPluginFolder, packPlugin, zipPlugin } from '../../server/plugins/pack.js';
import { installPluginBytes, installedPluginVersion } from '../../server/plugins/install.js';
import { importForge } from '../../server/plugins/forgeImport.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function vanilla() {
  const assets = getData().assets;
  return { manifest: assets, baseManifest: assets, sha256: 'tooling' };
}

test('check accepts the native Keel cosmetic / ui / script templates', async () => {
  for (const id of ['keel-cosmetic', 'keel-ui', 'keel-script']) {
    const r = await checkPluginFolder(path.join(ROOT, 'plugins/_template', id), { vanilla: vanilla() });
    assert.deepEqual(r.problems, [], `${id}: ${r.problems.join('\n')}`);
  }
});

test('pack, zip and install a native Keel plugin', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-tooling-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const src = path.join(ROOT, 'plugins/_template/keel-cosmetic');
  const work = path.join(tmp, 'keel-cosmetic');
  fs.cpSync(src, work, { recursive: true });
  const packed = packPlugin(work, { vanilla: vanilla() });
  assert.deepEqual(packed.build.problems, []);
  assert.equal(packed.wrote, true);
  assert.ok(fs.existsSync(path.join(work, 'plugin.lock.json')));
  const zip = zipPlugin(work);
  assert.ok(zip.body.length > 0);
  const plugins = path.join(tmp, 'plugins');
  fs.mkdirSync(plugins);
  const installed = installPluginBytes(zip.body, { pluginsDir: plugins, expectedId: 'keel-cosmetic' });
  assert.equal(installed.id, 'keel-cosmetic');
  assert.equal(installedPluginVersion(plugins, 'keel-cosmetic'), '0.1.0');
  assert.ok(fs.existsSync(path.join(plugins, 'keel-cosmetic/plugin.json')));
});

test('Forge --keel writes plugin.keel.json and packs it', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-forge-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const out = path.join(tmp, 'plugins', 'keel-numbers');
  const r = await importForge(path.join(ROOT, 'test/fixtures/forge/numbers-pack'), {
    out, root: ROOT, pluginsDir: path.join(tmp, 'plugins'), dataDir: path.join(ROOT, 'data'), keel: true,
    vanilla: vanilla(), scripts: false,
  });
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.ok(fs.existsSync(path.join(out, 'plugin.keel.json')));
  assert.ok(fs.existsSync(path.join(out, 'plugin.lock.json')));
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'plugin.keel.json'), 'utf8'));
  assert.equal(manifest.manifest, 3);
});
