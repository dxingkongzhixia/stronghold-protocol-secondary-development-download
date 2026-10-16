// test/render/attack-rhythm.test.js — the rhythm wind-up (render/units.js `_predictWindUp`, owner 2026-10-16): the
// 'atk' event reaches the renderer only ~0.1–0.2 game s ahead (render/interp.js delay), shorter than an operator's
// wind-up clip (澄闪's Attack_Start is 0.167 clip s at ~0.17 game s; the sequence's strike is 0.6 game s after its
// start), so a unit attacking on its rhythm starts its sequence early — the wind-up `begin` then plays before the strike.
// The real 'atk' re-phases the SAME sequence (SpineActor.attack), so the drawn strike still lands with the damage.
//
// 澄闪 (char_377_gdglow): anims.attack = { begin: 'Attack_Start', loop: 'Attack', end: 'Attack_End' }
// (tools/assets/spine.mjs PREFAB_SPINE_ROLES, the client prefab's own table). Headless fake PIXI on the real manifest.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { spineEntry, hasBackSpine } from '../../public/js/assets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const GDGLOW = 'char_377_gdglow';   // her attack IS the begin → loop → end sequence
const AMGOAT = 'char_180_amgoat';   // a plain `Attack`, no begin — nothing to predict

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
function store() {
  const s = {
    picture: () => null, image: async () => null,
    hasBack: (id) => hasBackSpine(assets, id),
    spineEntry: (id, o) => spineEntry(assets, id, o),
    spine: { acquire: async (entry) => ({ animations: Object.keys(entry.animations || {}).map((name) => ({ name })) }), release() {} },
  };
  return s;
}
async function op(id) {
  const ctx = fakeViewCtx(fake.P, { assets: store(), cam });
  const v = new UnitView(ctx, { id: 1, side: 'ally', kind: 'op', defId: id, spine: id, tier: 5, x: 5, y: 9, maxHp: 2657, dir: 'RIGHT' });
  await tick(); await tick();
  assert.ok(v.actor, 'Spine model built');
  return v;
}
const SAMPLE = { x: 5, y: 9, z: 0, hp: 2657, maxHp: 2657, sp: 0, spMax: 1, flags: 0, anim: 0 };
/** Advance `s` game seconds, syncing the sample (setting gameT) and updating each frame like render/app.js does. */
function run(v, seconds, t0 = 0) {
  const dt = 1 / 60;
  for (let t = t0; t < t0 + seconds - 1e-9; t += dt) {
    v.sync(SAMPLE, t + dt);
    v.update(dt, cam(), t);
  }
}

describe('the rhythm wind-up (render/units.js _predictWindUp)', () => {
  test('澄闪\'s attack clip really is the begin → loop → end sequence', () => {
    const at = assets.chars[GDGLOW].spine.front.anims.attack;
    assert.deepEqual(at, { begin: 'Attack_Start', loop: 'Attack', end: 'Attack_End' });
  });

  test('attackAhead reports the sequence and its speed only when there is a wind-up to show', async () => {
    const v = await op(GDGLOW);
    const seq = v.actor.attackAhead(1.5);
    assert.ok(seq && seq.bd > 0, 'the begin');
    // seqDur = 0.167 + 1.3 = 1.467, strikeSeq = 0.167 + 0.433 = 0.6; 1.5 s interval ⇒ ts 1 (clipPerAttack, room)
    assert.ok(Math.abs(seq.seqDur - 1.467) < 1e-6, `seqDur ${seq.seqDur}`);
    assert.ok(Math.abs(seq.strikeSeq - 0.6) < 1e-6, `strikeSeq ${seq.strikeSeq}`);
    assert.equal(seq.ts, 1);
    const plain = await op(AMGOAT);
    assert.equal(plain.actor.attackAhead(1.5), null, 'no begin ⇒ nothing to predict');
  });

  test('a rhythmically attacking unit starts its wind-up begin early; the real atk does not restart it', async () => {
    const v = await op(GDGLOW);
    v.lastAtk = 0; v.atkInterval = 1.5;
    // the predicted strike is 1.5, the sequence must start 0.6 game s before it (strikeSeq / ts) ⇒ 0.9
    run(v, 0.85);                                     // before the start: still resting
    assert.notEqual(v.actor.mode, 'attack', 'not wound up yet');
    run(v, 0.1, 0.85);                                // passes 0.9: the wind-up begins
    assert.equal(v.actor.mode, 'attack', 'the wind-up started from the rhythm');
    assert.equal(v.actor.current, 'Attack_Start', 'the wind-up BEGIN is what plays');
    assert.equal(v.actor.wound, true, 'and it is a wind-up (the strike is still ahead)');
    // the real 'atk' lands at the predicted strike: it re-phases this same sequence (no restart, no second wind-up)
    const before = v.actor.current;
    v.onAttack(null, 1.5, 'arrow');
    assert.equal(v.actor.mode, 'attack', 'still the same attack');
    assert.equal(v.actor.current, before, 'the clip is not restarted');
    assert.equal(v.actor.wound, false, 'the strike has landed (attack() consumed the wind-up)');
  });

  test('a stale rhythm stops predicting (a unit that stopped attacking does not keep winding up)', async () => {
    const v = await op(GDGLOW);
    v.lastAtk = 0; v.atkInterval = 1.5;
    run(v, 0.85);                                     // reaches the start window
    v.lastAtk = -5;                                   // the rhythm went stale
    const t = 0.85;
    v.sync(SAMPLE, t + 0.2);
    v.update(1 / 60, cam(), t);
    assert.notEqual(v.actor.mode, 'attack', 'no wind-up from a stale rhythm');
  });

  test('a unit whose attack has no begin never winds up from the rhythm', async () => {
    const v = await op(AMGOAT);
    v.lastAtk = 0; v.atkInterval = 1.5;
    run(v, 1.4);
    assert.notEqual(v.actor.mode, 'attack', 'nothing to predict without a begin');
  });
});
