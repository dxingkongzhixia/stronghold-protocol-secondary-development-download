// test/render/local-spine-roles.test.js — a version-only operator's Spine model comes from the local client
// (spine/char/<id>), so data/assets.json never had its charpack role table. render/spineRoles.js resolves the roles from
// the parsed skeleton and its OnAttack events (the same by-name rules as the web models), and skillAttack.js reads the
// official mode's attack clip for that model (skill mode table from the extracted fx index). No extracted files: the
// fixtures are small synthetic skeletons and an index-shaped record.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { localSpineRoles, spineTiming } from '../../public/js/render/spineRoles.js';
import { skillAttackMode } from '../../public/js/render/skillAttack.js';

const skeleton = () => ({
  animations: [
    { name: 'Default', duration: 0, timelines: [] },
    { name: 'Idle', duration: 2, timelines: [] },
    { name: 'Start', duration: 1, timelines: [] },
    { name: 'Attack', duration: 1, timelines: [{ events: [{ time: 0.4, data: { name: 'OnAttack' } }] }] },
    { name: 'Attack_2', duration: 0.9, timelines: [{ events: [{ time: 0.3, data: { name: 'OnAttack' } }, { time: 0.6, data: { name: 'OnAttack' } }] }] },
    { name: 'Skill_2_Begin', duration: 0.4, timelines: [] },
    { name: 'Skill_2_Loop', duration: 1.2, timelines: [{ events: [{ time: 0.2, data: { name: 'OnAttack' } }] }] },
    { name: 'Skill_2_End', duration: 0.3, timelines: [] },
    { name: 'Die', duration: 1, timelines: [] },
  ],
});

describe('a local-client operator skeleton', () => {
  test('roles come from its own clip names: idle / start / the Attack triple / each skill family', () => {
    const r = localSpineRoles(skeleton());
    assert.equal(r.anims.idle, 'Idle');
    assert.equal(r.anims.deploy, 'Start');
    assert.deepEqual(r.anims.attack, { begin: null, loop: 'Attack', end: null });
    assert.equal(r.anims.die, 'Die');
    // slot index 1 (S2) finds Skill_2_Begin / Skill_2_Loop / Skill_2_End
    assert.equal(r.anims.skills['1'].begin, 'Skill_2_Begin');
    assert.equal(r.anims.skills['1'].loop, 'Skill_2_Loop');
    assert.equal(r.anims.skills['1'].end, 'Skill_2_End');
    // durations for spine.js dur()
    assert.equal(r.animations.Attack, 1);
  });

  test('OnAttack event times are the strike frames (entry.hits; spine.js _hitTime)', () => {
    const { hits } = localSpineRoles(skeleton());
    assert.deepEqual(hits.Attack, [0.4]);
    assert.deepEqual(hits.Attack_2, [0.3, 0.6]);
    assert.deepEqual(hits.Skill_2_Loop, [0.2]);
    assert.equal(hits.Idle, undefined);
    assert.deepEqual(spineTiming(skeleton()).animations, {
      Default: 0, Idle: 2, Start: 1, Attack: 1, Attack_2: 0.9, Skill_2_Begin: 0.4, Skill_2_Loop: 1.2, Skill_2_End: 0.3, Die: 1,
    });
  });

  test('the result is cached per parsed skeleton, and a skeleton without animations resolves to null', () => {
    const data = skeleton();
    assert.equal(localSpineRoles(data), localSpineRoles(data));
    assert.equal(localSpineRoles({ animations: [] }), null);
    assert.equal(localSpineRoles(null), null);
  });
});

describe('a local-client operator under a skill', () => {
  const index = () => ({
    units: {
      char_194_leto: {
        kind: 'char',
        modes: [
          { name: 'Default', attack: { animKey: 'Attack' } },
          { name: 'S2', attack: { animKey: 'Skill_2' } },
        ],
        skills: { skchr_leto_2: { mode: 1 } },
      },
      char_4244_tocka: {
        kind: 'char',
        modes: [{ name: 'Default', attack: { animKey: '' } }],
        skills: { skchr_tocka_3: { mode: 0 } },
      },
    },
  });

  test("the skill mode's official attack clip is played (the charpack animKey)", () => {
    const mode = skillAttackMode(index(), { info: { spine: 'char_194_leto' }, skillIndex: 1, localModel: true });
    assert.deepEqual(mode, { animKey: 'Skill_2' });
  });

  test('an empty animKey (the official attack animator) shows the normal attack', () => {
    const mode = skillAttackMode(index(), { info: { spine: 'char_4244_tocka' }, skillIndex: 2, localModel: true });
    assert.deepEqual(mode, { animKey: 'Attack' });
  });

  test('a web model of the same roster keeps the verified-only rule (no local-model shortcut)', () => {
    const mode = skillAttackMode(index(), { info: { spine: 'char_194_leto' }, skillIndex: 1 });
    assert.deepEqual(mode, { preserve: true });
  });
});
