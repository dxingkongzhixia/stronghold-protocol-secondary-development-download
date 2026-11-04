// An enemy's attack wind-up faces its target when the clip starts (上游 #869): display only.
//
// An enemy blocked again from behind pre-played its Attack clip facing its old walk until the attack event turned it.
// `windUp` now applies onAttack's rule the moment the clip starts (|dx| > 0.1; an operator keeps its deploy direction).
// Headless fake PIXI (test/render/fakepixi.js); the clip's hit is the shield defender's Attack hit so a 0.2 s lead
// starts it.
//
//   node --test test/render/windup-facing.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const cam = () => presetCamera('prep', { width: 1280, height: 720 });

function store() {
  const entry = {
    skel: '/s/front.skel', atlas: '/s/front.atlas',
    anims: { idle: 'Idle', attack: { loop: 'Attack' }, move: { loop: 'Move' }, die: 'Die' },
    animations: { Idle: 2, Attack: 1, Move: 1, Die: 0.9 }, hits: { Attack: [0.467] },
  };
  return {
    picture: () => null, image: async () => null, hasBack: () => false,
    spineEntry: () => entry,
    spine: { acquire: async () => ({ animations: [{ name: 'Idle' }, { name: 'Attack' }, { name: 'Move' }, { name: 'Die' }] }), release() {} },
  };
}

async function unit(info) {
  const ctx = fakeViewCtx(fake.P, { assets: store(), cam });
  const v = new UnitView(ctx, {
    id: 1, side: 'enemy', kind: 'enemy', defId: 'enemy_1006_shield', x: 5, y: 12, maxHp: 100, ...info,
  });
  await tick(); await tick();
  assert.ok(v.spineReady && v.actor, 'spine actor built');
  return v;
}

const stand = (x, vx = 0) => ({ x, y: 12, hp: 100, maxHp: 100, sp: 0, spMax: 0, flags: 0, anim: vx ? 1 : 0, vx });

test('an enemy winding up at a blocker behind it faces it as the clip starts, and the strike keeps the turn', async () => {
  const v = await unit({});
  v.sync(stand(5, -1.2));
  assert.equal(v.visFacing, -1, 'walking left');
  const behind = { x: 8, y: 12 };
  assert.equal(v.windUp(0.2, 'none', behind), true, 'the clip starts 0.2 s ahead of the strike');
  assert.equal(v.actor.current, 'Attack');
  assert.equal(v.visFacing, 1, 'faces the blocker on its right as the wind-up starts');
  v.sync(stand(5, 0));
  assert.equal(v.visFacing, 1, 'a block freezes vx, so the wind-up facing stays until the strike');
  v.onAttack(behind, 1.433, 'none');
  assert.equal(v.visFacing, 1, 'the strike uses the same rule');
});

test('the other way, a target within 0.1 tile and a missing target leave the old facing', async () => {
  const left = await unit({ x: 16 });
  left.sync(stand(16, 1.2));
  assert.equal(left.visFacing, 1, 'walking right');
  assert.equal(left.windUp(0.2, 'none', { x: 13, y: 12 }), true);
  assert.equal(left.visFacing, -1, 'a smaller display x is to the left');

  const near = await unit({});
  near.sync(stand(5, -1));
  assert.equal(near.windUp(0.2, 'none', { x: near.x + 0.05, y: 12 }), true);
  assert.equal(near.visFacing, -1, 'straight ahead: onAttack does not turn either');

  const none = await unit({});
  none.sync(stand(5, -1));
  assert.equal(none.windUp(0.2, 'none', null), true);
  assert.equal(none.visFacing, -1, 'no target: stay as the walk left it');
});

test('an operator keeps its deploy direction', async () => {
  const op = await unit({ side: 'ally', kind: 'chess', defId: 'char_x', dir: 'LEFT', facing: -1 });
  assert.equal(op.isEnemy, false);
  assert.equal(op.visFacing, -1);
  assert.equal(op.windUp(0.2, 'none', { x: 9, y: 12 }), true);
  assert.equal(op.actor.current, 'Attack');
  assert.equal(op.visFacing, -1, 'operators keep their deploy direction');
});
