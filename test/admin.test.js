// test/admin.test.js — the operations page (server/admin.js, docs/MATCHMAKING.md §13): status mapping,
// the snapshot shape/ Counts, token comparison, and the token-gated HTTP routes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusOf, buildSnapshot, buildPublicSnapshot, tokenMatches } from '../server/admin.js';
import { openMemoryDb } from '../server/db.mjs';
import { AuthService } from '../server/auth.js';
import { SessionRegistry } from '../server/net.js';
import { startServer } from '../server/index.js';

test('tokenMatches is exact and rejects empty / missing', () => {
  assert.ok(tokenMatches('abc', 'abc'));
  assert.ok(!tokenMatches('abc', 'abd'));
  assert.ok(!tokenMatches('abcd', 'abc'));
  assert.ok(!tokenMatches('', 'abc'));
  assert.ok(!tokenMatches('abc', ''));
  assert.ok(!tokenMatches(undefined, 'abc'));
});

test('statusOf maps every status', () => {
  const mk = (over) => ({ ...over, seatOf: () => ({ left: false }) });
  const rooms = {
    S: mk({ code: 'S', mode: 'solo', match: {} }),
    C: mk({ code: 'C', mode: 'coop', match: {} }),
    A: mk({ code: 'A', mode: 'coop', match: {}, auto: true }),
    L: mk({ code: 'L', mode: 'coop', match: null }),
  };
  const lobby = { getRoom: (c) => rooms[c] || null };
  const mm = { byKey: new Map([['p_q', {}]]) };
  const s = (over = {}) => ({ connected: true, playerId: 'p', roomCode: null, ...over });
  assert.equal(statusOf(s({ connected: false }), { lobby, matchmaker: mm }), 'offline');
  assert.equal(statusOf(null, { lobby, matchmaker: mm }), 'offline');
  assert.equal(statusOf(s({ playerId: 'p_q' }), { lobby, matchmaker: mm }), 'queue');
  assert.equal(statusOf(s({ roomCode: 'S' }), { lobby, matchmaker: mm }), 'solo');
  assert.equal(statusOf(s({ roomCode: 'C' }), { lobby, matchmaker: mm }), 'alliance');
  assert.equal(statusOf(s({ roomCode: 'A' }), { lobby, matchmaker: mm }), 'mmplay');
  assert.equal(statusOf(s({ roomCode: 'L' }), { lobby, matchmaker: mm }), 'room');
  assert.equal(statusOf(s(), { lobby, matchmaker: mm }), 'online');
});

test('presence: guests go offline at once, a logged-in session keeps a 5-min grace', () => {
  const lobby = { getRoom: () => null, rooms: new Map(), mm: null };
  const mm = { byKey: new Map() };
  const loggedIn = { connected: false, accountId: 7, playerId: 'p', roomCode: null, disconnectedAt: 1000 };
  const guest = { connected: false, accountId: null, playerId: 'g', roomCode: null, disconnectedAt: 1000 };
  assert.equal(statusOf(guest, { lobby, matchmaker: mm, now: 1000 }), 'offline', 'guest: instant offline');
  assert.equal(statusOf(loggedIn, { lobby, matchmaker: mm, now: 1000 }), 'online', 'logged-in: still online on disconnect');
  assert.equal(statusOf(loggedIn, { lobby, matchmaker: mm, now: 1000 + 4 * 60 * 1000 }), 'online', 'within 5 min → online');
  assert.equal(statusOf(loggedIn, { lobby, matchmaker: mm, now: 1000 + 5 * 60 * 1000 + 1 }), 'offline', 'past 5 min → offline');
  const liveGuest = { connected: true, accountId: null, playerId: 'x', roomCode: null };
  assert.equal(statusOf(liveGuest, { lobby, matchmaker: mm, now: 0 }), 'online', 'a live guest is online');
});

test('buildSnapshot counts accounts, guests and statuses', () => {
  const auth = new AuthService({ db: openMemoryDb() });
  const a = auth.register('Hero', 'secret1');
  auth.register('Villain', 'secret1');
  const registry = new SessionRegistry({ now: () => 0 });
  const s1 = registry.create('Hero'); s1.connected = true; s1.accountId = a.account.id;
  const s2 = registry.create('Guest'); s2.connected = true;
  const lobby = { getRoom: () => null, rooms: new Map(), mm: null };
  const mm = { byKey: new Map(), stats: () => ({ queued: 0, buckets: 0 }) };

  const snap = buildSnapshot({ registry, lobby, matchmaker: mm, auth, now: 123 });
  assert.equal(snap.now, 123);
  assert.equal(snap.counts.accounts, 2);
  assert.equal(snap.counts.connected, 2);
  assert.equal(snap.counts.guests, 1);
  assert.equal(snap.counts.online, 1, 'Hero is idle-online');
  assert.equal(snap.counts.offline, 1, 'Villain has no live session');
  assert.equal(snap.online.length, 2);
  assert.equal(snap.online.filter((x) => x.accountId == null).length, 1);
  assert.equal(snap.accounts.find((x) => x.name === 'Hero').status, 'online');
  assert.equal(snap.accounts.find((x) => x.name === 'Villain').status, 'offline');
  assert.equal(snap.accounts.find((x) => x.name === 'Hero').playerId, s1.playerId);
  assert.equal(snap.accounts.find((x) => x.name === 'Villain').playerId, null);
  assert.ok(!('pass_hash' in snap.accounts[0]), 'never expose the hash');
});

