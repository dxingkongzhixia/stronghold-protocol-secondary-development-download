// test/keel/migration-golden.test.js — the old content set and Keel produce the same plugin-owned data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getData } from '../../server/data.js';
import { loadKeelPlugin } from '../../server/keel/room-source.js';
import { mergeKeelData } from '../../server/keel/content.js';
import { readPluginFolder } from '../../server/plugins/registry.js';
import { createContentSets } from '../../server/plugins/contentSets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const present = (id) => fs.existsSync(path.join(ROOT, 'plugins', id, 'plugin.keel.json'));

async function oldData(id) {
  const data = getData();
  const vanilla = { manifest: data.assets, baseManifest: data.assets, sha256: 'golden' };
  const read = await readPluginFolder(path.join(ROOT, 'plugins', id), { vanilla });
  assert.deepEqual(read.problems, [], `${id} registry problems`);
  const registry = { plugin: (key) => (key === id ? read.plugin : null), onScan: () => null };
  const contents = createContentSets({ registry, vanillaData: data, log: { info() {}, warn() {}, error() {} }, maxSets: () => 4 });
  const resolved = contents.resolve([id], { scope: 'room' });
  assert.equal(resolved.ok, true, `${id} old content set: ${JSON.stringify(resolved)}`);
  return contents.dataOf(resolved.set.cs);
}

function pick(object, prefix) {
  return Object.fromEntries(Object.entries(object ?? {}).filter(([key]) => key.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)));
}

for (const [id, prefixes] of [
  ['prts-kaltsit', ['chess_x_prts_kaltsit_', 'token_x_prts_kaltsit_', 'band_x_prts_kaltsit_']],
  ['prts-source-code', ['enemy_x_prts_source_code_', 'boss_x_prts_source_code_', 'wave_x_prts_source_code_']],
  ['black-snake', ['enemy_x_black_snake_', 'boss_x_black_snake_', 'wave_x_black_snake_']],
]) {
  test(`${id}: old content set and Keel agree on plugin-owned records`, async (t) => {
    if (!present(id)) { t.skip(`${id} is not checked out (plugins/* is git-ignored)`); return; }
    const base = getData();
    const plugin = await loadKeelPlugin(path.join(ROOT, 'plugins', id));
    const keel = mergeKeelData(base, plugin.content);
    const old = await oldData(id);
    for (const prefix of prefixes) {
      const table = prefix.split('_')[0] === 'enemy' ? 'enemies'
        : prefix.split('_')[0] === 'boss' ? 'bosses'
          : prefix.split('_')[0] === 'wave' ? 'waves'
            : prefix.split('_')[0] === 'token' ? 'tokens'
              : prefix.split('_')[0] === 'band' ? 'bands' : 'chess';
      assert.deepEqual(pick(keel[table], prefix), pick(old[table], prefix), `${id} ${table}`);
    }
    if (id === 'prts-kaltsit') {
      assert.deepEqual(keel.backups.diy.operators.char_x_prts_kaltsit_one, old.backups.diy.operators.char_x_prts_kaltsit_one);
      assert.deepEqual(keel.backups.units.char_x_prts_kaltsit_one, old.backups.units.char_x_prts_kaltsit_one);
    } else {
      for (const mode of ['mode_single_normal', 'mode_single_funny', 'mode_multi_funny']) {
        assert.deepEqual(keel.config.modes[mode]?.bossWeights, old.config.modes[mode]?.bossWeights, `${id} ${mode}.bossWeights`);
        assert.deepEqual(keel.config.modes[mode]?.rounds, old.config.modes[mode]?.rounds, `${id} ${mode}.rounds`);
      }
    }
  });
}
