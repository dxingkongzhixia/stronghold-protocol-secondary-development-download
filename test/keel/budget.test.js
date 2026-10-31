// test/keel/budget.test.js — per-hook, per-frame and per-match budgets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBudget, KeelBudgetError } from '../../shared/keel/index.js';

test('a normal charge passes and records counters', () => {
  const b = createBudget({ perHook: 1, perFrame: 2, perMatch: 10 });
  assert.equal(b.charge('tick', 0.4).ok, true);
  assert.equal(b.charge('tick', 0.4).ok, true);
  const used = b.snapshot();
  assert.equal(used.hook, 0.4);
  assert.equal(used.match, 0.8);
});

test('each limit has its own reason', () => {
  const hook = createBudget({ perHook: 0.5, perFrame: 10, perMatch: 10 });
  assert.equal(hook.charge('a', 0.6).reason, 'hook');
  const frame = createBudget({ perHook: 10, perFrame: 1, perMatch: 10 });
  frame.charge('a', 0.6);
  assert.equal(frame.charge('b', 0.6).reason, 'frame');
  frame.nextFrame();
  assert.equal(frame.charge('b', 0.6).ok, true);
  const match = createBudget({ perHook: 10, perFrame: 10, perMatch: 1 });
  match.charge('a', 0.8);
  assert.equal(match.charge('b', 0.4).reason, 'match');
  assert.throws(() => match.charge('c', -1), KeelBudgetError);
});

test('reset and restore', () => {
  const b = createBudget({ perMatch: 1 });
  const snap = b.snapshot();
  b.charge('a', 0.5);
  b.restore(snap);
  assert.equal(b.snapshot().match, 0);
  b.charge('a', 0.5);
  b.reset();
  assert.equal(b.snapshot().match, 0);
});
