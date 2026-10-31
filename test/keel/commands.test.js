// test/keel/commands.test.js — the command log and replay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommandBus, KeelCommandError } from '../../shared/keel/index.js';

test('dispatch validates, records and applies', () => {
  let frame = 0;
  const bus = createCommandBus({ frame: () => frame, apply: (c) => c.amount ?? 0 });
  assert.equal(bus.dispatch({ type: 'grant', amount: 3 }), 3);
  frame = 2;
  bus.dispatch({ type: 'spend', amount: 1 });
  const log = bus.snapshot();
  assert.equal(log.length, 2);
  assert.deepEqual(log[0], { seq: 0, frame: 0, command: { type: 'grant', amount: 3 }, result: 3 });
  assert.equal(log[1].frame, 2);
});

test('a command needs a plain object and a type; the limit is enforced', () => {
  const bus = createCommandBus({ limit: 2 });
  assert.throws(() => bus.dispatch(null), KeelCommandError);
  assert.throws(() => bus.dispatch([]), KeelCommandError);
  assert.throws(() => bus.dispatch({ amount: 1 }), KeelCommandError);
  bus.dispatch({ type: 'a' });
  bus.dispatch({ type: 'b' });
  assert.throws(() => bus.dispatch({ type: 'c' }), /more than 2/);
});

test('replay, restore and hash are stable', () => {
  const bus = createCommandBus();
  bus.dispatch({ type: 'a', n: 1 });
  bus.dispatch({ type: 'b', n: 2 });
  const seen = [];
  bus.replay((c) => seen.push(c.type));
  assert.deepEqual(seen, ['a', 'b']);
  const snap = bus.snapshot();
  const h = bus.hash();
  bus.clear();
  assert.equal(bus.length, 0);
  bus.restore(snap);
  assert.equal(bus.hash(), h);
  assert.throws(() => bus.restore(null), KeelCommandError);
});
