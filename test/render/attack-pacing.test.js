// test/render/attack-pacing.test.js — attack-clip pacing end to end (#729: the sim's own interval).
//
//   server/sim/snapshot.js   unitInfo   → UnitInfo.atkInterval (s.interval with its buffs)
//   server/sim/battle/*      ['rate', id, seconds] whenever that interval changes (once per change)
//   render/app/info.js       renderInfo keeps atkInterval (it drops unknown fields)
//   render/units.js          the view paces the clip over it; with a sim value a measured gap is ignored
//
// Headless fake PIXI on the real asset manifest (the same harness test/render/attack-rhythm.test.js uses).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { spineEntry, hasBackSpine } from '../../public/js/assets.js';
import { renderInfo } from '../../public/js/render/app/info.js';
import { unitInfo } from '../../server/sim/snapshot.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const GDGLOW = 'char_377_gdglow';

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const cam = () => presetCamera('normal', { width: 1280, height: 720 });

function store() {
  return {
    picture: () => null, image: async () => null,
    hasBack: (id) => hasBackSpine(assets, id),
    spineEntry: (id, o) => spineEntry(assets, id, o),
    spine: { acquire: async (entry) => ({ animations: Object.keys(entry.animations || {}).map((name) => ({ name })) }), release() {} },
  };
}

/** A view exactly as render/app.js builds it: renderInfo(UnitInfo) → new UnitView. */
async function view(infoLike) {
  const info = renderInfo({ id: 1, kind: 'op', side: 'ally', defId: GDGLOW, spine: GDGLOW, name: 'test', tier: 5,
    x: 5, y: 9, facing: 1, maxHp: 2657, dir: 'RIGHT', ...infoLike });
  assert.ok(info, 'renderInfo accepts the unit info');
  const v = new UnitView(fakeViewCtx(fake.P, { assets: store(), cam }), info);
  await tick(); await tick();
  return { v, info };
}

describe('the sim publishes the unit\'s own interval', () => {
  const battle = () => makeBattle({
    seed: 1, autoFinish: false, timeLimit: 30,
    units: [{ chessId: 'chess_char_5_15_b', skillIndex: 0, row: 10, col: 4 }],
    enemies: [{ key: 'enemy_still', route: { motion: 'WALK', start: [10, 6], end: [10, 6], checkpoints: [] } }],
    defs: { enemies: { enemy_still: enemyRec({ key: 'enemy_still', hp: 1e9, atk: 0, speed: 0, blockCnt: 0 }) } },
  });

  test('the spawn UnitInfo carries s.interval, and the value is not repeated as a rate event', () => {
    const h = battle();
    h.step();
    const u = h.unit('chess_char_5_15_b');
    const spawn = h.events.find((e) => e[0] === 'spawn' && e[1].id === u.id);
    assert.ok(spawn, 'the unit spawned');
    const want = Math.round(u.s.interval * 1000) / 1000;
    assert.equal(spawn[1].atkInterval, want, 'UnitInfo.atkInterval = the sim interval');
    assert.deepEqual(unitInfo(u).atkInterval, want);
    h.step();
    assert.deepEqual(h.events.filter((e) => e[0] === 'rate'), [], 'nothing changed: no rate tuple');
  });

  test('an attack-speed buff emits exactly one rate tuple, and only on the change', () => {
    const h = battle();
    h.step();
    const u = h.unit('chess_char_5_15_b');
    const before = u.s.interval;
    h.b.addBuff(u, { key: 'test:aspd', mods: { aspd: 60 } });
    h.step();
    const rates = h.events.filter((e) => e[0] === 'rate' && e[1] === u.id);
    assert.equal(rates.length, 1, 'one tuple for one change');
    assert.ok(u.s.interval < before, 'the buff really shortened the interval');
    assert.ok(Math.abs(rates[0][2] - u.s.interval) < 0.002, `${rates[0][2]} vs ${u.s.interval}`);
    h.step(3);
    assert.equal(h.events.filter((e) => e[0] === 'rate').length, 1, 'the same value is never re-sent');
    h.b.addBuff(u, { key: 'test:aspd2', mods: { aspd: 30 } });
    h.step();
    assert.equal(h.events.filter((e) => e[0] === 'rate').length, 2, 'a second change is not swallowed');
  });

  test('a dead or undeployed unit is not paced', () => {
    const h = battle();
    h.step();
    const u = h.unit('chess_char_5_15_b');
    h.b.addBuff(u, { key: 'test:aspd', mods: { aspd: 60 } });
    u.alive = false;
    h.step();
    assert.deepEqual(h.events.filter((e) => e[0] === 'rate'), [], 'no rate tuple for a unit off the field');
  });
});

describe('the view paces its clip over the sim value', () => {
  test('renderInfo keeps UnitInfo.atkInterval (it drops unknown fields)', async () => {
    const { info } = await view({ atkInterval: 2.25 });
    assert.equal(info.atkInterval, 2.25);
    const { info: dropped } = await view({ atkInterval: 0 });
    assert.equal(dropped.atkInterval, undefined, 'a non-positive value is not a duration');
  });

  test('a sim value is adopted as-is, and a measured gap no longer moves it', async () => {
    const { v } = await view({ atkInterval: 2.5 });
    assert.equal(v.atkInterval, 2.5);
    assert.equal(v.atkKnown, true);
    v.onAttack(null, 1, 'normal');
    // a 4 s pause (a stun, a redeploy) must not be taken as a 4 s attack rhythm
    v.onAttack(null, 5, 'normal');
    assert.equal(v.atkInterval, 2.5);
    v.onAttack(null, 5.9, 'normal');
    assert.equal(v.atkInterval, 2.5, 'even a small gap is not layered on a known value');
  });

  test('a rate event re-paces the clip at once', async () => {
    const { v } = await view({ atkInterval: 2.5 });
    v.setAtkInterval(0.8);
    assert.equal(v.atkInterval, 0.8);
    assert.equal(v.actor.interval, 0.8, 'the actor\'s fallback interval follows');
    v.onAttack(null, 1, 'normal');
    v.onAttack(null, 5, 'normal');
    assert.equal(v.atkInterval, 0.8, 'the sim still owns the rhythm');
    v.setAtkInterval(0);
    assert.equal(v.atkInterval, 0.8, 'a broken value is ignored');
  });

  test('without a sim value the old measuring path still applies', async () => {
    const { v } = await view({});
    assert.equal(v.atkKnown, false);
    const guess = v.atkInterval;
    assert.ok(guess > 0);
    v.onAttack(null, 1, 'normal');
    v.onAttack(null, 1.35, 'normal');   // a real gap: replaces the guess outright
    assert.ok(Math.abs(v.atkInterval - 0.35) < 1e-9, `measured ${v.atkInterval}`);
  });

  test('a respawn re-seeds the pacing from the new spawn info (重生 / a second life)', async () => {
    const { v } = await view({ atkInterval: 2.5 });
    v.setAtkInterval(0.5);
    v.respawn({ atkInterval: 1.75 });
    assert.equal(v.atkInterval, 1.75);
    assert.equal(v.atkKnown, true);
    assert.equal(v.lastAtk, -1, 'the previous life\'s rhythm is forgotten');
  });
});
