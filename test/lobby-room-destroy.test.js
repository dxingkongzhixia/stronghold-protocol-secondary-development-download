// test/lobby-room-destroy.test.js — the owner's rule: a room exists only while it has at least one human PLAYER.
// The last human leaving (leave / disconnect / grace / kick / releaseSeat) destroys the room — an all-AI game never
// lingers, spectators never keep a room alive, and /online/api never lists a human-less room.
// docs/MATCHMAKING.md §20 / §35.5 / §17.4.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { buildPublicSnapshot } from '../server/admin.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR, MAX_SEATS } from '../shared/constants.js';

const GRACE = 80;

function clientPool(getUrl) {
  const open = new Set();
  return {
    async connect() { const c = await TestClient.connect(getUrl()); open.add(c); return c; },
    async player(name, token) {
      const c = await this.connect();
      const w = await c.hello(name, token);
      c.id = w.playerId;
      c.token = w.token;
      return c;
    },
    async closeAll() {
      await Promise.all([...open].map((c) => c.terminate().catch(() => {})));
      open.clear();
    },
  };
}
const quietLog = () => {
  const errors = [];
  return { errors, log: { info() {}, warn() {}, debug() {}, error: (...a) => errors.push(a.map(String).join(' ')) } };
};
const ok = async (c, msg) => { const r = await c.request(msg); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
const createRoom = async (c, mode = 'coop', difficulty = 'NORMAL') => {
  await ok(c, { t: 'room.create', mode, difficulty });
  return c.waitFor('room.state', (s) => s.hostId === c.id && s.mode === mode);
};

/** Poll a server-side predicate (no event to wait for when the room simply vanishes). */
async function until(fn, timeoutMs, what) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (fn()) return;
    await delay(10);
  }
  assert.fail(`timed out waiting for ${what}`);
}

