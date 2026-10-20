// §35.20: the verified normal-attack clip switches (upstream 60d182c3d), adapted to this fork's SpineActor.
//
// The upstream suite also drives a real SpineActor through the begin/loop/end sequence. That sequence is part of
// 0.3.2's spine.js rework, which this fork has not taken, so these cases pin the one thing the feature decides:
// which attack ROLE a verified skill uses. The role itself (begin / loop / end / facing / down) still comes from the
// installed model, unchanged; test/render/skill-attack-mode.test.js covers the actor path for the unverified case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skillAttackMode } from '../../public/js/render/skillAttack.js';

const CANDIDATES = [
  ['char_102_texas', 0, 'skcom_charge_cost'],
  ['char_102_texas', 1, 'skchr_texas_2'],
  ['char_427_vigil', 0, 'skchr_vigil_1'],
  ['char_427_vigil', 1, 'skchr_vigil_2'],
  ['char_1023_ghost2', 0, 'skchr_ghost2_1'],
  ['char_1020_reed2', 1, 'skchr_reed2_2'],
  ['char_1014_nearl2', 1, 'skchr_nearl2_2'],
];

const mode = (id, slot, extra = {}) => skillAttackMode(null, { info: { spine: id }, skillIndex: slot, ...extra });

test('verified skills use the normal attack role, with and without an effects index', () => {
  for (const [id, slot] of CANDIDATES) {
    assert.deepEqual(mode(id, slot), { animKey: 'Attack' }, `${id} S${slot + 1}`);
    // a loaded index must not override the verified mapping
    const index = { units: { [id]: { kind: 'char', modes: [{ name: 'Empty' }, { name: 'S2', attack: { animKey: 'Skill_2' } }],
      skills: { test: { mode: 1 } } } } };
    assert.deepEqual(skillAttackMode(index, { info: { spine: id }, skillIndex: slot }), { animKey: 'Attack' },
      `${id} S${slot + 1} with an index`);
  }
});

test('a verified slot reads the DIY skill index, then info.skillIndex', () => {
  assert.deepEqual(skillAttackMode(null, { info: { spine: 'char_102_texas', diy: { charId: 'char_102_texas', skillIndex: 1 } } }),
    { animKey: 'Attack' });
  assert.deepEqual(skillAttackMode(null, { info: { spine: 'char_102_texas', skillIndex: 0 } }), { animKey: 'Attack' });
});

test('a different explicit plugin skill does not inherit an official slot mapping', () => {
  const rec = { skills: [{ index: 1, prefabId: 'plugin:custom_attack' }] };
  assert.equal(skillAttackMode(null, { info: { spine: 'char_102_texas' }, rec, skillIndex: 1 }), null);
  // the matching official prefab keeps the role even when it comes through the record
  const official = { skills: [{ index: 1, prefabId: 'skchr_texas_2' }] };
  assert.deepEqual(skillAttackMode(null, { info: { spine: 'char_102_texas' }, rec: official, skillIndex: 1 }),
    { animKey: 'Attack' });
});

test('unverified operators and slots keep their old behaviour', () => {
  assert.equal(skillAttackMode(null, { info: { spine: 'char_206_gnosis' }, skillIndex: 1 }), null);
  assert.equal(mode('char_102_texas', 2), null);
  assert.equal(mode('char_427_vigil', 2), null);
});
