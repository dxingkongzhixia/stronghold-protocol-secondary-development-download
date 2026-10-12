// test/render/token-wang-stone.test.js — 望's 棋子 (token_10064_wang_stone1, docs/MATCHMAKING.md §30): the piece is a
// 装置 trap with NO normal attack (content/tokens.js wangStone `noAttack`, the official prefab's Default mode has no
// attack component). Its official model (tools/local-extract/extract.py TOKEN_SPINES → data/assets.json
// tokens[id].spineLocal) carries Start (born) / Idle / Attack / Default — the Attack clip is its TRIGGER (its OnAttack
// frame at 0.167 s is the blast), there is no Die clip. The client must draw that model (not the avatar diamond), play
// Start on deploy, Idle while armed, and — when the piece is used up by its trigger (sim fx `champagneBomb`,
// consumed: true) — play the Attack clip as its end (render/ahead: UnitView.consume → SpineActor.trigger → die lets it
// play out) instead of holding the idle. Headless (test/render/fakepixi.js).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
/** The per-machine manifest (data/local-assets.json); null in a fresh clone without the extraction. */
const local = (() => { try { return JSON.parse(readFileSync(path.join(ROOT, 'data/local-assets.json'), 'utf8')); } catch { return null; } })();
const PIECE = 'token_10064_wang_stone1';

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const cam = () => presetCamera('normal', { width: 1280, height: 720 });

/** Asset store stub handing the token's local Spine entry (as assets.js spineEntry does once local() listed it). */
function store() {
  const entry = assets.tokens[PIECE].spineLocal;
  const names = Object.keys(entry.animations || {});
  return {
    picture: () => null, image: async () => null,
    spineEntry: () => entry,
    spine: { acquire: async () => ({ animations: names.map((name) => ({ name })) }), release() {} },
  };
}

const view = () => new UnitView(fakeViewCtx(fake.P, { assets: store(), cam }),
  { id: 1, side: 'ally', kind: 'token', defId: PIECE, spine: PIECE, x: 5, y: 10, maxHp: 1000 });

describe('望 棋子 (token_10064_wang_stone1): the official model and its clips', () => {
  test('the manifest registers the local model with Start/Idle/Attack and no Die', () => {
    const sl = assets.tokens[PIECE].spineLocal;
    assert.equal(sl.group, `spine/token/${PIECE}`);
    assert.deepEqual([sl.anims.idle, sl.anims.deploy, sl.anims.attack.loop, sl.anims.die], ['Idle', 'Start', 'Attack', null]);
    for (const name of ['Idle', 'Start', 'Attack']) assert.ok(name in sl.animations, `clip ${name}`);
    assert.equal(sl.hits.Attack[0], 0.167, 'the Attack clip, its OnAttack frame');
    // the client draws it only when data/local-assets.json lists every one of its files (skip without the extraction)
    if (local) {
      const g = local.groups[sl.group];
      for (const f of [sl.skel, sl.atlas, ...sl.textures]) assert.ok(g[f], `local-assets ${f}`);
    }
  });

  test('deploy plays Start; the armed piece rests on Idle; the consumable trigger plays Attack (not the idle)', async () => {
    const v = view();
    await tick(); await tick();
    assert.ok(v.actor && v.spineReady, 'the official Spine model, not the fallback diamond');
    assert.equal(v.actor.current, 'Idle', 'armed idle');
    v.onDeploy();
    assert.equal(v.actor.current, 'Start', 'born clip');
    for (let i = 0; i < 40; i++) v.update(1 / 60, cam(), i / 60);   // Start is 0.333 s
    assert.equal(v.actor.current, 'Idle', 'back to the armed idle');
  });

  test('the consumed trigger (champagneBomb, consumed: true) plays the Attack clip; die() lets it play out', async () => {
    const v = view();
    await tick(); await tick();
    assert.ok(v.consume(), 'the piece has a trigger clip');
    assert.equal(v.actor.current, 'Attack', 'the trigger/explosion clip');
    v.die();                                   // the sim's 'die' of the same frame (retreat, reason 'expired')
    assert.equal(v.actor.current, 'Attack', 'the trigger clip is not cut short with the idle (no Die clip to hold)');
    assert.ok(v.dying > 0.8, `the view fades after the clip (${v.dying})`);
  });
});
