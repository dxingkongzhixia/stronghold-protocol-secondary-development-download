// test/ui/wake-lock.test.js — the battle screen wake lock (public/js/ui/device.js installScreenWakeLock): held while
// visible, released on cleanup, re-acquired on foreground, retried after a gesture when the first request was refused,
// and a no-op where the API is absent. Adopted with the hook from the mainline's #790.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installScreenWakeLock } from '../../public/js/ui/device.js';

function fakeEnv({ visible = 'visible', supported = true } = {}) {
  const listeners = new Map();
  const doc = {
    visibilityState: visible,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type) { for (const fn of listeners.get(type) || []) fn(); },
  };
  const requests = [];
  const released = [];
  const state = { reject: 0 };
  const wakeLock = supported ? {
    async request(kind) {
      requests.push(kind);
      if (state.reject > 0) { state.reject--; throw new Error('no gesture'); }
      const lock = { released: false, async release() { this.released = true; released.push(lock); } };
      return lock;
    },
  } : undefined;
  return { win: { document: doc, navigator: { wakeLock } }, doc, requests, released, state };
}

test('held while visible, released on cleanup', async () => {
  const { win, doc, requests, released } = fakeEnv();
  const dispose = installScreenWakeLock(win);
  await Promise.resolve();
  assert.deepEqual(requests, ['screen']);
  assert.equal(doc.visibilityState, 'visible');
  dispose();
  await Promise.resolve();
  assert.equal(released.length, 1);
  assert.equal(released[0].released, true);
});

test('a hidden page drops the lock and the next foreground asks again', async () => {
  const { win, doc, requests, released } = fakeEnv();
  const dispose = installScreenWakeLock(win);
  await Promise.resolve();
  assert.equal(requests.length, 1);
  doc.visibilityState = 'hidden';
  doc.emit('visibilitychange');
  await Promise.resolve();
  assert.equal(released.length, 1, 'a hidden page releases its lock');
  doc.visibilityState = 'visible';
  doc.emit('visibilitychange');
  await Promise.resolve();
  assert.equal(requests.length, 2, 'the foreground asks again');
  dispose();
  await Promise.resolve();
  assert.equal(released.length, 2);
});

test('a refused request waits for the next touch and then retries', async () => {
  const { win, doc, requests, released, state } = fakeEnv();
  state.reject = 1; // no user gesture yet
  const dispose = installScreenWakeLock(win);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(requests.length, 1);
  assert.equal(released.length, 0);
  doc.emit('pointerdown');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(requests.length, 2, 'the gesture retries the request');
  dispose();
  await Promise.resolve();
  assert.equal(released.length, 1);
});

test('a browser without the wake lock API is a silent no-op', async () => {
  const { win, requests } = fakeEnv({ supported: false });
  const dispose = installScreenWakeLock(win);
  await Promise.resolve();
  assert.equal(requests.length, 0);
  dispose();
});
