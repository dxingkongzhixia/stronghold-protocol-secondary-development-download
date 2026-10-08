// test/render/enemy-move-clip.test.js — a walking enemy plays its Move/Run clip, not a standing pose (source report:
// the dark wolf 猎狗pro / “狗子”, a wolf-type enemy with a red device on its back, held the idle pose and slid while it
// walked). Its skeleton carries BOTH a `Move_*` and a `Run_*` set: the official battle prefab's `Graphic` anim key
// `Move` reads `Run_Loop`, while the skeleton's `Move_Loop` is a step-in-place standing pose (audited against all 242
// enemy prefabs, docs/history/0.2.0.md §25.14.1 "Found … not changed, for later"). The by-name resolver prefers `Move`
// over `Run`, so the manifest said `move: Move_Loop` and the hound slid on that near-idle pose; tools/assets/spine.mjs
// PREFAB_SPINE_ROLES now maps enemy_1000_gopro_2's move role to the Run set (data/assets.json rebuilt offline). Pinned
// here: the data, the SpineActor's base → clip mapping for a walking enemy, an ordinary walker and a flyer, and the
// UnitView sync path. Headless fake PIXI (test/render/fakepixi.js).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { ANIM } from '../../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const enemies = JSON.parse(readFileSync(path.join(ROOT, 'data/enemies.json'), 'utf8'));

const GOPRO = 'enemy_1000_gopro_2';   // 猎狗pro ("狗子"): the wolf on the Run set
const SLIME = 'enemy_1007_slime';     // 源石虫: an ordinary ground walker on its Move_* set
const BOMBD = 'enemy_1040_bombd';     // 暴鸰: a flying enemy on its Move_* set

let fake, SpineActor, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const entryOf = (id) => assets.enemies[id].spine;
const dataOf = (entry) => ({ animations: Object.keys(entry.animations).map((name) => ({ name })) });
function actor(id) {
  const a = new SpineActor(dataOf(entryOf(id)), entryOf(id));
  a.clipPerAttack = true;
  return a;
}

test('data: 猎狗pro moves on the Run set (not the skeleton\'s step-in-place Move_* clips); other walkers / flyers keep Move', () => {
  const hound = entryOf(GOPRO);
  assert.deepEqual(hound.anims.move, { begin: 'Run_Begin', loop: 'Run_Loop', end: 'Run_End' });
  for (const clip of ['Run_Begin', 'Run_Loop', 'Run_End']) assert.ok(Object.hasOwn(hound.animations, clip), `the skeleton has ${clip}`);
  assert.equal(entryOf(SLIME).anims.move.loop, 'Move_Loop', 'an ordinary walker keeps its Move clip');
  assert.equal(entryOf(BOMBD).anims.move.loop, 'Move_Loop', 'a flyer keeps its Move clip');
});

test('SpineActor: setBase(move) selects the walking enemy\'s move clip (Run for the hound), idle again on idle', () => {
  const hound = actor(GOPRO);
  assert.equal(hound.current, 'Idle', 'rests on Idle');
  hound.setBase('move');
  assert.equal(hound.current, 'Run_Loop', 'the hound runs (it used to hold the near-idle Move_Loop and slide)');
  hound.setBase('idle');
  assert.equal(hound.current, 'Idle', 'stops back on Idle');

  const slime = actor(SLIME);
  slime.setBase('move');
  assert.equal(slime.current, 'Move_Loop', 'an ordinary walker plays its Move clip');

  const bird = actor(BOMBD);
  bird.setBase('move');
  assert.equal(bird.current, 'Move_Loop', 'a flyer plays its own Move clip');
});

test('UnitView: a walking enemy and a flying one with anim MOVE select their own move clip through sync', async () => {
  const cam = () => presetCamera('normal', { width: 1280, height: 720 });
  const tick = () => new Promise((r) => setImmediate(r));
  const make = async (id) => {
    const entry = entryOf(id);
    const store = { picture: () => null, image: async () => null, spineEntry: () => entry, spine: { acquire: async () => dataOf(entry), release() {} } };
    const info = { id: 7, side: 'enemy', kind: 'enemy', defId: id, spine: id, tier: 1, x: 8, y: 9, maxHp: 1000, facing: -1, motion: enemies[id].stats.motion };
    const v = new UnitView(fakeViewCtx(fake.P, { assets: store, cam }), info);
    await tick(); await tick();
    assert.ok(v.actor, 'model built');
    return v;
  };
  const walk = { x: 8, y: 9, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: ANIM.MOVE, vx: 0.5 };

  const hound = await make(GOPRO);
  hound.sync(walk, 1);
  assert.equal(hound.actor.current, 'Run_Loop', 'the walking hound runs');

  const bird = await make(BOMBD);
  bird.sync(walk, 1);
  assert.equal(bird.actor.current, 'Move_Loop', 'the flying enemy keeps its own move clip');
});
