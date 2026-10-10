// test/ui/statsSync.test.js — the client side of the server-backed match statistics (public/js/ui/statsSync.js,
// public/js/ui/stats.js; docs/MATCHMAKING.md §39):
//   the local backlog (pendingRecords) and the persisted uploaded set (markUploaded),
//   flushStats: submits the un-uploaded records once, marks them, retries on a transient failure, drops a refused one,
//   installStatsSync: flushes on `welcome` and on `auth.ok` (a login re-uploads the guest / offline backlog),
//   fetchStats: stats.list for the caller's own records, stats.view for another online player's,
//   the uploader hook (ui/stats.js setStatsUploader) fires for a freshly stored match and not for a replay.
// localStorage is faked per test; net is a small fake that records the requests.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordResult, loadStats, saveStats, emptyStats, appendRecord, buildRecord, setStatsUploader,
} from '../../public/js/ui/stats.js';
import {
  loadSyncState, pendingRecords, markUploaded, flushStats, installStatsSync, fetchStats,
  clearServerStats, STATS_SYNC_PREF,
} from '../../public/js/ui/statsSync.js';

/** Fake localStorage (Map-backed). */
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    get sync() { return m.get(`sp.pref.${STATS_SYNC_PREF}`) ?? null; },
  };
}
function withStorage(fn) {
  const ls = fakeStorage();
  globalThis.localStorage = ls;
  return Promise.resolve()
    .then(() => fn(ls))
    .finally(() => { delete globalThis.localStorage; });
}

/** A minimal m.result payload for `myId`. */
function res(seed, myId = 'p1') {
  return {
    victory: true, roundsPassed: 10, hiddenReached: false, hiddenCleared: false, reason: 'cleared', teamLp: 20,
    modeId: 'mode_single_hard', difficulty: 'HARD', seed, durationMs: 1000,
    players: [{ playerId: myId, seat: 0, name: 'Me', isBot: false, left: false, alive: true, victory: true, roundsPassed: 10, bandId: 'band_amiya', stats: { kills: 1 } }],
  };
}
/** Store `n` records locally (newest last), returns their ids. */
function seedLocal(n) {
  let stats = emptyStats();
  for (let i = 0; i < n; i++) stats = appendRecord(stats, buildRecord(res(i), { myId: 'p1', now: 1000 + i })).stats;
  saveStats(stats);
  return loadStats().records.map((r) => r.id);
}

/** A tiny fake net: records every request, answers stats.list / stats.view with `serverRecords`. */
function fakeNet({ status = 'online', name = 'Me', submitError = null, listError = null, serverRecords = [] } = {}) {
  const calls = [];
  const listeners = new Map();
  return {
    status, name, calls,
    on(type, fn) { const arr = listeners.get(type) || []; arr.push(fn); listeners.set(type, arr); return () => { listeners.set(type, (listeners.get(type) || []).filter((f) => f !== fn)); }; },
    emit(type, msg = {}) { for (const f of listeners.get(type) || []) f(msg); },
    request(t, fields = {}) {
      calls.push({ t, fields });
      if (t === 'stats.submit' && submitError) return Promise.reject(submitError);
      if (t === 'stats.list' && listError) return Promise.reject(listError);
      if (t === 'stats.view' && listError) return Promise.reject(listError);
      if (t === 'stats.list' || t === 'stats.view') {
        return Promise.resolve({ t: 'stats.records', scope: t === 'stats.list' ? 'self' : 'other', owner: { name: t === 'stats.list' ? name : fields.name, role: null, guest: false }, records: serverRecords });
      }
      return Promise.resolve({ t: 'ok' });
    },
  };
}

describe('statsSync: the backlog + the uploaded set', () => {
  test('pendingRecords skips the uploaded ids, keeps order, and caps one pass', () => {
    const records = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.deepEqual(pendingRecords(records, ['b']).map((r) => r.id), ['a', 'c']);
    assert.deepEqual(pendingRecords(records, new Set()), ['a', 'b', 'c'].map((id) => ({ id })));
    assert.equal(pendingRecords(Array.from({ length: 10 }, (_, i) => ({ id: `r${i}` })), [], 3).length, 3);
    assert.deepEqual(pendingRecords(null, []), []);
  });

  test('markUploaded persists and drops ids the local store no longer holds', async () => {
    await withStorage(() => {
      const ids = seedLocal(2);
      markUploaded([ids[0], 'gone']);
      const state = loadSyncState();
      assert.deepEqual(state.uploaded, [ids[0]], 'a pruned / unknown id is not remembered');
      markUploaded([ids[1]]);
      assert.deepEqual(loadSyncState().uploaded.sort(), [ids[0], ids[1]].sort());
      assert.ok(JSON.parse(globalThis.localStorage.sync).uploaded.length === 2);
    });
  });
});

