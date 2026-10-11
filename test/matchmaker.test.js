// test/matchmaker.test.js — the 野排 shared pool (server/matchmaker.js) and the Lobby's group→room bridging
// (docs/MATCHMAKING.md). Virtual time: no real timers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matchmaker } from '../server/matchmaker.js';
import { Lobby, Room } from '../server/lobby.js';
import { SessionRegistry } from '../server/net.js';
import { AuthService } from '../server/auth.js';
import { openMemoryDb } from '../server/db.mjs';
import { MM_WINDOW_MS } from '../shared/constants.js';

const S = (id) => ({ playerId: id, connected: true });

/** A Matchmaker with a fake clock (advance `ref.t`) and manual ticks. */
function make(ref) {
  const matches = [];
  const states = [];
  const m = new Matchmaker({
    now: () => ref.t, windowMs: MM_WINDOW_MS, seats: 4,
    setInterval: () => 1, clearInterval: () => {},
    onMatch: (sessions, info) => matches.push({ players: sessions.map((s) => s.playerId), difficulty: info.difficulty, ai: info.ai }),
    onState: (s, st) => states.push([s.playerId, st.queued]),
  });
  return { m, matches, states };
}

test('four gathered in one bucket start at once (no waiting)', () => {
  const ref = { t: 0 };
  const { m, matches } = make(ref);
  for (const id of ['a', 'b', 'c', 'd']) m.join({ key: id, session: S(id), difficulty: 'HARD' });
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0], { players: ['a', 'b', 'c', 'd'], difficulty: 'HARD', ai: 0 });
  assert.equal(m.queued, 0);
});

test('below four: the 5-minute window ends and AI fills the alliance', () => {
  const ref = { t: 0 };
  const { m, matches } = make(ref);
  m.join({ key: 'a', session: S('a'), difficulty: 'HARD' });
  m.join({ key: 'b', session: S('b'), difficulty: 'HARD' });
  m.tick();
  assert.equal(matches.length, 0, 'still waiting');
  ref.t = MM_WINDOW_MS;
  m.tick();
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0], { players: ['a', 'b'], difficulty: 'HARD', ai: 2 });
  assert.equal(m.queued, 0);
});

test('the pool window is MM_WINDOW_MS = 5 minutes (owner 2026-10-11)', () => {
  assert.equal(MM_WINDOW_MS, 300_000, 'up to 5 min, not 30 s');
  const ref = { t: 0 };
  const m = new Matchmaker({ now: () => ref.t, setInterval: () => 1, clearInterval: () => {} });
  m.join({ key: 'a', session: S('a'), difficulty: 'HARD' });
  assert.equal(m.state('a').deadlineMs - ref.t, MM_WINDOW_MS, 'the default deadline is join + the window');
  ref.t = MM_WINDOW_MS - 1; m.tick();
  assert.equal(m.queued, 1, 'a moment before 5 min: still waiting');
  ref.t = MM_WINDOW_MS; m.tick();
  assert.equal(m.queued, 0, 'at 5 min the window ends and AI fills the alliance');
  m.dispose();
});

test('a 5th player starts the next group; buckets are per difficulty', () => {
  const ref = { t: 0 };
  const { m, matches } = make(ref);
  for (const id of ['a', 'b', 'c', 'd', 'e']) m.join({ key: id, session: S(id), difficulty: 'HARD' });
  assert.equal(matches.length, 1, 'first four start');
  assert.equal(m.queued, 1, 'e waits');
  m.join({ key: 'f', session: S('f'), difficulty: 'NORMAL' });
  assert.equal(matches.length, 1, 'a different difficulty does not join the HARD group');
  assert.equal(m.queued, 2);
});

test('cancel / IN_QUEUE / NOT_QUEUED / disconnect, and state pushes ~1 Hz', () => {
  const ref = { t: 0 };
  const { m, states } = make(ref);
  assert.deepEqual(m.cancel('x'), { error: 'NOT_QUEUED' });
  m.join({ key: 'a', session: S('a'), difficulty: 'FUNNY' });
  assert.deepEqual(m.join({ key: 'a', session: S('a'), difficulty: 'FUNNY' }), { error: 'IN_QUEUE' });
  m.tick();
  assert.equal(states.length, 1, 'first tick pushes mm.state');
  m.tick();
  assert.equal(states.length, 1, 'throttled to ~1 Hz');
  ref.t = 1100; m.tick();
  assert.equal(states.length, 2);
  assert.deepEqual(m.cancel('a'), { ok: true });
  assert.equal(m.state('a'), null);
  m.join({ key: 'a', session: S('a'), difficulty: 'FUNNY' });
  m.leave('a'); // a disconnect
  assert.equal(m.queued, 0);
});

