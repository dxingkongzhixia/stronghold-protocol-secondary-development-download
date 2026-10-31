// test/keel/e2e-replay.test.js — determinism, reconnect and the KEEL=0 baseline on a real match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { makeMatch } from '../match/harness.js';

const manifest = () => ({
  manifest: 3, id: 'demo', name: 'Demo', version: '1.0.0', app: '*',
  api: { sim: 1 }, scope: ['room'], trust: 'sandbox',
  modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.read', 'sim.rng'] }],
  state: { version: 1 },
});

const descriptor = () => ({
  plugins: [{
    id: 'demo',
    manifest: manifest(),
    modules: [{
      kind: 'sim', entry: 'sim/index.js', permissions: ['sim.read', 'sim.rng'],
      code: {
        setup({ api }) { api.state.patch({ ticks: 0, rolls: [] }); },
        hooks: {
          'sim.tick'(_ctx, api) {
            const s = api.state.get();
            const roll = api.rng('crit').next();
            api.state.patch({ ticks: s.ticks + 1, rolls: [...s.rolls, roll].slice(-20) });
          },
        },
      },
    }],
  }],
});

function runOnce(seed, keel = true) {
  const h = makeMatch({ keel: keel ? descriptor() : null, humans: 1, seed, captureFrames: false });
  h.start();
  h.drive(() => h.m.fields?.some((f) => f.battle) || h.m.phase === PHASE.COMBAT);
  const battle = h.m.fields.find((f) => f.battle)?.battle;
  assert.ok(battle, 'battle exists');
  for (let i = 0; i < 20 && !battle.finished; i++) battle.step();
  return { h, battle, handle: battle.keel?.[0] ?? null };
}

test('two real matches with the same seed and module produce the same Keel hash', () => {
  const old = process.env.KEEL;
  process.env.KEEL = '1';
  try {
    const a = runOnce(77);
    const b = runOnce(77);
    assert.ok(a.handle && b.handle);
    assert.equal(a.handle.runtime.hash(), b.handle.runtime.hash());
    assert.deepEqual(a.handle.runtime.snapshot().state, b.handle.runtime.snapshot().state);
    const state = Object.values(a.handle.runtime.snapshot().state)[0].value;
    assert.ok(state.ticks > 0);
    assert.equal(state.rolls.length, 20);
  } finally {
    if (old === undefined) delete process.env.KEEL; else process.env.KEEL = old;
  }
});

test('reconnect does not rebuild the battle or change the Keel hash', () => {
  const old = process.env.KEEL;
  process.env.KEEL = '1';
  try {
    const { h, battle, handle } = runOnce(9);
    const before = handle.runtime.hash();
    h.m.onReconnect('p_0');
    assert.equal(h.m.fields.find((f) => f.battle).battle, battle);
    assert.equal(handle.runtime.hash(), before);
  } finally {
    if (old === undefined) delete process.env.KEEL; else process.env.KEEL = old;
  }
});

test('runtime snapshot/restore round-trips the Keel hash', () => {
  const old = process.env.KEEL;
  process.env.KEEL = '1';
  try {
    const { battle, handle } = runOnce(11);
    const snap = handle.runtime.snapshot();
    const hash = handle.runtime.hash();
    for (let i = 0; i < 5 && !battle.finished; i++) battle.step();
    assert.notEqual(handle.runtime.hash(), hash);
    handle.runtime.restore(snap);
    assert.equal(handle.runtime.hash(), hash);
  } finally {
    if (old === undefined) delete process.env.KEEL; else process.env.KEEL = old;
  }
});
