// test/keel/state.test.js — JSON state, snapshots and migrations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertJson, createState, KeelStateError } from '../../shared/keel/index.js';

test('only JSON values are accepted', () => {
  assert.doesNotThrow(() => assertJson({ a: 1, b: [true, null, 'x'] }));
  for (const bad of [{ a: undefined }, { a: () => 1 }, { a: Number.NaN }, { a: Infinity }, { a: 1n }, { a: new Date() }]) {
    assert.throws(() => assertJson(bad), KeelStateError);
  }
});

test('get returns a copy; patch/set/replace own the value', () => {
  const s = createState({ n: 1 });
  const copy = s.get();
  copy.n = 99;
  assert.equal(s.get().n, 1);
  assert.deepEqual(s.patch({ n: 2, ok: true }), { n: 2, ok: true });
  assert.deepEqual(s.set({ n: 3 }), { n: 3 });
  assert.deepEqual(s.replace({ n: 4 }), { n: 4 });
});

test('snapshot/restore round-trips and refuses a version gap', () => {
  const s = createState({ n: 1 }, { version: 1 });
  const snap = s.snapshot();
  s.patch({ n: 2 });
  s.restore(snap);
  assert.equal(s.get().n, 1);
  const future = { version: 2, value: { n: 5 } };
  assert.throws(() => s.restore(future), /version 2/);
});

test('a migration is required and runs in order', () => {
  const s = createState({ n: 1 }, { version: 1 });
  const old = s.snapshot();
  s.bump();
  assert.throws(() => s.restore(old), /no migration/);
  s.migrate(1, (v) => ({ n: v.n + 10 }));
  s.restore(old);
  assert.equal(s.get().n, 11);
});

test('bad snapshots and bad patch values throw', () => {
  const s = createState({});
  assert.throws(() => s.restore(null), KeelStateError);
  assert.throws(() => s.patch([1]), KeelStateError);
  assert.throws(() => s.patch({ bad: undefined }), KeelStateError);
});
