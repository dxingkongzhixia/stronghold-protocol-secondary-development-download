// test/render/vfx-mode-row-guard.test.js — a mode's attack rows that index.json assigned to a DIFFERENT skill of the
// same operator must not play for the other skill (owner report 2026-11-07: 莫斯提马 S2 荒时之锁 showed 序时之匙's
// (S3) attack effects, because the one non-default extracted mode named `S2` carries `mostma_skill_03_*` rows).
// skills.js MODE_ROW_GUARD marks the plan; wiring.js drops matching mode rows in attack() and castStart().

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { skillPlan } from '../../public/js/render/vfx/skills.js';

const IDX = JSON.parse(readFileSync(new URL('../../public/assets/local/fx/index.json', import.meta.url)));

test('莫斯提马: S2 marks S3 mode rows for dropping, S3 keeps its own', () => {
  const s2 = skillPlan(IDX, 'char_213_mostma', 'skchr_mostma_2');
  assert.ok(s2.dropModeKeys instanceof RegExp, 'S2 carries the guard');
  assert.equal(s2.dropModeKeys.test('mostma_skill_03_start'), true, 'S3 cast rows dropped');
  assert.equal(s2.dropModeKeys.test('mostma_skill_03_hit'), true, 'S3 hit rows dropped');
  assert.equal(s2.dropModeKeys.test('mostma_skill_02_start'), false, 'S2 rows kept');

  const s3 = skillPlan(IDX, 'char_213_mostma', 'skchr_mostma_3');
  assert.equal(s3.dropModeKeys, undefined, 'S3 plays the mode rows it owns');

  const s1 = skillPlan(IDX, 'char_213_mostma', 'skcom_atk_up');
  assert.equal(s1.dropModeKeys, undefined, 'the generic ATK-up skill has no mode guard');
});
