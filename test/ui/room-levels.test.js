// test/ui/room-levels.test.js — 规程's room level picker (public/js/screens/room.js versionLevelOptions): the version's
// regulation modes, solo 等级1–20 and the four co-op difficulties, sorted; the default 盟约 config offers none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { versionLevelOptions } from '../../public/js/screens/room.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const act3 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1', 'config.json'), 'utf8'));
const covenant = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'config.json'), 'utf8'));

test('规程 solo: the 20 levels plus 极速模拟, sorted, each with its own mode id', () => {
  const levels = versionLevelOptions(act3, 'solo');
  assert.equal(levels.length, 21);
  assert.equal(levels[0].modeId, 'mode_single_funny');
  assert.equal(levels[1].modeId, 'mode_single_1');
  assert.equal(levels[20].modeId, 'mode_single_20');
  assert.ok(levels.every((m) => m.type === 'SINGLE' && typeof m.name === 'string'));
  assert.deepEqual(levels.map((m) => m.sortId), [...levels.map((m) => m.sortId)].sort((a, b) => a - b));
});

test('规程 co-op: the four multiplayer difficulties', () => {
  const modes = versionLevelOptions(act3, 'coop').map((m) => m.modeId);
  assert.deepEqual(modes, ['mode_multi_funny', 'mode_multi_normal', 'mode_multi_hard', 'mode_multi_abyss']);
});

test('the default 盟约 config has no version level picker', () => {
  assert.deepEqual(versionLevelOptions(covenant, 'solo'), []);
  assert.deepEqual(versionLevelOptions(null, 'solo'), []);
});
