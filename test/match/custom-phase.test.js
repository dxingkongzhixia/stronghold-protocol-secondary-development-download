import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { registerMeta, resetExtensions } from '../../server/sim/content/extensions.js';
import { getData } from '../../server/data.js';
import { ERR } from '../../shared/constants.js';

test('a gameplay plugin can hold a bounded custom phase and resume the core flow', () => {
  resetExtensions();
  const seen = [];
  registerMeta({ id: 'phase-test', budget: 256 }, 'gameplay:phase-test', {
    onMatchStart(ctx) {
      seen.push(`start:${ctx.phase}`);
      assert.equal(ctx.startPhase('briefing', { seconds: 5, data: { page: 1 } }), true);
      assert.equal(ctx.setView({ phase: 'briefing' }), true);
    },
    onCustomPhaseStart(ctx, ev) {
      seen.push(`custom-start:${ev.name}`);
      assert.equal(ctx.customPhase.name, 'briefing');
    },
    onCustomPhaseEnd(ctx, ev) {
      seen.push(`custom-end:${ev.name}:${ev.reason}`);
    },
  });
  const registry = createRegistry();
  const h = makeMatch({ mode: 'solo', humans: 1, data: structuredClone(getData()), registry, fake: true });
  try {
    h.start();
    assert.deepEqual(seen, ['start:INFO_CHECK', 'custom-start:briefing']);
    const pub = h.m.publicView();
    assert.equal(pub.phase, 'INFO_CHECK');
    assert.equal(pub.customPhase.name, 'briefing');
    assert.deepEqual(pub.customPhase.data, { page: 1 });
    assert.deepEqual(h.m.publicView().pluginView['phase-test'], { phase: 'briefing' });
    assert.equal(h.m.handle('p_0', { t: 'g.infoReady' }).error, ERR.WRONG_PHASE);
    h.run(() => h.m.customPhase === null);
    assert.deepEqual(seen, ['start:INFO_CHECK', 'custom-start:briefing', 'custom-end:briefing:timeout']);
    assert.equal(h.m.publicView().customPhase, undefined);
    assert.equal(h.m.customPhase, null);
  } finally {
    h.m.dispose();
    resetExtensions();
  }
});

test('a custom phase suspends the core deadline and rearms its remaining time', () => {
  resetExtensions();
  const h = makeMatch({ mode: 'solo', humans: 1, data: structuredClone(getData()), registry: createRegistry(), fake: true });
  try {
    h.start();
    let fired = 0;
    h.m.setDeadline(10, () => { fired++; });
    assert.ok(h.m.deadline > 0);
    assert.equal(h.m.enterCustomPhase('phase-test', 'hold', { seconds: 2 }), true);
    assert.equal(h.m.deadline, 0, 'the core countdown is suspended');
    h.run(() => h.m.customPhase === null);
    assert.ok(h.m.deadline > 0, 'the remaining deadline is back');
    h.run(() => fired > 0);
    assert.equal(fired, 1);
  } finally {
    h.m.dispose();
    resetExtensions();
  }
});

test('a plugin can end its own custom phase early and a foreign plugin cannot', () => {
  resetExtensions();
  registerMeta({ id: 'phase-owner', budget: 256 }, 'gameplay:phase-owner', {
    onMatchStart(ctx) { ctx.startPhase('interlude', { seconds: 60 }); },
  });
  const registry = createRegistry();
  const h = makeMatch({ mode: 'solo', humans: 1, data: structuredClone(getData()), registry, fake: true });
  try {
    h.start();
    assert.equal(h.m.customPhase.name, 'interlude');
    assert.equal(h.m.endCustomPhase('other-plugin', 'interlude'), false);
    assert.equal(h.m.customPhase.name, 'interlude');
    assert.equal(h.m.endCustomPhase('phase-owner', 'interlude'), true);
    assert.equal(h.m.customPhase, null);
  } finally {
    h.m.dispose();
    resetExtensions();
  }
});