test('Lobby: a 野排 group becomes a ready co-op room, humans by queue order, AI fills the rest', () => {
  const registry = new SessionRegistry({ now: () => 0 });
  const lobby = new Lobby({ registry, now: () => 0, seedFn: () => 1 });
  let started = 0;
  lobby.startMatch = () => { started++; return { ok: true }; };
  const sessions = ['A', 'B'].map((n) => { const s = registry.create(n); s.connected = true; s.limitKey = 'k'; return s; });
  lobby.createMatchedRoom(sessions, { difficulty: 'HARD', ai: 2 });
  assert.equal(lobby.rooms.size, 1);
  const room = [...lobby.rooms.values()][0];
  assert.equal(room.mode, 'coop');
  assert.equal(room.difficulty, 'HARD');
  const humans = room.seats.filter((s) => s && !s.isBot);
  const bots = room.seats.filter((s) => s && s.isBot);
  assert.equal(humans.length, 2);
  assert.equal(bots.length, 2);
  assert.ok(humans.every((s) => s.ready), 'matched humans are auto-ready');
  assert.equal(room.hostId, sessions[0].playerId);
  assert.equal(started, 1);
  for (const s of sessions) assert.equal(s.roomCode, room.code);
});

test('Lobby: mm.join requires a bound account; mm.cancel answers', () => {
  const registry = new SessionRegistry({ now: () => 0 });
  const lobby = new Lobby({ registry, now: () => 0, auth: { resolve: () => null } });
  const s = registry.create('A');
  s.connected = true;
  assert.deepEqual(lobby.mmJoin(s, { difficulty: 'HARD' }), { error: 'AUTH_REQUIRED' });
  s.accountId = 7;
  assert.deepEqual(lobby.mmJoin(s, { difficulty: 'HARD' }), { ok: true });
  assert.equal(lobby.mm.queued, 1);
  assert.deepEqual(lobby.mmJoin(s, { difficulty: 'HARD' }), { error: 'IN_QUEUE' });
  lobby.mm.dispose();
});

test('Lobby: a queued player who creates / joins a room is dropped from the 野排 pool', () => {
  const registry = new SessionRegistry({ now: () => 0 });
  const lobby = new Lobby({ registry, now: () => 0, auth: { resolve: () => null }, seedFn: () => 1 });
  const a = registry.create('A'); a.connected = true; a.accountId = 1; a.limitKey = 'k';
  const b = registry.create('B'); b.connected = true; b.accountId = 2; b.limitKey = 'k';

  // A queues, then creates a room → out of the pool.
  assert.deepEqual(lobby.mmJoin(a, { difficulty: 'HARD' }), { ok: true });
  assert.equal(lobby.mm.queued, 1);
  assert.equal(lobby.create(a, { mode: 'coop', difficulty: 'HARD' }).error, undefined);
  assert.equal(lobby.mm.queued, 0, 'creating a room drops the queue slot');
  assert.equal(a.roomCode != null, true);

  // B queues, then joins A's room → out of the pool.
  assert.deepEqual(lobby.mmJoin(b, { difficulty: 'HARD' }), { ok: true });
  assert.equal(lobby.mm.queued, 1);
  assert.equal(lobby.join(b, { code: a.roomCode }).error, undefined);
  assert.equal(lobby.mm.queued, 0, 'joining a room drops the queue slot');

  // Defensive: `leave` drops any queue slot too (even when the session is in no room).
  const c = registry.create('C'); c.connected = true; c.accountId = 3;
  assert.deepEqual(lobby.mmJoin(c, { difficulty: 'HARD' }), { ok: true });
  assert.equal(lobby.mm.queued, 1);
  assert.deepEqual(lobby.leave(c), { error: 'NOT_IN_ROOM' });
  assert.equal(lobby.mm.queued, 0, 'leave dropped the queue slot');
  lobby.mm.dispose();
});

