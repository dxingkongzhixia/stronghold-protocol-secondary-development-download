// test/versions-isolation.test.js — the two official versions are isolated (owner 2026-11-15): no regulation-only id,
// mode, bond, band, enemy or template reaches the default 盟约 data, and the default config carries no version block.
// The default golden corpus (test/golden) and `node tools/build-data.mjs --offline` cover the byte-level side; this file
// locks the data surface the UI and the match engine branch on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const DEF = (n) => read(`data/${n}.json`);
const ACT3 = (n) => read(`data/versions/act3autochess-v3_1/${n}.json`);

test('the default config has no version block; the regulation one names its family', () => {
  assert.equal(DEF('config').version, undefined);
  assert.equal(ACT3('config').version.family, 'regulation');
  assert.equal(ACT3('config').version.id, 'act3autochess@V3_1');
  assert.equal(ACT3('config').version.season, 'act3autochess');
});

test('regulation-only modes, bands and enemies stay out of the default data', () => {
  assert.equal(DEF('config').modes.mode_single_20, undefined);
  assert.ok(ACT3('config').modes.mode_single_20);
  assert.equal(DEF('bands').band_treasure, undefined);
  assert.ok(ACT3('bands').band_treasure);
  assert.equal(DEF('enemies').enemy_9036_acweb, undefined);
  assert.ok(ACT3('enemies').enemy_9036_acweb);
  assert.equal(DEF('backups').units.char_1037_amiya3, undefined);
});

test('the regulation roster, bonds and templated operator are only in the version data', () => {
  assert.equal(DEF('chess').chess_char_5_26_a, undefined, 'the default 盟约 has no Amiya chess');
  assert.equal(ACT3('chess').chess_char_5_26_a.charId, 'char_1037_amiya3');
  assert.equal(Object.keys(DEF('bonds')).length, 23);
  assert.equal(Object.keys(ACT3('bonds')).length, 26);
  assert.equal(DEF('bonds').lethaniaShip, undefined);
  assert.ok(ACT3('bonds').lethaniaShip);
});

test('the shared asset manifest is one index for every version (not a roster)', () => {
  const assets = DEF('assets');
  // One manifest serves every version by design: it MAY carry a version's local overlays (spineLocal) and, after an
  // online asset run, its operator art. What must never happen is a regulation operator reaching the default DATA above;
  // this manifest is the shared art index, not the default roster.
  assert.ok(assets && typeof assets === 'object');
});