describe('a room without human players is destroyed (owner rule)', () => {
  let srv;
  let pool;
  const cap = quietLog();
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log: cap.log, MatchClass: StubMatch, lobbyGraceMs: GRACE });
    pool = clientPool(() => `ws://127.0.0.1:${srv.port}/ws`);
  });
  afterEach(async () => { await pool.closeAll(); });
  after(async () => {
    await srv?.close();
    assert.deepEqual(cap.errors, [], 'no server errors logged');
  });

  test('a public lobby room: the last human leaving destroys it (never a 1/4-with-AI entry)', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    await ok(host, { t: 'room.addBot' });
    await host.waitFor('room.state', (s) => s.seats[1] && s.seats[1].isBot);
    // it is listed while a human is in it
    let snap = buildPublicSnapshot({ registry: srv.registry, lobby: srv.lobby, matchmaker: srv.lobby.mm, now: 0 });
    assert.ok(snap.openRooms.some((r) => r.code === st.code && r.humans === 1));
    // the last human leaves → the room (its AI seats included) is gone, not a humans:0 entry
    await ok(host, { t: 'room.leave' });
    await until(() => srv.lobby.getRoom(st.code) === null, 1000, 'the room to be disposed');
    snap = buildPublicSnapshot({ registry: srv.registry, lobby: srv.lobby, matchmaker: srv.lobby.mm, now: 0 });
    assert.ok(!snap.openRooms.some((r) => r.code === st.code), 'not listed as 组队中');
    assert.ok(!snap.openRooms.some((r) => r.humans === 0), 'no humans:0 room is ever listed');
  });

  test('a public lobby room: the last human disconnecting destroys it after the grace', async () => {
    const lone = await pool.player('Lone');
    const st = await createRoom(lone);
    await ok(lone, { t: 'room.addBot' });
    await lone.terminate();
    await until(() => srv.lobby.getRoom(st.code) === null, GRACE + 1500, 'the abandoned room to be disposed');
    const snap = buildPublicSnapshot({ registry: srv.registry, lobby: srv.lobby, matchmaker: srv.lobby.mm, now: 0 });
    assert.ok(!snap.openRooms.some((r) => r.code === st.code));
  });

  test('mid-match: a leaver with a human left is kept (AI takeover); the last human leaving destroys match + room', async () => {
    const host = await pool.player('MHost');
    const st = await createRoom(host);
    await ok(host, { t: 'room.addBot' });
    await ok(host, { t: 'room.start' });
    await host.waitFor('m.public');
    const spec = await pool.player('MSpec');
    await ok(spec, { t: 'room.spectate', code: st.code });
    await ok(spec, { t: 'room.takeOver', seat: 1 }); // the spectator plays seat 1
    await spec.waitFor('room.state', (s) => s.seats[1] && s.seats[1].playerId === spec.id);

    // the host leaves mid-match with another human present → its seat goes to a fresh AI, the room lives on
    await ok(host, { t: 'g.leave' });
    const kept = await spec.waitFor('room.state', (s) => s.inMatch && s.seats[0] && s.seats[0].isBot);
    assert.ok(srv.lobby.getRoom(st.code), 'the room is kept while a human plays');
    assert.equal(kept.seats[0].playerId.startsWith('ai_'), true);

    // the last human releases its taken-over AI seat → 0 human players → the running match + room are disposed
    await ok(spec, { t: 'room.releaseSeat' });
    await until(() => srv.lobby.getRoom(st.code) === null, 1000, 'the human-less running room to be disposed');
    const snap = buildPublicSnapshot({ registry: srv.registry, lobby: srv.lobby, matchmaker: srv.lobby.mm, now: 0 });
    assert.ok(!snap.playRooms.some((r) => r.code === st.code), 'not listed as 对局中');
    assert.ok(!snap.playRooms.some((r) => r.humans === 0));
  });

  test('a spectator-only room (the last human releases its taken-over seat in the lobby) is destroyed', async () => {
    const host = await pool.player('RHost');
    const st = await createRoom(host);
    await ok(host, { t: 'room.addBot' });
    const spec = await pool.player('RSpec');
    await ok(spec, { t: 'room.spectate', code: st.code });
    await ok(spec, { t: 'room.takeOver', seat: 1 });
    await spec.waitFor('room.state', (s) => s.seats[1] && s.seats[1].playerId === spec.id);
    // the other human leaves first → the taken-over human is the last player
    await ok(host, { t: 'room.leave' });
    await spec.waitFor('room.state', (s) => s.seats[0] === null && s.hostId === spec.id);
    // release the seat: no human player is left (we are only watching) → the room is destroyed, not kept alive
    await ok(spec, { t: 'room.releaseSeat' });
    const closed = await spec.waitFor('room.closed');
    assert.equal(closed.reason, 'empty');
    await until(() => srv.lobby.getRoom(st.code) === null, 1000, 'the spectator-only room to be disposed');
  });

  test('buildPublicSnapshot never lists a human-less room (defensive)', () => {
    const bot = (i) => ({ seat: i, playerId: `ai_${i}`, name: `AI${i}`, role: null, isBot: true, ready: true, connected: true, left: false });
    const zombie = {
      code: 'ZOMB', mode: 'coop', public: true, auto: false, match: null, difficulty: 'NORMAL',
      hostId: null, seats: Array.from({ length: MAX_SEATS }, (_, i) => bot(i)), spectators: [],
      freeSeat: () => -1, seatOf: () => null,
    };
    const running = { ...zombie, code: 'ZRUN', public: false, match: {}, hostId: null };
    const snap = buildPublicSnapshot({ registry: { all: () => [] }, lobby: { rooms: new Map([['ZOMB', zombie], ['ZRUN', running]]) }, matchmaker: null, now: 0 });
    assert.deepEqual(snap.openRooms, [], 'a human-less 组队中 room is not listed');
    assert.deepEqual(snap.playRooms, [], 'a human-less 对局中 room is not listed');
    assert.ok(!JSON.stringify(snap).includes('"humans":0'), 'no humans:0 anywhere in the snapshot');
  });
});

// Unknown-code / not-in-room errors on the fix's new disposal path must not regress.
test('releaseSeat outside a room is still NOT_IN_ROOM', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, MatchClass: StubMatch, lobbyGraceMs: GRACE });
  const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
  await c.hello('Nobody');
  const r = await c.request({ t: 'room.releaseSeat' });
  assert.equal(r.t, 'error');
  assert.equal(r.code, ERR.NOT_IN_ROOM);
  await c.terminate();
  await srv.close();
});
