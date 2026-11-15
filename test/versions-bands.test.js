// test/versions-bands.test.js — the regulation season's band skills carry the official metadata (activity_table's
// skillInfoDataDict / effectInfoDataDict) in data/versions/act3autochess-v3_1/bands.json: skill type (ACTIVE / PASSIVE /
// NONE), target type (a chess / a shop slot / a map tile / none), availability and the effect/HUD flags. The 44 new bands
// are pinned by type; the default data keeps its bands.json byte for byte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const DEF = load('data/bands.json');
const ACT3 = load('data/versions/act3autochess-v3_1/bands.json');
const ADDED = Object.entries(ACT3).filter(([id]) => !DEF[id]);

test('all 44 new bands carry skill and effect metadata from the official table', () => {
  const types = {}, targets = {}, avail = {};
  for (const [id, b] of ADDED) {
    assert.ok(b.skill, `${id}: skill metadata`);
    assert.ok(b.effect, `${id}: effect metadata`);
    assert.equal(b.effect.type, 'BAND_SKILL', `${id}: effect type`);
    assert.ok(['ACTIVE', 'PASSIVE', 'NONE'].includes(b.skill.type), `${id}: skill type ${b.skill.type}`);
    assert.ok(['ROUND_RESET', 'ALL_LIMIT', 'DEFAULT', 'COOLDOWN'].includes(b.skill.availType), `${id}: availability ${b.skill.availType}`);
    avail[b.skill.availType] = (avail[b.skill.availType] || 0) + 1;
    types[b.skill.type] = (types[b.skill.type] || 0) + 1;
    const t = b.skill.targetType ?? 'null';
    targets[t] = (targets[t] || 0) + 1;
  }
  assert.deepEqual(types, { ACTIVE: 25, PASSIVE: 13, NONE: 6 });
  assert.deepEqual(avail, { ROUND_RESET: 17, ALL_LIMIT: 3, DEFAULT: 22, COOLDOWN: 2 });
  assert.deepEqual(targets, { COMMON_CHESS: 11, NO_TARGET: 10, SHOP_SLOT: 2, MAP_TILE: 2, null: 19 });
});

test('the default data bands stay without the version-only metadata', () => {
  for (const [id, b] of Object.entries(DEF)) {
    assert.equal('skill' in b, false, `${id}: no skill key`);
    assert.equal('effect' in b, false, `${id}: no effect key`);
  }
});
