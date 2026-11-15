// test/ui/hud-version.test.js — the 规程 HUD mark (public/js/ui/hud.js versionMarkModel): the season label and the room's
// mode name for version data, nothing for the default 盟约 config.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { versionMarkModel } from '../../public/js/ui/hud.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

test('规程 shows 规程·序列Ⅰ + the exact mode name', () => {
  const config = load('data/versions/act3autochess-v3_1/config.json');
  assert.deepEqual(versionMarkModel(config, { modeId: 'mode_single_7' }), { label: '规程·序列Ⅰ', level: '规程等级7' });
  assert.deepEqual(versionMarkModel(config, { modeId: 'mode_multi_hard' }), { label: '规程·序列Ⅰ', level: '绝境模拟' });
});

test('the default 盟约 HUD has no version mark', () => {
  assert.equal(versionMarkModel(load('data/config.json'), { modeId: 'mode_multi_hard' }), null);
  assert.equal(versionMarkModel(null, { modeId: 'mode_multi_hard' }), null);
  assert.equal(versionMarkModel({ version: { id: 'x', family: 'covenant' } }, { modeId: 'mode_multi_hard' }), null);
});
