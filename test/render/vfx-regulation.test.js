// test/render/vfx-regulation.test.js — the 规程 (act3autochess) official-effect table (render/vfx/regulation-fx.js):
// every roster prefab is in the committed local fx index, the two kit-fx bindings resolve, and the operator covers name
// the official loop each skill's plan already plays. Pure data: no browser, no GL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REGULATION_FX_ROSTER, REGULATION_FX_OPERATORS, REGULATION_FX_BINDINGS, REGULATION_SKILL_BINDINGS,
  REGULATION_FX_COVER, regulationRosterKeys,
} from '../../public/js/render/vfx/regulation-fx.js';
import {
  ENEMY_FX_BINDINGS, ENEMY_FX_KINDS, FX_BINDINGS, bindingKeys, coverOf,
} from '../../public/js/render/vfx/skills.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INDEX = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/local/fx/index.json'), 'utf8'));

test('every official prefab the regulation table names is in the committed fx index', () => {
  const missing = [...regulationRosterKeys()].filter((k) => !INDEX.prefabs[k]);
  assert.deepEqual(missing, [], `missing prefabs: ${missing.join(', ')}`);
  for (const key of Object.keys(REGULATION_FX_ROSTER)) assert.ok(INDEX.units[key], `${key}: an index unit`);
});

test('the 15 act3-only operators are index units with their skills', () => {
  assert.equal(REGULATION_FX_OPERATORS.length, 15);
  for (const key of REGULATION_FX_OPERATORS) {
    const u = INDEX.units[key];
    assert.ok(u, `${key}: an index unit`);
    assert.ok(Object.keys(u.skills || {}).length > 0, `${key}: skills`);
  }
});

test('后兽 form2: the timer switch plays the official switch clip, not the procedural phase', () => {
  const bind = ENEMY_FX_BINDINGS.enemy_2123_dyjsww?.phase;
  assert.ok(bind, 'enemy_2123_dyjsww phase binding');
  assert.equal(REGULATION_FX_BINDINGS.enemy_2123_dyjsww.phase, bind);
  assert.equal(bind.xkind, 'form2');
  assert.deepEqual(bind.keys, ['enemy_dyjsww_die_01']);
  assert.ok(INDEX.prefabs.enemy_dyjsww_die_01);
  assert.ok(ENEMY_FX_KINDS.phase.includes('enemy_2123_dyjsww'), 'phase is a bound enemy kind');
});

test('风丸 S2: the summoned <替身> plays kazema_skill_02_start at its tile', () => {
  const bind = FX_BINDINGS.skchr_kazema_2?.summon;
  assert.ok(bind, 'skchr_kazema_2 summon binding');
  assert.equal(REGULATION_SKILL_BINDINGS.skchr_kazema_2.summon, bind);
  assert.equal(bind.owner, 'skill');
  assert.deepEqual(bindingKeys(INDEX, 'skchr_kazema_2'), ['kazema_skill_02_start']);
  assert.ok(INDEX.prefabs.kazema_skill_02_start);
});

test('the covered operator kit fx name the official skill loops the plans play', () => {
  const cases = {
    skchr_rosesa_2: ['saltWard', ['rosesa_skill_02_buff_01']],
    skchr_cathy_2: ['overclock', ['cathy_skill_02_buff']],
    skchr_flamtl_1: ['dp', ['common_charge_cost_start_01']],
    skchr_flamtl_2: ['aoe', ['flamtl_skill_02_start_01']],
    skchr_flamtl_3: ['flame', ['flamtl_skill_03_buff_01']],
  };
  for (const [sid, [kind, keys]] of Object.entries(cases)) {
    assert.equal(coverOf(sid, kind), true, `${sid}: ${kind} covered`);
    for (const k of keys) assert.ok(INDEX.prefabs[k], `${sid}: ${k} in the index`);
  }
  assert.deepEqual(REGULATION_FX_COVER.skchr_flamtl_2, ['aoe', 'dp']);
});
