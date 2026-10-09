// test/admin.test.js — the operations page (server/admin.js, docs/MATCHMAKING.md §13): status mapping,
// the snapshot shape/ Counts, token comparison, and the token-gated HTTP routes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusOf, buildSnapshot, buildPublicSnapshot, tokenMatches } from '../server/admin.js';
import { openMemoryDb } from '../server/db.mjs';
import { AuthService } from '../server/auth.js';
import { SessionRegistry } from '../server/net.js';
import { startServer } from '../server/index.js';
import { MAX_SEATS } from '../shared/constants.js';

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
// public; private / solo / 野排(auto) / started rooms stay hidden. A FULL lobby (no free seat) is listed too, flagged
// `full: true`, sorted after the joinable ones (owner 2026-10-09: 优先显示人不满的，满的显示观战).
test('buildPublicSnapshot.openRooms lists public hand-made 同盟 rooms, not-full first, a full lobby flagged last', () => {
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
  assert.deepEqual(snap.openRooms.map((x) => x.code), ['PUB', 'BOT', 'FULL'], 'public hand-made co-op rooms, not-full first, humans desc');
  assert.deepEqual(snap.openRooms[0], {
    code: 'PUB', difficulty: 'NORMAL', difficultyName: '险境模拟', host: 'Host', hostRole: null, humans: 1,
    full: false, freeSeats: 3,
    seats: [{ name: 'Host', role: null, guest: true, isBot: false, isHost: true }, null, null, null],
  });
  assert.equal(snap.openRooms[1].humans, 1, 'bots are not counted as humans');
  const full = snap.openRooms.find((x) => x.code === 'FULL');
  assert.equal(full.full, true, 'a full lobby is listed, flagged full');
  assert.equal(full.freeSeats, 0);
  assert.equal(full.humans, 4);
  assert.deepEqual(snap.openRooms.map((x) => x.full), [false, false, true], 'no full room before a joinable one');
});

// 公开房间 full lobby (docs/MATCHMAKING.md §36): a full room rides the public payload with the same privacy guarantees —
// only the public seat identity, never the internal playerId / account binding / address / token.
test('buildPublicSnapshot: a full lobby leaks no playerId / accountId / token (privacy holds for full rooms)', () => {
  const registry = new SessionRegistry({ now: () => 0 });
  const acc = registry.create('Acc'); acc.connected = true; acc.accountId = 7;
  const guest = registry.create('Guest'); guest.connected = true;
  const seat = (session) => ({ playerId: session.playerId, name: session.name, role: session.role ?? null, isBot: false, left: false });
  const r = {
    code: 'FULL', mode: 'coop', public: true, match: null, auto: false, hostId: acc.playerId, difficulty: 'HARD',
    seats: [seat(acc), seat(guest), { playerId: 'ai_2', name: 'Bot', role: null, isBot: true, left: false }, { playerId: 'p_4', name: 'Four', role: null, isBot: false, left: false }],
  };
  r.seatOf = (id) => r.seats.find((s) => s && s.playerId === id) || null;
  r.freeSeat = () => r.seats.indexOf(null);
  const snap = buildPublicSnapshot({ registry, lobby: { rooms: new Map([['FULL', r]]) }, matchmaker: null, now: 0 });
  const full = snap.openRooms.find((x) => x.code === 'FULL');
  assert.equal(full.full, true);
  assert.equal(full.seats.length, MAX_SEATS);
  const json = JSON.stringify(snap.openRooms);
  for (const leak of ['accountId', 'playerId', 'token', 'addr', acc.playerId, guest.playerId, 'p_4']) {
    assert.ok(!json.includes(leak), `leaks ${leak}`);
  }
});

