// test/keel/e2e-match.test.js — a real Match plays 10 rounds with Keel content + sim + match + policy + HUD.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKeelPlugin } from '../../server/keel/room-source.js';
import { makeMatch } from '../match/harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATE = path.join(ROOT, 'plugins/_template/keel-survival');

test('10 real rounds through Match with the Keel template', async () => {
  const plugin = await loadKeelPlugin(TEMPLATE);
  assert.equal(plugin.problems.length, 0, plugin.problems.join('\n'));
  // The template's 3 lives are for the headless demo; a real field with no operators leaks, so give this test 99.
  const modules = plugin.modules.map((m) => {
    if (m.kind === 'match') return { ...m, code: { ...m.code, setup({ api }) { api.state.patch({ round: 0, lives: 9999, gold: 10, cleared: 0, over: false }); } } };
    if (m.kind === 'sim') return {
      ...m,
      code: {
        setup({ api }) { api.state.patch({ ticks: 0, ended: false }); },
        hooks: {
          'sim.tick'(_ctx, api) { const s = api.state.get(); api.state.patch({ ticks: s.ticks + 1 }); },
          'sim.battleEnd'(_ctx, api) { api.state.patch({ ended: true }); },
        },
      },
    };
    return m;
  });
  const descriptor = { plugins: [{ ...plugin, modules }] };
  const old = process.env.KEEL;
  process.env.KEEL = '1';
  try {
    const h = makeMatch({ keel: descriptor, humans: 1, seed: 123 });
    assert.equal(h.m.gd.enemy('enemy_x_keel_survival_refractor')?.name, '折射者');
    h.ps('p_0').lp = 9999;
    h.onBroadcast.push(() => { const ps = h.ps('p_0'); if (ps) ps.lp = 9999; });
    h.start();
    h.drive(() => h.m.ended === true || !!h.m.keelMatch?.finished);
    assert.equal(h.m.ended === true, true, `match did not end (round ${h.m.round})`);
    const matchState = h.m.keelMatch.snapshot().state['keel-room:match:match/index.js'].value;
    assert.equal(matchState.round, 10);
    assert.ok(matchState.lives > 0);
    assert.deepEqual(h.m.keelMatch.finished, { winner: 'players', reason: 'survived' });
    const policy = h.m.keelMatch.snapshot().state['keel-room:policy:policy/index.js'].value;
    assert.equal(policy.decisions.length, 10);
    const pub = h.lastBc('m.public');
    assert.ok(pub?.pluginView?.['keel-survival']?.hud?.right?.length > 0, 'HUD view published as pluginView.hud.right');
    const battle = h.m.fields.find((f) => f.battle)?.battle;
    assert.ok(battle?.keel?.length, 'sim runtime attached to the real battle');
    assert.deepEqual(battle.keel[0].runtime.errors, []);
  } finally {
    if (old === undefined) delete process.env.KEEL; else process.env.KEEL = old;
  }
});
