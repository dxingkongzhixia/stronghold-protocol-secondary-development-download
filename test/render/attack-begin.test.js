// test/render/attack-begin.test.js — the attack sequence of a clip whose wind-up is its own `begin` clip
// (`anims.attack = { begin, loop, end }`): one attack is begin → loop (the strike at the manifest's OnAttack) → end.
// 澄闪's official prefab maps Attack_Start → Attack → Attack_End (tools/assets/spine.mjs PREFAB_SPINE_ROLES).
//
// The sequence is expressed in SEQUENCE seconds: `seqDur = beginDur + loopDur`, `strikeSeq = beginDur + hit`. A wind-up
// longer than the begin's start starts the begin (`_playAttackAt`); a shorter one starts inside the loop, the begin
// skipped (the old behaviour); a model without a begin keeps every formula identical (seqDur === loopDur).
// Headless fake PIXI (test/render/fakepixi.js), like feedback2-enemy-attack-clip.test.js.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi } from './fakepixi.js';
import { SpineActor } from '../../public/js/render/spine.js';

let fake;
before(() => { fake = installFakePixi(); });
after(() => fake.restore());

/** An entry whose attack is the begin → loop → end sequence (durations the fake skeleton answers for). */
function actor(withBegin = true) {
  const entry = {
    animations: { Idle: 1, Attack_Start: 0.3, Attack: 1.0, Attack_End: 0.3, Die: 1 },
    hits: { Attack: [0.5] },
    anims: {
      idle: 'Idle', deploy: 'Idle', die: 'Die', move: null, stun: null,
      attack: { begin: withBegin ? 'Attack_Start' : null, loop: 'Attack', end: 'Attack_End' },
    },
  };
  const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
  a.clipPerAttack = true;   // as units.js sets it for every battle unit
  a.setBase('idle');
  return a;
}

test('a long look-ahead starts the wind-up begin; a short one starts inside the loop (the begin skipped)', () => {
  const a = actor();
  // seqDur = 0.3 + 1.0 = 1.3, strikeSeq = 0.3 + 0.5 = 0.8; lead 0.8 ⇒ sequence offset 0 ⇒ the begin plays
  assert.ok(a.windUp(2, 0.8), 'winds up');
  assert.equal(a.current, 'Attack_Start', 'the begin is the clip that starts');
  assert.equal(a.wound, true);
  // a short look-ahead (0.2 s): the sequence would have to start 0.67 s in ⇒ the loop, skipped begin (old behaviour)
  const b = actor();
  assert.ok(b.windUp(2, 0.2), 'winds up');
  assert.equal(b.current, 'Attack', 'a look-ahead shorter than the begin starts inside the loop');
});

test('an attack nobody wound up plays the whole sequence when the rhythm leaves room, else its strike frame', () => {
  // interval 2 s ≥ seqDur 1.3 ⇒ the clip plays complete from its wind-up (the begin included)
  const a = actor();
  a.attack(2);
  assert.equal(a.current, 'Attack_Start', 'the whole sequence plays from its wind-up');
  // interval 0.5 s < seqDur ⇒ the strike frame now (the begin does not fit)
  const b = actor();
  b.attack(0.5);
  assert.equal(b.current, 'Attack', 'a late attack starts at the strike frame');
});

test('a one-off trigger plays the whole sequence and reports its length', () => {
  const a = actor();
  assert.ok(Math.abs(a.trigger() - 1.3) < 1e-9, 'begin + loop');
  assert.equal(a.current, 'Attack_Start');
});

test('a model without a begin is untouched (seqDur === loopDur, the wind-up starts in the loop)', () => {
  const a = actor(false);
  assert.ok(a.windUp(2, 0.2));
  assert.equal(a.current, 'Attack');
  const b = actor(false);
  b.trigger();
  assert.ok(Math.abs(b.attackUntil - b.clock) > 0.9, 'the loop alone');
});
