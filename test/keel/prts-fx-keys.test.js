// test/keel/prts-fx-keys.test.js — the PRTS protocol's FX keys are served by the plugin's Keel asset module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLUGIN = path.join(ROOT, 'plugins/prts-source-code');

test('every bossProtocol FX key exists in the plugin\'s Keel fx index', (t) => {
  if (!fs.existsSync(path.join(PLUGIN, 'plugin.keel.json'))) { t.skip('prts-source-code is not checked out (plugins/* is git-ignored)'); return; }
  const runtime = fs.readFileSync(path.join(ROOT, 'server/sim/content/bossProtocol.js'), 'utf8');
  const keys = [...new Set([...runtime.matchAll(/'(enemy_[a-z0-9_]+)'/g)].map((m) => m[1]))];
  assert.ok(keys.length >= 10, `${keys.length} keys`);
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'plugin.keel.json'), 'utf8'));
  const asset = manifest.modules.find((m) => m.kind === 'asset');
  assert.equal(asset.assets.fx.index, 'assets/fx/index.json');
  const index = JSON.parse(fs.readFileSync(path.join(PLUGIN, asset.assets.fx.index), 'utf8'));
  const known = new Set([...Object.keys(index.prefabs ?? {}), ...Object.keys(index.skills ?? {}), ...Object.keys(index.units ?? {}), ...Object.keys(index.textures ?? {})]);
  assert.deepEqual(keys.filter((key) => !known.has(key)), [], 'keys missing from the Keel fx index');
});
