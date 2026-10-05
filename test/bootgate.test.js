// test/bootgate.test.js — the boot-preload gate (server/bootgate.js): one slot by default, FIFO promotion on release,
// a second slot when configured, and a stale-hold sweep so a dead tab never blocks the queue.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BootGate } from '../server/bootgate.js';

test('BootGate: claim grants up to maxConcurrent, the rest queue with a position', () => {
  const g = new BootGate({ maxConcurrent: 1, now: () => 0 });
  assert.deepEqual(g.claim('a'), { granted: true, position: 0 });
  assert.deepEqual(g.claim('b'), { granted: false, position: 1 });
  assert.deepEqual(g.claim('c'), { granted: false, position: 2 });
  assert.deepEqual(g.claim('a'), { granted: true, position: 0 }, 're-claiming while holding keeps the slot');
  assert.deepEqual(g.claim('b'), { granted: false, position: 1 }, 're-claiming while queued keeps the place');
  assert.deepEqual(g.stats(), { active: 1, max: 1, waiting: 2 });
});

test('BootGate: release + drain hand the slot to the next waiter, in order', () => {
  const g = new BootGate({ maxConcurrent: 1, now: () => 0 });
  g.claim('a'); g.claim('b'); g.claim('c');
  assert.equal(g.release('a'), true);
  assert.equal(g.release('nobody'), false);
  assert.deepEqual(g.drain(), ['b']);
  assert.equal(g.release('b'), true);
  assert.deepEqual(g.drain(), ['c']);
  assert.equal(g.release('c'), true);
  assert.deepEqual(g.stats(), { active: 0, max: 1, waiting: 0 });
});

test('BootGate: maxConcurrent > 1 runs that many at once', () => {
  const g = new BootGate({ maxConcurrent: 2, now: () => 0 });
  assert.equal(g.claim('a').granted, true);
  assert.equal(g.claim('b').granted, true);
  assert.deepEqual(g.claim('c'), { granted: false, position: 2 });
});

test('BootGate: a hold older than holdMs is swept so a dead tab never blocks the queue', () => {
  let t = 0;
  const g = new BootGate({ maxConcurrent: 1, holdMs: 1000, now: () => t });
  g.claim('a');
  g.claim('b');
  t = 1500;
  assert.deepEqual(g.sweep(), ['a']);
  assert.deepEqual(g.drain(), ['b']);
  assert.deepEqual(g.stats(), { active: 1, max: 1, waiting: 0 });
});