test('Lobby: a 野排 (auto) room disbands when the match ends; a hand-made room does not', () => {
  // A match that ends the instant it starts, so onMatchEnd runs synchronously.
  class QuickMatch {
    constructor(o) { this.o = o; }
    start() { this.o.onEnd({ victory: true }); }
    handle() { return { ok: true }; }
    onDisconnect() {}
    onReconnect() {}
    setLoadout() { return { ok: true }; }
    onLeave() {}
    dispose() {}
  }
  const registry = new SessionRegistry({ now: () => 0 });
  const lobby = new Lobby({ registry, MatchClass: QuickMatch, now: () => 0, seedFn: () => 1 });

  // 野排 group (auto) → the room is gone once the match ends and the players are detached.
  const sessions = ['A', 'B'].map((n) => { const s = registry.create(n); s.connected = true; s.limitKey = 'k'; s.accountId = 1; return s; });
  lobby.createMatchedRoom(sessions, { difficulty: 'HARD', ai: 2 });
  assert.equal(lobby.rooms.size, 0, 'the 野排 room is disbanded after the match');
  for (const s of sessions) assert.equal(s.roomCode, null, 'players detached');

  // Hand-made room → survives its match end (players stay to rematch).
  const s = registry.create('C'); s.connected = true; s.limitKey = 'k'; s.accountId = 2;
  assert.equal(lobby.create(s, { mode: 'coop', difficulty: 'HARD' }).error, undefined);
  assert.equal(lobby.rooms.size, 1);
  lobby.startMatch(lobby.roomOf(s), s.limitKey);
  assert.equal(lobby.rooms.size, 1, 'a hand-made room survives the match end');
  assert.equal(s.roomCode != null, true);

  lobby.shutdown('test');
});

test('Lobby: binding an account kicks the other live session of that account', () => {
  const registry = new SessionRegistry({ now: () => 0 });
  const lobby = new Lobby({ registry, now: () => 0 });
  const a = registry.create('A'); a.connected = true;
  const b = registry.create('B'); b.connected = true;
  let closed = null;
  a.ws = { close: (code, reason) => { closed = { code, reason }; } };
  lobby.bindAccount(a, { id: 7, name: 'A' }, 'tok1');
  assert.equal(a.accountId, 7);
  // The same account binds a second session → the first is unbound and its socket closed as REPLACED (4001).
  lobby.bindAccount(b, { id: 7, name: 'B' }, 'tok2');
  assert.equal(a.accountId, null, 'the older session is unbound');
  assert.ok(closed && closed.code === 4001, 'the older socket is closed as REPLACED');
  assert.equal(b.accountId, 7);
  lobby.mm.dispose();
});

test('Lobby.logout unbinds the account and invalidates its token', () => {
  const auth = new AuthService({ db: openMemoryDb() });
  const registry = new SessionRegistry({ now: () => 0 });
  const lobby = new Lobby({ registry, now: () => 0, auth });
  const r = auth.register('Lo', 'secret1');
  const s = registry.create('Lo'); s.connected = true;
  lobby.bindAccount(s, r.account, r.token);
  assert.equal(s.accountId, r.account.id);
  assert.deepEqual(lobby.logout(s), { ok: true });
  assert.equal(s.accountId, null);
  assert.equal(s.accountToken, null);
  assert.equal(auth.resolve(r.token), null, 'the token is invalidated server-side');
  // After logout the session is a guest again → 野排 is refused.
  assert.deepEqual(lobby.mmJoin(s, { difficulty: 'HARD' }), { error: 'AUTH_REQUIRED' });
  lobby.mm.dispose();
});

test('disposeRoom(matched-end) hands the result replay to a disconnected member', () => {
  const registry = new SessionRegistry({ now: () => 0 });
  const lobby = new Lobby({ registry, now: () => 0 });
  const a = registry.create('A'); a.connected = true; a.roomCode = 'ABCD';
  const b = registry.create('B'); b.connected = true; b.roomCode = 'ABCD';
  const room = new Room('ABCD', 'coop', 'HARD', 0);
  room.auto = true;
  room.hostId = a.playerId;
  room.seats[0] = { seat: 0, playerId: a.playerId, name: 'A', isBot: false, ready: true, connected: true, left: false };
  room.seats[1] = { seat: 1, playerId: b.playerId, name: 'B', isBot: false, ready: true, connected: true, left: false };
  lobby.rooms.set('ABCD', room);
  // A real result replay, and B dropped before the room was torn down (野排 rooms disband right after the result).
  room.replay = { publicFrame: 'PUB', frames: new Map([[b.playerId, 'RES']]), pending: new Set([a.playerId, b.playerId]) };
  b.connected = false; b.ws = null;

  lobby.disposeRoom(room, 'matched-end');
  assert.equal(b.notice, 'matched-end');
  assert.deepEqual(b.pendingResult, ['PUB', 'RES'], 'the offline member still gets room.closed + the settlement on resume');
  assert.equal(a.roomCode, null);
  assert.equal(lobby.rooms.size, 0);
  lobby.mm.dispose();
});
