// test/keel/e2e-match-units.test.js — 10 real rounds with real operators on the board (no test variants).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHASE } from '../../shared/constants.js';
import { loadKeelPlugin } from '../../server/keel/room-source.js';
import { give, legalTileFor, makeMatch } from '../match/harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATE = path.join(ROOT, 'plugins/_template/keel-survival');

test('10 real rounds with real operators, content, match, policy and HUD', async () => {
  const plugin = await loadKeelPlugin(TEMPLATE);
  assert.equal(plugin.problems.length, 0, plugin.problems.join('\n'));
  const modules = plugin.modules.map((m) => m.kind === 'match'
    ? { ...m, code: { ...m.code, setup({ api }) { api.state.patch({ round: 0, lives: 9999, gold: 10, cleared: 0, over: false }); } } }
    : m);
  const keel = { plugins: [{ ...plugin, modules }] };
  const old = process.env.KEEL;
  process.env.KEEL = '1';
  try {
    const h = makeMatch({ keel, humans: 1, seed: 4242 });
    h.onBroadcast.push(() => { const p = h.ps('p_0'); if (p) p.lp = 9999; });
    const m = h.m;
    const ps = h.ps('p_0');
    h.start();
    for (let round = 1; round <= 10; round++) {
      const prep = h.drive(() => m.phase === PHASE.PREP && m.round === round, { ready: false });
      assert.ok(prep, `reached PREP ${round} (phase ${m.phase} R${m.round})`);
      // Fill the board once with the strongest visible chess; later rounds keep it.
      const ids = [...m.gd.visibleChess]
        .filter((id) => m.pool.has(id))
        .sort((a, b) => (m.gd.chess(b)?.tier ?? 0) - (m.gd.chess(a)?.tier ?? 0));
      for (const id of ids) {
        if (ps.deployCount >= 8) break;
        const tile = legalTileFor(m, ps, id);
        if (tile) give(m, ps, id, 'board', tile);
      }
      if (!ps.tempEmpty) ps.resolveTemp();
      const ready = m.handle('p_0', { t: 'g.ready', ready: true });
      assert.ok(ready.ok, `ready R${round}: ${JSON.stringify(ready)}`);
      h.run(() => m.ended === true || (m.phase === PHASE.PREP && m.round > round));
      if (m.ended) break;
    }
    assert.ok(m.round >= 10, `reached round 10 (round ${m.round}, phase ${m.phase})`);
    assert.ok(m.keelMatch, 'match/policy runtime exists');
    const matchState = m.keelMatch.snapshot().state['keel-room:match:match/index.js'].value;
    assert.equal(matchState.round, 10);
    assert.ok(matchState.lives > 0, `keel lives ${matchState.lives}`);
    const policy = m.keelMatch.snapshot().state['keel-room:policy:policy/index.js'].value;
    assert.equal(policy.decisions.length, 10);
    const pub = h.lastBc('m.public');
    assert.ok(pub?.pluginView?.['keel-survival']?.hud?.right?.length > 0);
    const battle = m.fields.find((f) => f.battle)?.battle;
    assert.ok(battle?.keel?.length, 'sim attached');
    assert.deepEqual(battle.keel[0].runtime.errors, []);
  } finally {
    if (old === undefined) delete process.env.KEEL; else process.env.KEEL = old;
  }
});
