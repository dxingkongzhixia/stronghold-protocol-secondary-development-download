// test/keel/rng.test.js — named deterministic streams.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../shared/keel/index.js';

test('the same seed and stream give the same sequence', () => {
  const a = createRng(42, 'crit');
  const b = createRng(42, 'crit');
  const seqA = Array.from({ length: 20 }, () => a.next());
  const seqB = Array.from({ length: 20 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test('different seeds and different streams diverge', () => {
  const a = createRng(1, 'crit');
  const b = createRng(2, 'crit');
  const c = createRng(1, 'dodge');
  assert.notDeepEqual([a.next(), a.next()], [b.next(), b.next()]);
  assert.notDeepEqual([createRng(1, 'crit').next()], [c.next()]);
});

test('int() is in range and pick() returns an element; fork() is stable', () => {
  const r = createRng('seed', 'shop');
  for (let i = 0; i < 100; i++) {
    const n = r.int(7);
    assert.ok(Number.isInteger(n) && n >= 0 && n < 7);
  }
  assert.ok(['a', 'b', 'c'].includes(r.pick(['a', 'b', 'c'])));
  assert.deepEqual([createRng(3, 'x').fork('y').next()], [createRng(3, 'x/y').next()]);
});

test('bad int/pick arguments throw', () => {
  const r = createRng(1);
  assert.throws(() => r.int(0), /positive integer/);
  assert.throws(() => r.pick([]), /non-empty array/);
});
