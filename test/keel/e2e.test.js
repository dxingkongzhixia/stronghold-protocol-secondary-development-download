// test/keel/e2e.test.js — a real Match/battle with a Keel module attached through newBattle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { makeMatch } from '../match/harness.js';

const manifest = () => ({
  manifest: 3,
  id: 'demo',
  name: 'Demo',
  version: '1.0.0',
  app: '*',
  api: { sim: 1 },
  scope: ['room'],
  trust: 'sandbox',
  modules: [{ kind: 'sim', entry: 'sim/index.js', permissions: ['sim.read'] }],
  state: { version: 1 },
});

const descriptor = () => ({
  plugins: [{
    id: 'demo',
    manifest: manifest(),
    modules: [{
      kind: 'sim',
      entry: 'sim/index.js',
      permissions: ['sim.read'],
      code: {
        setup({ api }) { api.state.patch({ started: false, ticks: 0 }); },
        hooks: {
          'sim.battleStart'(_ctx, api) { api.state.patch({ started: true }); },
          'sim.tick'(_ctx, api) {
            const s = api.state.get();
            api.state.patch({ ticks: s.ticks + 1 });
          },
        },
      },
    }],
  }],
});

test('a real match reaches COMBAT with a Keel runtime attached to its battle', () => {
  const old = process.env.KEEL;
  process.env.KEEL = '1';
  try {
    const h = makeMatch({ keel: descriptor(), humans: 1, seed: 42 });
    h.start();
    h.drive(() => h.m.fields?.some((f) => f.battle) || h.m.phase === PHASE.COMBAT);
    const field = h.m.fields.find((f) => f.battle);
    assert.ok(field, 'a battle exists');
    const battle = field.battle;
    assert.equal(Array.isArray(battle.keel), true);
    assert.equal(battle.keel.length, 1);
    assert.equal(battle.keel[0].owner, 'keel:demo');
    for (let i = 0; i < 5 && !battle.finished; i++) battle.step();
    const state = battle.keel[0].runtime.snapshot().state['demo:sim:sim/index.js'].value;
    assert.equal(state.started, true);
    assert.ok(state.ticks > 0, `ticks ${state.ticks}`);
    assert.equal(battle.keel[0].runtime.errors.length, 0, JSON.stringify(battle.keel[0].runtime.errors));
  } finally {
    if (old === undefined) delete process.env.KEEL; else process.env.KEEL = old;
  }
});
