// test/keel/demo.test.js — the headless M2 loop on the survival template.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKeelPlugin } from '../../server/keel/room-source.js';
import { runKeelDemo } from '../../server/keel/demo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATE = path.join(ROOT, 'plugins/_template/keel-survival');

test('the survival template plays 10 rounds with sim + match + policy', async () => {
  const plugin = await loadKeelPlugin(TEMPLATE);
  assert.equal(plugin.problems.length, 0, plugin.problems.join('\n'));
  const out = runKeelDemo({ plugin, rounds: 10, framesPerRound: 60, seed: 1 });
  assert.equal(out.played, 10);
  assert.deepEqual(out.finished, { winner: 'players', reason: 'survived' });
  assert.deepEqual(out.errors, []);
  const match = Object.entries(out.snapshot.state).find(([id]) => id.includes(':match:'))[1].value;
  assert.equal(match.round, 10);
  assert.equal(match.lives, 3);
  assert.equal(match.gold, 60);
  assert.ok(match.cleared > 0, `cleared ${match.cleared}`);
  const policy = Object.entries(out.snapshot.state).find(([id]) => id.includes(':policy:'))[1].value;
  assert.equal(policy.decisions.length, 10);
  assert.equal(out.views['keel-survival:match:match/index.js'].round, 10);
});

test('the demo is deterministic for the same seed', async () => {
  const plugin = await loadKeelPlugin(TEMPLATE);
  const a = runKeelDemo({ plugin, rounds: 5, framesPerRound: 30, seed: 7 });
  const b = runKeelDemo({ plugin, rounds: 5, framesPerRound: 30, seed: 7 });
  assert.equal(a.hash, b.hash);
  assert.deepEqual(a.snapshot.state, b.snapshot.state);
});
