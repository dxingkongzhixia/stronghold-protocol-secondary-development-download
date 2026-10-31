// test/keel/native-browser.test.js — the client Keel runtime attaches to a Battle hook bus and drives a native module
// with the same seeds as the server. (The browser imports the same code from /js/battle/keelAttach.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachBattleKeel } from '../../public/js/battle/keelAttach.js';
import { createRng, deriveSeed } from '../../server/sim/rng.js';

/** The tiniest Battle the attach needs: a hook bus, a seed and a clock. */
function battleStub() {
  const hooks = {};
  return {
    seed: 42,
    time: 0,
    units: [],
    on(name, fn, { owner } = {}) { (hooks[name] ??= []).push({ fn, owner }); return { name, fn }; },
    offOwner(owner) { for (const k of Object.keys(hooks)) hooks[k] = hooks[k].filter((h) => h.owner !== owner); },
    emit(name, ctx = {}) { for (const h of hooks[name] ?? []) h.fn(ctx); },
  };
}

const moduleCode = {
  setup({ api }) { api.state.patch({ ticks: 0 }); },
  hooks: {
    'sim.tick'(_ctx, api) { api.state.patch({ ticks: api.state.get().ticks + 1 }); },
  },
};

test('a native sim module attaches to a browser battle and ticks with the runtime', () => {
  const battle = battleStub();
  const handle = attachBattleKeel(battle, {
    manifest: { manifest: 3, id: 'browser-demo', version: '1.0.0' },
    modules: [{ kind: 'sim', entry: 'sim/index.js', code: moduleCode }],
    rng: createRng,
    deriveSeed,
  });
  battle.emit('battleStart');
  battle.emit('tick', { dt: 1 / 30 });
  battle.emit('tick', { dt: 1 / 30 });
  const snap = handle.snapshot();
  assert.equal(snap.state['browser-demo:sim:sim/index.js'].value.ticks, 2);
  assert.equal(battle.keel, handle.runtime, 'the live runtime is exposed for diagnostics');
  assert.deepEqual(handle.runtime.errors, []);
  handle.detach();
  battle.emit('tick', { dt: 1 / 30 });
  assert.equal(handle.snapshot().state['browser-demo:sim:sim/index.js'].value.ticks, 2, 'detached: no more ticks');
});

test('a battle carries every native plugin runtime (keelAll) and the last one on keel', () => {
  const battle = battleStub();
  const a = attachBattleKeel(battle, {
    manifest: { manifest: 3, id: 'plugin-a', version: '1.0.0' },
    modules: [{ kind: 'sim', entry: 'sim/index.js', code: moduleCode }],
    rng: createRng,
    deriveSeed,
  });
  const b = attachBattleKeel(battle, {
    manifest: { manifest: 3, id: 'plugin-b', version: '1.0.0' },
    modules: [{ kind: 'sim', entry: 'sim/index.js', code: moduleCode }],
    rng: createRng,
    deriveSeed,
  });
  battle.emit('tick', { dt: 1 / 30 });
  battle.emit('tick', { dt: 1 / 30 });
  assert.equal(battle.keelAll.length, 2, 'both runtimes are kept');
  assert.equal(battle.keelAll[0], a.runtime);
  assert.equal(battle.keelAll[1], b.runtime);
  assert.equal(battle.keel, b.runtime, 'the last attach stays on the one-plugin hook');
  assert.equal(a.snapshot().state['plugin-a:sim:sim/index.js'].value.ticks, 2);
  assert.equal(b.snapshot().state['plugin-b:sim:sim/index.js'].value.ticks, 2);
  a.detach();
  battle.emit('tick', { dt: 1 / 30 });
  assert.equal(a.snapshot().state['plugin-a:sim:sim/index.js'].value.ticks, 2);
  assert.equal(b.snapshot().state['plugin-b:sim:sim/index.js'].value.ticks, 3);
  b.detach();
});