// 公开房间 seat squares (docs/MATCHMAKING.md §36): every open / running room carries its MAX_SEATS seat cells — the
// public identity only (name, role, guest, AI, host), never the internal playerId, the account binding, an address or
// a token.
test('buildPublicSnapshot exposes per-seat identity (guest / AI / host) and no accountId / playerId / token', () => {
  const registry = new SessionRegistry({ now: () => 0 });
  const acc = registry.create('Acc'); acc.connected = true; acc.accountId = 7;
  const guest = registry.create('Guest'); guest.connected = true;
  const seat = (session, over = {}) => ({ playerId: session.playerId, name: session.name, role: session.role ?? null, isBot: false, left: false, ...over });
  const room = (over) => {
    const r = {
      code: 'SEAT', mode: 'coop', public: true, match: null, auto: false, hostId: acc.playerId, difficulty: 'HARD',
      seats: [seat(acc), seat(guest), { seat: 2, playerId: 'ai_seat', name: 'Bot', role: null, isBot: true, left: false }, null],
      ...over,
    };
    r.seatOf = (id) => r.seats.find((s) => s && s.playerId === id) || null;
    r.freeSeat = () => r.seats.indexOf(null);
    return r;
  };
  const rooms = new Map(Object.entries({
    SEAT: room(),
    RUN: room({
      code: 'RUN', match: {}, hostId: guest.playerId,
      seats: [seat(guest), null, null, { seat: 3, playerId: 'gone', name: 'Gone', isBot: false, left: true }],
    }),
  }));
  const snap = buildPublicSnapshot({ registry, lobby: { rooms }, matchmaker: null, now: 0 });
  const open = snap.openRooms.find((r) => r.code === 'SEAT');
  assert.equal(open.seats.length, MAX_SEATS, 'one entry per co-op seat');
  assert.deepEqual(open.seats, [
    { name: 'Acc', role: null, guest: false, isBot: false, isHost: true },
    { name: 'Guest', role: null, guest: true, isBot: false, isHost: false },
    { name: 'Bot', role: null, guest: false, isBot: true, isHost: false },
    null,
  ]);
  const run = snap.playRooms.find((r) => r.code === 'RUN');
  assert.equal(run.seats.length, MAX_SEATS);
  assert.equal(run.seats[0].guest, true, 'the guest host');
  assert.equal(run.seats[3], null, 'a seat its player left reads as empty');
  // privacy: the public rooms payload carries no internal id, account binding, address or token
  const json = JSON.stringify({ openRooms: snap.openRooms, playRooms: snap.playRooms });
  for (const leak of ['accountId', 'playerId', 'token', 'addr', acc.playerId, guest.playerId]) {
    assert.ok(!json.includes(leak), `leaks ${leak}`);
  }
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

// 通知 (docs/MATCHMAKING.md §28): POST /admin/api/notify pushes a sys.notice to the LIVE sessions — every logged-in
// account by default (`scope: 'all'` reaches guests too) — and keeps the broadcast in the state's `notices` history.
test('POST /admin/api/notify pushes sys.notice to the live sessions (scope, guards, history)', async () => {
  const srv = await startServer({ port: 0, quiet: true, accounts: true, db: openMemoryDb(), adminToken: 'testtok' });
  try {
    const base = `http://localhost:${srv.port}`;
    const fakeWs = () => ({ readyState: 1, bufferedAmount: 0, sent: [], send(d) { this.sent.push(d); } });
    const acc = srv.auth.register('Doctor', 'secret1').account;
    const doctor = srv.registry.create('Doctor');
    doctor.connected = true; doctor.accountId = acc.id; doctor.ws = fakeWs();
    const guest = srv.registry.create('Guest');
    guest.connected = true; guest.ws = fakeWs();
    const post = (body, token = 'testtok') => fetch(`${base}/admin/api/notify?token=${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal((await post({ text: 'x' }, 'nope')).status, 403, 'token required');
    assert.equal((await fetch(`${base}/admin/api/notify?token=testtok`)).status, 405, 'POST only');
    assert.equal((await post({ text: '   ' })).status, 400, 'empty text refused');

    // the default scope reaches logged-in accounts only
    const r1 = await post({ text: '服务器将在 5 分钟后重启更新', sign: 'd星空之下' });
    assert.equal(r1.status, 200);
    const j1 = await r1.json();
    assert.equal(j1.sent, 1);
    assert.equal(j1.notice.sign, 'd星空之下');
    assert.equal(doctor.ws.sent.length, 1);
    assert.equal(guest.ws.sent.length, 0, 'a guest is skipped for scope accounts');
    const frame = JSON.parse(doctor.ws.sent[0]);
    assert.deepEqual(
      { t: frame.t, text: frame.text, sign: frame.sign },
      { t: 'sys.notice', text: '服务器将在 5 分钟后重启更新', sign: 'd星空之下' },
    );

    // scope 'all' reaches guests too
    const j2 = await (await post({ text: '全部在线', sign: 'd星空之下', scope: 'all' })).json();
    assert.equal(j2.sent, 2);
    assert.equal(guest.ws.sent.length, 1);

    // the history rides in /admin/api/state, newest first
    const st = await (await fetch(`${base}/admin/api/state?token=testtok`)).json();
    assert.deepEqual(st.notices.map((n) => n.text), ['全部在线', '服务器将在 5 分钟后重启更新']);
    assert.equal(st.notices[0].sent, 2);
  } finally {
    await srv.close();
  }
});
