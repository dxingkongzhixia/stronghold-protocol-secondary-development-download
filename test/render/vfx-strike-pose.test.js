// test/render/vfx-strike-pose.test.js — the attack clip's strike frame (SpineActor.strikePose), the half
// render/units.js `UnitView.boneOffset(names, out, true)` reads through bonePose so a shot leaves the weapon where the
// attack clip fires it, whatever frame the model was last posed in (DESIGN §33.11, §32.14.36). Before this the method
// was missing: `typeof a.strikePose === 'function'` was never true, so every shot left at the pose as drawn. Headless
// fake PIXI (test/render/fakepixi.js).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi } from './fakepixi.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const JSHOOT = 'enemy_1019_jshoot';   // 隐形弩手: Attack 1.0 s, strike at 0.533 s; attacks every 2.7 s

let fake, SpineActor;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
});
after(() => fake.restore());

const entryOf = (id) => assets.enemies[id].spine;
const dataOf = (entry) => ({ animations: Object.keys(entry.animations).map((name) => ({ name })) });
function actor() {
  const entry = entryOf(JSHOOT);
  const a = new SpineActor(dataOf(entry), entry);
  a.clipPerAttack = true;
  a.setBase('move');
  return a;
}
const run = (a, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };

test('strikePose: the attack clip and its first hit while an attack plays; null when resting', () => {
  const a = actor();
  assert.equal(a.strikePose(), null, 'resting: no strike frame (the caller reads the pose as drawn)');
  assert.ok(a.windUp(2.7, 0.2), 'winds up 0.2 s before the strike');
  const p = a.strikePose();
  assert.ok(p, 'a wound-up attack holds its strike frame whatever the model is posed at now');
  assert.equal(p.time, 0.533, "the manifest's OnAttack of the Attack clip");
  assert.ok(p.anim && typeof p.anim === 'object', 'the clip in force');
  run(a, 0.2);
  a.attack(2.7);
  assert.equal(a.strikePose().time, 0.533, 'still the same strike frame past the strike');
  run(a, 0.6);   // the clip plays out and the base clip returns
  assert.equal(a.strikePose(), null, 'the resting clip has no strike');
});

test('strikePose: a skill running its own attack loop reads that loop\'s hit; a dead model holds none', () => {
  const a = actor();
  a.setSkill(true);
  a.attack(2.7);   // a skill attack plays the skill's clip
  const p = a.strikePose();
  assert.ok(p, 'the skill attack has a strike frame');
  assert.equal(p.time, 0.533, 'the Attack clip the skill reuses in this entry');
  a.die();
  assert.equal(a.strikePose(), null, 'a dead model has no strike frame');
});
