import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { registerMeta, resetExtensions } from '../../server/sim/content/extensions.js';
import { getData } from '../../server/data.js';

test('a gameplay handler sees match lifecycle, can end the match, and publishes a plugin view', () => {
  resetExtensions();
  const seen = [];
  registerMeta({ id: 'rules-test', budget: 256 }, 'gameplay:test', {
    onMatchStart(ctx) {
      seen.push('start');
      assert.equal(ctx.round, 0);
      assert.equal(ctx.setView({ phase: ctx.phase }), true);
    },
    onRoundEnd(ctx, ev) { seen.push(`round:${ev.round}`); },
    checkEnd(ctx, ev) { return ev.round >= 1 ? { victory: true, reason: 'test-end' } : null; },
    onMatchEnd(ctx, ev) { seen.push(`end:${ev.outcome.reason}`); },
  });
  const registry = createRegistry();
  const h = makeMatch({ mode: 'solo', humans: 1, data: structuredClone(getData()), registry, fake: true });
  try {
    h.start();
    assert.deepEqual(seen, ['start']);
    assert.deepEqual(h.m.publicView().pluginView['rules-test'], { phase: h.m.phase });
    h.m.dispatchGameplay('onRoundEnd', { round: 1 });
    assert.deepEqual(seen, ['start', 'round:1']);
    const end = h.m.checkGameplayEnd({ round: 1 });
    assert.deepEqual(end, { victory: true, reason: 'test-end' });
    h.m.finish(end);
    assert.deepEqual(seen, ['start', 'round:1', 'end:test-end']);
  } finally {
    h.m.dispose();
    resetExtensions();
  }
});
