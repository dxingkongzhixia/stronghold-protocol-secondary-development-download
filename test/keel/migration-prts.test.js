// test/keel/migration-prts.test.js — the two enemy content plugins migrated to `plugin.keel.json`.
//
// `plugins/*` is git-ignored: a checkout without the local plugin folders skips these checks instead of failing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKeelPlugin } from '../../server/keel/room-source.js';
import { mergeKeelData } from '../../server/keel/content.js';
import { getData } from '../../server/data.js';
import { readPluginFolder } from '../../server/plugins/registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

for (const [id, boss] of [['prts-source-code', 'boss_x_prts_source_code_prts'], ['black-snake', 'boss_x_black_snake_bsnake']]) {  test(`${id} loads from its Keel manifest, records and patches`, async (t) => {
    const dir = path.join(ROOT, 'plugins', id);
    if (!fs.existsSync(path.join(dir, 'plugin.keel.json'))) { t.skip(`${id} is not checked out (plugins/* is git-ignored)`); return; }
    const plugin = await loadKeelPlugin(dir);
    assert.ok(plugin.manifest);
    assert.equal(plugin.problems.length, 0, plugin.problems.join('\n'));
    assert.equal(plugin.manifest.manifest, 3);
    assert.ok(plugin.content.enemies.has(`${boss.replace(/^boss_/, 'enemy_')}`) || plugin.content.records.some((r) => r.table === 'enemies'), 'enemy records load');
    assert.ok(plugin.content.patches.length > 0, 'config.modes patches are kept for merge time');
    assert.ok(plugin.assets?.enemies, 'the asset module carries the enemy art');
    assert.ok(plugin.assets?.fx, 'the asset module carries FX');
    assert.ok(plugin.assets?.audio, 'the asset module carries audio');

    const base = getData();
    const merged = mergeKeelData(base, plugin.content);
    assert.ok(merged.enemies[`enemy_x_${id === 'prts-source-code' ? 'prts_source_code_prts' : 'black_snake_bsnake'}`], 'an enemy was added');
    assert.ok(merged.bosses[boss], 'the boss was added');
    assert.ok(merged.config.modes.mode_single_normal.bossWeights[boss] > 0, 'the official mode patch applied');
  });

  test(`${id} is declared by the registry through plugin.keel.json`, async (t) => {
    const dir = path.join(ROOT, 'plugins', id);
    if (!fs.existsSync(path.join(dir, 'plugin.keel.json'))) { t.skip(`${id} is not checked out (plugins/* is git-ignored)`); return; }
    const r = await readPluginFolder(dir, { vanilla: { manifest: null, sha256: null } });
    assert.deepEqual(r.problems, []);
    assert.equal(r.plugin.keel.manifest, 3);
    assert.equal(r.plugin.manifest.manifestFile, 'plugin.keel.json');
    assert.deepEqual(Object.keys(r.plugin.content.files).sort(), ['content/bosses.json', 'content/enemies.json', 'content/modes.json', 'content/waves.json', 'plugin.keel.json'].sort());
  });
}

test('a native manifest 3 in plugin.json is read as Keel (the shipped template)', async () => {
  const dir = path.join(ROOT, 'plugins/_template/keel-survival');
  const r = await readPluginFolder(dir, { vanilla: { manifest: null, sha256: null } });
  assert.deepEqual(r.problems, []);
  assert.equal(r.plugin.keel.manifest, 3);
  assert.equal(r.plugin.manifest.manifestFile, 'plugin.json');
  assert.ok(r.plugin.content.documents['content/enemies.json'], 'the declared content part is read');
});