describe('statsSync: flushStats', () => {
  test('submits every un-uploaded record once, in order, then sends nothing', async () => {
    await withStorage(async () => {
      const ids = seedLocal(3);
      const net = fakeNet();
      assert.deepEqual(await flushStats(net), { sent: 3, stopped: false });
      assert.deepEqual(net.calls.map((c) => c.t), ['stats.submit', 'stats.submit', 'stats.submit']);
      assert.deepEqual(net.calls.map((c) => c.fields.record.id), ids);
      assert.deepEqual(loadSyncState().uploaded.sort(), [...ids].sort());
      net.calls.length = 0;
      assert.deepEqual(await flushStats(net), { sent: 0, stopped: false });
      assert.equal(net.calls.length, 0, 'nothing to re-send');
    });
  });

  test('a down socket sends nothing (the next welcome retries)', async () => {
    await withStorage(async () => {
      seedLocal(2);
      const net = fakeNet({ status: 'offline' });
      assert.deepEqual(await flushStats(net), { sent: 0, stopped: false });
      assert.equal(net.calls.length, 0);
      assert.deepEqual(loadSyncState().uploaded, []);
    });
  });

  test('a transient failure stops the pass and leaves the rest for the next one', async () => {
    await withStorage(async () => {
      seedLocal(3);
      const err = Object.assign(new Error('offline'), { code: 'OFFLINE' });
      const net = fakeNet({ submitError: err });
      const r = await flushStats(net);
      assert.equal(r.stopped, true);
      assert.equal(net.calls.length, 1, 'stopped on the first failure');
      assert.deepEqual(loadSyncState().uploaded, [], 'nothing was marked');
    });
  });

  test('a refused (BAD_MSG / BAD_STATS) record is marked and skipped, the rest still go', async () => {
    await withStorage(async () => {
      const ids = seedLocal(2);
      const net = fakeNet();
      // first record is refused forever, the second is accepted
      let n = 0;
      const raw = net.request.bind(net);
      net.request = (t, f) => { if (t === 'stats.submit' && n++ === 0) return Promise.reject(Object.assign(new Error('bad'), { code: 'BAD_STATS' })); return raw(t, f); };
      const r = await flushStats(net);
      assert.equal(r.sent, 2);
      assert.deepEqual(loadSyncState().uploaded.sort(), [...ids].sort());
    });
  });
});

describe('statsSync: installStatsSync', () => {
  test('flushes on welcome and on auth.ok (the login re-upload)', async () => {
    await withStorage(async () => {
      seedLocal(1);
      const net = fakeNet({ status: 'connecting' });
      const sync = installStatsSync({ net });
      net.status = 'online';
      net.emit('welcome', {});
      await new Promise((r) => setTimeout(r, 0));
      assert.equal(net.calls.filter((c) => c.t === 'stats.submit').length, 1);
      // a later login finds nothing new (already marked) but a fresh guest record is uploaded under the account
      recordResult(res(99), { myId: 'p1', now: 5000 });
      net.emit('auth.ok', { account: { id: 1, name: 'Me' }, token: 'x' });
      await new Promise((r) => setTimeout(r, 0));
      assert.equal(net.calls.filter((c) => c.t === 'stats.submit').length, 2);
      sync.dispose();
    });
  });
});

describe('statsSync: fetchStats / clearServerStats', () => {
  test('stats.list for the caller, stats.view for another player by name', async () => {
    const net = fakeNet({ serverRecords: [{ id: 'x' }] });
    const own = await fetchStats(net);
    assert.equal(net.calls.at(-1).t, 'stats.list');
    assert.equal(own.scope, 'self');
    assert.deepEqual(own.records, [{ id: 'x' }]);
    const other = await fetchStats(net, { name: 'Bob' });
    assert.equal(net.calls.at(-1).t, 'stats.view');
    assert.deepEqual(net.calls.at(-1).fields, { name: 'Bob' });
    assert.equal(other.scope, 'other');
    assert.equal(other.owner.name, 'Bob');
  });

  test('a failed fetch rejects (the page falls back to localStorage)', async () => {
    const net = fakeNet({ listError: Object.assign(new Error('x'), { code: 'OFFLINE' }) });
    await assert.rejects(() => fetchStats(net), (e) => e.code === 'OFFLINE');
  });

  test('clearServerStats sends stats.clear', async () => {
    const net = fakeNet();
    assert.equal(await clearServerStats(net), true);
    assert.equal(net.calls.at(-1).t, 'stats.clear');
  });
});

describe('statsSync: the uploader hook in ui/stats.js', () => {
  test('a freshly stored match triggers the uploader; a replayed one does not', async () => {
    await withStorage(() => {
      const seen = [];
      setStatsUploader((rec) => seen.push(rec.id));
      try {
        recordResult(res(1), { myId: 'p1', now: 1000 });
        assert.equal(seen.length, 1);
        recordResult(res(1), { myId: 'p1', now: 2000 }); // a replay (same record id) stores nothing
        assert.equal(seen.length, 1);
        recordResult(res(2), { myId: 'p1', now: 3000 });
        assert.equal(seen.length, 2);
      } finally { setStatsUploader(null); }
      recordResult(res(3), { myId: 'p1', now: 4000 });
      assert.equal(seen.length, 2, 'after setStatsUploader(null) nothing more fires');
    });
  });
});
