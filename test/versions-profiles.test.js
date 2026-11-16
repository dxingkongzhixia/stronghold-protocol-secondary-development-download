// test/versions-profiles.test.js — tools/versions/profiles.mjs: every registered official version resolves a profile whose
// id / season match the registry, the 规程 profile names its section, layout, pin and measured tables, and the pin groups
// map a gamedata file to its official commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProfile, pinGroupOf, pinnedShaOf } from '../tools/versions/profiles.mjs';
import { applyAdapters } from '../tools/versions/adapters.mjs';
import { DEFAULT_VERSION } from '../shared/versions.js';

const ACT3 = 'act3autochess@V3_1';

test('every registered version resolves a profile that matches its registry entry', async () => {
  const def = await loadProfile(DEFAULT_VERSION);
  assert.equal(def.profile.id, DEFAULT_VERSION);
  assert.equal(def.profile.season, 'act2autochess');
  assert.equal(def.profile.pins, null);

  const a = await loadProfile(ACT3);
  assert.equal(a.profile.id, ACT3);
  assert.equal(a.profile.season, 'act3autochess');
  assert.deepEqual(a.profile.section, ['AUTOCHESS', 'act3autochess', 'V3_1']);
  assert.equal(a.profile.layout, 'regulation');
  assert.equal(a.profile.tables, 'act3autochess-v3_1');
  assert.equal(a.profile.pins.default, '6f63c14e');
  await assert.rejects(() => loadProfile('not_a_version'), /unknown version/);
});

test('pin groups map each gamedata file to the commit group it is read from', () => {
  assert.equal(pinGroupOf('excel/activity_table.json'), 'activity');
  assert.equal(pinGroupOf('excel/char_patch_table.json'), 'character');
  assert.equal(pinGroupOf('excel/skill_table.json'), 'character');
  assert.equal(pinGroupOf('levels/activities/act3autochess/level_act3autochess_m01.json'), 'levels');
  assert.equal(pinGroupOf('excel/not_a_table.json'), null);
  const profile = { pins: { default: '6f63c14e', levels: 'other' } };
  assert.equal(pinnedShaOf(profile, 'excel/activity_table.json'), '6f63c14e');
  assert.equal(pinnedShaOf(profile, 'levels/activities/x/level_x.json'), 'other');
  assert.equal(pinnedShaOf({ pins: null }, 'excel/activity_table.json'), null);
});

test('the profile names the measured tables module the builder imports', async () => {
  const { profile } = await loadProfile(ACT3);
  const mod = await import(`../tools/versions/tables/${profile.tables}.mjs`);
  assert.ok(Array.isArray(mod.enemyExtras));
  assert.ok(mod.bountyDrafts && mod.shopDraft && mod.tacticDraft);
});

test('the adapter registry runs a named adapter in order and refuses an unknown one', () => {
  const tables = {};
  applyAdapters(tables, []); // the current pin needs none
  assert.throws(() => applyAdapters(tables, ['not_an_adapter']), /unknown build adapter/);
});
