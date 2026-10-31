// test/keel/migration-prts-kaltsit.test.js — the first migrated real plugin (`plugin.keel.json`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKeelPlugin } from '../../server/keel/room-source.js';
import { mergeKeelData } from '../../server/keel/content.js';
import { getData } from '../../server/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'plugins/prts-kaltsit');

test('prts-kaltsit has a manifest-3 migration and its records load', async (t) => {
  if (!fs.existsSync(path.join(DIR, 'plugin.keel.json'))) { t.skip('prts-kaltsit is not checked out (plugins/* is git-ignored)'); return; }
  const plugin = await loadKeelPlugin(DIR);
  assert.ok(plugin.manifest);
  assert.equal(plugin.problems.length, 0, plugin.problems.join('\n'));
  assert.equal(plugin.manifest.manifest, 3);
  assert.equal(plugin.content.bands.has('band_x_prts_kaltsit_touch'), true);
  assert.equal(plugin.content.tokens.has('token_x_prts_kaltsit_mon3tr'), true);
  assert.equal(plugin.content.operators.has('char_x_prts_kaltsit_one'), true);
  const merged = mergeKeelData(getData(), plugin.content);
  assert.equal(merged.bands.band_x_prts_kaltsit_touch.bandId, 'band_x_prts_kaltsit_touch');
  assert.equal(merged.tokens.token_x_prts_kaltsit_mon3tr.tokenId, 'token_x_prts_kaltsit_mon3tr');
  assert.equal(merged.chess.chess_x_prts_kaltsit_one_a.charId, 'char_x_prts_kaltsit_one', 'the operator compiles to the normal shop piece');
  assert.equal(merged.chess.chess_x_prts_kaltsit_one_b.isGolden, true, 'and to the elite piece');
  assert.equal(merged.chess.char_x_prts_kaltsit_one, undefined, 'an operator JSON is not a chess record');
});
