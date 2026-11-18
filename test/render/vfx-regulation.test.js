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

test('kit cues whose official effect is a target-side loop or a projectile impact are bound', () => {
  // 冻河 S1: the mark the kit places on an ally → the two official mark loops (on: targets).
  const tocka = FX_BINDINGS.skchr_tocka_1?.mark;
  assert.ok(tocka, 'skchr_tocka_1 mark binding');
  assert.equal(REGULATION_SKILL_BINDINGS.skchr_tocka_1.mark, tocka);
  assert.equal(tocka.at, 'target');
  assert.deepEqual(tocka.keys, ['tocka_skill_01_buff_02', 'tocka_skill_01_buff_01']);
  for (const k of tocka.keys) assert.ok(INDEX.prefabs[k], k);
  // 冻河 S2: the link the kit places on one ally → the projectile's impact and the action's buff loop.
  const tocka2 = FX_BINDINGS.skchr_tocka_2?.allyMark;
  assert.ok(tocka2, 'skchr_tocka_2 allyMark binding');
  assert.equal(tocka2.at, 'target');
  assert.deepEqual(tocka2.keys, ['tocka_skill_02_hit_01', 'tocka_skill_02_buff_02']);
  for (const k of tocka2.keys) assert.ok(INDEX.prefabs[k], k);
  // 寒檀 S2: the icicle's reached effect (the 8 s ice field) on the impact tile.
  const sntlla = FX_BINDINGS.skchr_sntlla_2?.iceSpike;
  assert.ok(sntlla, 'skchr_sntlla_2 iceSpike binding');
  assert.equal(sntlla.at, 'point');
  assert.deepEqual(sntlla.keys, ['sntlla_skill_02_start_01']);
  assert.ok(INDEX.prefabs.sntlla_skill_02_start_01);
});
