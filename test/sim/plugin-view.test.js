import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle } from '../helpers/battleHarness.js';

test('a battle publishes a bounded plugin view in its snapshot', () => {
  const h = makeBattle({ content: 'none', autoFinish: false });
  assert.equal(h.b.snapshot().pluginView, undefined);
  assert.equal(h.b.setPluginView('demo', { objective: 'survive', n: 2 }), true);
  assert.deepEqual(h.b.snapshot().pluginView, { demo: { objective: 'survive', n: 2 } });
  assert.equal(h.b.setPluginView('demo', { huge: 'x'.repeat(20 * 1024) }), false);
  assert.deepEqual(h.b.snapshot().pluginView.demo, { objective: 'survive', n: 2 });
});