test('account roles (ROLES) ride through both snapshots', () => {
  const auth = new AuthService({ db: openMemoryDb() });
  const a = auth.register('Admin', 'secret1');
  assert.equal(auth.setRole('Admin', 'admin').account.role, 'admin');
  const registry = new SessionRegistry({ now: () => 0 });
  const s = registry.create('Admin');
  s.connected = true; s.accountId = a.account.id; s.role = 'admin';
  const lobby = { getRoom: () => null, rooms: new Map(), mm: null };
  const mm = { byKey: new Map(), stats: () => ({ queued: 0, buckets: 0 }) };
  const snap = buildSnapshot({ registry, lobby, matchmaker: mm, auth, now: 0 });
  assert.equal(snap.accounts.find((x) => x.name === 'Admin').role, 'admin');
  assert.equal(snap.online.find((x) => x.name === 'Admin').role, 'admin');
  assert.equal(buildPublicSnapshot({ registry, lobby, matchmaker: null, now: 0 }).online[0].role, 'admin');
});

// 公开同盟 (docs/MATCHMAKING.md): /online/api `openRooms` lists joinable hand-made co-op rooms that the creator left
// public; private / solo / 野排(auto) / started / full rooms stay hidden.
test('buildPublicSnapshot.openRooms lists only public, joinable, hand-made 同盟 rooms', () => {
  const seat = (playerId, name, over = {}) => ({ playerId, name, isBot: false, left: false, ...over });
  const room = (over) => {
    const r = {
      mode: 'coop', public: true, match: null, auto: false, hostId: 'h', difficulty: 'NORMAL',
      seats: [seat('h', 'Host'), null, null, null], ...over,
    };
    r.seatOf = (id) => r.seats.find((s) => s && s.playerId === id) || null;
    r.freeSeat = () => r.seats.indexOf(null);
    return r;
  };
  const rooms = new Map(Object.entries({
    PUB: room({ code: 'PUB' }),
    BOT: room({ code: 'BOT', hostId: 'h2', seats: [seat('h2', 'H2'), seat('ai_1', 'Bot', { isBot: true }), null, null] }),
    PRIV: room({ code: 'PRIV', public: false }),
    AUTO: room({ code: 'AUTO', auto: true }),
    SOLO: room({ code: 'SOLO', mode: 'solo' }),
    RUN: room({ code: 'RUN', match: {} }),
    FULL: room({ code: 'FULL', seats: [seat('1', '1'), seat('2', '2'), seat('3', '3'), seat('4', '4')] }),
  }));
  const snap = buildPublicSnapshot({ registry: { all: () => [] }, lobby: { rooms }, matchmaker: null, now: 0 });
  assert.deepEqual(snap.openRooms.map((x) => x.code), ['PUB', 'BOT'], 'only public joinable hand-made co-op rooms, humans desc');
  assert.deepEqual(snap.openRooms[0], { code: 'PUB', difficulty: 'NORMAL', difficultyName: '险境模拟', host: 'Host', hostRole: null, humans: 1 });
  assert.equal(snap.openRooms[1].humans, 1, 'bots are not counted as humans');
});

test('GET /admin + /admin/api/state are token-gated', async () => {
  const srv = await startServer({ port: 0, quiet: true, accounts: true, db: openMemoryDb(), adminToken: 'testtok' });
  try {
    const base = `http://localhost:${srv.port}`;
    assert.match(srv.adminUrl, /\/admin\?token=testtok$/);
    assert.equal((await fetch(`${base}/admin`)).status, 403);
    assert.equal((await fetch(`${base}/admin/api/state?token=nope`)).status, 403);
    const html = await fetch(`${base}/admin?token=testtok`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /服务器管理/);
    const state = await fetch(`${base}/admin/api/state?token=testtok`);
    assert.equal(state.status, 200);
    const j = await state.json();
    assert.ok(j.counts && Array.isArray(j.accounts) && Array.isArray(j.online) && Array.isArray(j.rooms));
  } finally {
    await srv.close();
  }
});
