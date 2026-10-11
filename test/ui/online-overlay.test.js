// 在线玩家 overlay (public/js/screens/lobby.js `OnlineOverlay`; docs/MATCHMAKING.md §8.2):
//   · the pure search filter (callsign / room code / status, case-insensitive, empty query = identity),
//   · the row → 统计数据 wiring (server/stats.js `stats.view`): a registered player's row opens their public records
//     by callsign and hides the list; a guest / nameless row opens nothing; a player with NO records still opens and
//     shows a clear read-only empty state instead of an error / a broken list,
//   · the 在线玩家 return origin (`ui.onlineStatsReturn`): set on an online-list open, consumed exactly once by the
//     stats close so it pops back to the list (with its search text), cleared on a title / session reset, and never
//     set by the other stats entry points. Same one-shot pattern as the 公开房间 origin (test/ui/room-origin.test.js).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  store, initialState, emptyMatch, setOnlineOpen, setOnlineFilter, setOnlineStatsReturn, consumeOnlineStatsReturn,
} from '../../public/js/store.js';
import { filterOnlinePlayers, onlineStatsTarget, openOnlineStats } from '../../public/js/screens/lobby.js';
import { statsBodyState, openStats, closeStats } from '../../public/js/screens/stats.js';
import { fetchStats } from '../../public/js/ui/statsSync.js';

const clear = () => store.patch('ui', { onlineOpen: false, onlineFilter: '', onlineStatsReturn: false });
/** An /online/api `online[]` entry (a registered, idle Doctor by default). */
const P = (over = {}) => ({ name: 'Doctor', guest: false, status: 'online', roomCode: null, ...over });

describe('在线玩家 search filter (filterOnlinePlayers)', () => {
  const list = [
    P({ name: 'Robin', status: 'room', roomCode: 'ABCD' }),
    P({ name: 'Amiya', status: 'queue' }),
    P({ name: '游客1234', guest: true, status: 'online' }),
    P({ name: 'Medic', status: 'solo', roomCode: 'ZZ99' }),
  ];
  const names = (q) => filterOnlinePlayers(list, q).map((p) => p.name);

  test('an empty / blank / non-string query keeps the list as it is (same reference)', () => {
    assert.equal(filterOnlinePlayers(list, ''), list);
    assert.equal(filterOnlinePlayers(list, '   '), list);
    assert.equal(filterOnlinePlayers(list, null), list);
    assert.equal(filterOnlinePlayers(list, undefined), list);
  });

  test('matches the callsign, case-insensitively', () => {
    assert.deepEqual(names('robin'), ['Robin']);
    assert.deepEqual(names('AMI'), ['Amiya']);
    assert.deepEqual(names('medic'), ['Medic']);
  });

  test('matches the room code', () => {
    assert.deepEqual(names('abcd'), ['Robin']);
    assert.deepEqual(names('zz99'), ['Medic']);
  });

  test('matches the status key or its (translated) label, and the guest tag', () => {
    assert.deepEqual(names('queue'), ['Amiya']);
    assert.deepEqual(names('野排排队'), ['Amiya']);
    assert.deepEqual(names('在线'), ['游客1234']);
    assert.deepEqual(names('游客'), ['游客1234']);
  });

  test('a query that matches nothing is an empty list; a non-array list is empty', () => {
    assert.deepEqual(filterOnlinePlayers(list, 'nobody'), []);
    assert.deepEqual(filterOnlinePlayers(null, 'x'), []);
    assert.deepEqual(filterOnlinePlayers(undefined, 'x'), []);
  });
});

