// test/ui/custom.test.js — 选择自编: the selection helper (≤2 per tier), the CUSTOM_CHECK phase routing and the official
// step count (规程 4 steps, the default 盟约 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toggleCustomPick, CUSTOM_MAX_PER_TIER } from '../../public/js/screens/custom.js';
import { phaseMode, preGameSteps } from '../../public/js/ui/gameLogic/phases.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const slots = [
  { slotId: 't5a', tier: 5 }, { slotId: 't5b', tier: 5 }, { slotId: 't5c', tier: 5 },
  { slotId: 't6a', tier: 6 }, { slotId: 't6b', tier: 6 },
];

test('toggle: add, remove, and the per-tier limit', () => {
  assert.equal(CUSTOM_MAX_PER_TIER, 2);
  assert.deepEqual(toggleCustomPick(slots, [], 't5a'), ['t5a']);
  assert.deepEqual(toggleCustomPick(slots, ['t5a'], 't5a'), [], 'a click on a taken slot removes it');
  assert.deepEqual(toggleCustomPick(slots, ['t5a', 't5b'], 't5c'), null, 'a third tier-5 slot is refused');
  assert.deepEqual(toggleCustomPick(slots, ['t5a', 't6a'], 't6b'), ['t5a', 't6a', 't6b'], 'the other tier is free');
  assert.equal(toggleCustomPick(slots, [], 'nope'), null);
});

test('CUSTOM_CHECK routes to the custom screen and counts the official steps', () => {
  assert.equal(phaseMode('CUSTOM_CHECK'), 'custom');
  assert.equal(preGameSteps(load('data/versions/act3autochess-v3_1/config.json')), 4);
  assert.equal(preGameSteps(load('data/config.json')), 3);
  assert.equal(preGameSteps(null), 2);
});
