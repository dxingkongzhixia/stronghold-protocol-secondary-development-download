// The plugin player hands prefab effects on their owner to the wiring, so a plugin FollowMountPoint rides the live
// bone; target/point effects keep the player's own placement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PluginFxPlayer } from '../../public/js/render/vfx/pluginPlayer.js';

test('owned plugin prefabs go through the wiring; point effects keep the player placement', () => {
  const calls = [];
  const killed = [];
  const wiring = { idx: { units: {} }, playOn(key, owner, opts) {
    calls.push({ key, owner, opts }); return { kill: () => killed.push(key) };
  } };
  const spawned = [];
  const ofx = { active: true, spawn: (...args) => { spawned.push(args); return { kill() {} }; }, lib: {} };
  const fx = new PluginFxPlayer({ P: {}, layer: {}, assets: { manifest: { fx: {} } }, cam: () => ({ project: () => ({}) }),
    enabled: () => true, record: () => null, speed: () => 1, ofx, wiring });
  fx.source = fx.assets.manifest.fx;
  fx.catalog = { books: new Map(), descriptors: new Map([['plugin:fx-demo:spark', {}]]), bindings: {} };
  const owner = { x: 1, y: 2, z: 0, alive: true };
  const h = fx.play('plugin:fx-demo:spark', owner, { owner, loop: true });
  assert.ok(h?.wired);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, 'plugin:fx-demo:spark');
  assert.equal(calls[0].opts.follow, true);
  assert.equal(spawned.length, 0, 'the wiring, not a second spawn');
  h.stop();
  assert.deepEqual(killed, ['plugin:fx-demo:spark']);

  const target = { x: 5, y: 6, z: 0, alive: true };
  const p = fx.play('plugin:fx-demo:spark', target, { owner, loop: true });
  assert.ok(!p.wired);
  assert.equal(spawned.length, 1, 'a hit / target effect stays at its named point');
  p.stop();
});