describe('在线玩家 row → 统计数据', () => {
  test('a registered player is viewable; a guest or a nameless entry is not', () => {
    assert.equal(onlineStatsTarget(P()), 'Doctor');
    assert.equal(onlineStatsTarget(P({ guest: true })), null);
    assert.equal(onlineStatsTarget(P({ name: '' })), null);
    assert.equal(onlineStatsTarget(null), null);
    assert.equal(onlineStatsTarget(undefined), null);
  });

  test('a row click hides the list, opens the player\'s records by callsign, and remembers the origin', () => {
    clear();
    setOnlineOpen(true);
    const opened = [];
    assert.equal(openOnlineStats(P({ name: 'Robin' }), { open: (n) => opened.push(n) }), true);
    assert.deepEqual(opened, ['Robin']);
    assert.equal(store.get().ui.onlineOpen, false, 'the list is hidden while the stats show');
    assert.equal(store.get().ui.onlineStatsReturn, true, 'the online-list origin is remembered');
  });

  test('a guest / nameless row opens nothing and never sets the origin', () => {
    clear();
    const opened = [];
    assert.equal(openOnlineStats(P({ name: '游客9', guest: true }), { open: (n) => opened.push(n) }), false);
    assert.equal(openOnlineStats(P({ name: '' }), { open: (n) => opened.push(n) }), false);
    assert.deepEqual(opened, []);
    assert.equal(store.get().ui.onlineStatsReturn, false);
  });

  test('a player with no records still opens (read-only) and shows a clear empty state, not an error', async () => {
    const net = {
      status: 'online', name: 'Me',
      request: async (op, fields) => {
        assert.equal(op, 'stats.view');
        assert.equal(fields.name, 'Ghost');
        return { t: 'stats.records', scope: 'other', owner: { name: 'Ghost', role: null, guest: false }, records: [] };
      },
    };
    const r = await fetchStats(net, { name: 'Ghost' });
    assert.equal(r.scope, 'other');
    assert.equal(r.owner.name, 'Ghost');
    assert.deepEqual(r.records, [], 'the row is viewable even with no records — the page shows the empty message');
    assert.equal(statsBodyState({ ready: true, loading: false, readOnly: true, newer: false, hasRemote: false, empty: true }), 'no-target');
    assert.equal(statsBodyState({ ready: true, loading: false, readOnly: true, newer: false, hasRemote: true, empty: true }), 'empty');
    assert.equal(statsBodyState({ ready: true, loading: false, readOnly: true, newer: false, hasRemote: true, empty: false }), 'content');
  });
});

describe('在线玩家 return origin (ui.onlineStatsReturn)', () => {
  test('defaults off, as part of the initial store state', () => {
    assert.equal(initialState.ui.onlineStatsReturn, false);
    assert.equal(initialState.ui.onlineOpen, false);
    assert.equal(initialState.ui.onlineFilter, '');
    clear();
    assert.equal(store.get().ui.onlineStatsReturn, false);
  });

  test('set on an online-list open, consumed exactly once', () => {
    clear();
    setOnlineStatsReturn(true);
    assert.equal(store.get().ui.onlineStatsReturn, true);
    assert.equal(consumeOnlineStatsReturn(), true, 'the stats close pops back to 在线玩家');
    assert.equal(store.get().ui.onlineStatsReturn, false, 'the flag is gone after the consume');
    assert.equal(consumeOnlineStatsReturn(), false, 'one-shot: the next close sees nothing');
  });

  test('closing the stats pops the list back only while the lobby is on screen (a match consumes without reopening)', () => {
    clear();
    // route = game (entered + a running match): the origin is consumed, but the list must not reopen over the match
    store.set({ session: { entered: true }, room: { code: 'X', inMatch: true }, match: emptyMatch() });
    setOnlineStatsReturn(true);
    setOnlineOpen(false);
    closeStats();
    assert.equal(store.get().ui.onlineStatsReturn, false, 'consumed');
    assert.equal(store.get().ui.onlineOpen, false, 'not reopened during a match');
    // back on the lobby: a fresh origin reopens the list
    store.set({ room: null, match: emptyMatch() });
    setOnlineStatsReturn(true);
    closeStats();
    assert.equal(store.get().ui.onlineOpen, true, 'popped back to the online list');
    store.reset();
  });

  test('another stats entry point (title / lobby button / room) clears a stale origin', () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({}) }); // keep openStats' data.load off the network
    try {
      setOnlineStatsReturn(true);
      openStats();
      assert.equal(store.get().ui.onlineStatsReturn, false, 'only an online-list open may pop the list back');
    } finally { globalThis.fetch = realFetch; }
  });

  test('store.reset() (title / session reset) clears the origin, the open state and the search text', () => {
    setOnlineStatsReturn(true);
    setOnlineOpen(true);
    setOnlineFilter('罗宾');
    store.reset();
    assert.equal(store.get().ui.onlineStatsReturn, false);
    assert.equal(store.get().ui.onlineOpen, false);
    assert.equal(store.get().ui.onlineFilter, '');
  });
});
