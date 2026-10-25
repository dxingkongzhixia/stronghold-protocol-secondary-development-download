// test/admin.test.js — the operations page (server/admin.js, docs/MATCHMAKING.md §13): status mapping,
// the snapshot shape/ Counts, token comparison, and the token-gated HTTP routes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { statusOf, buildSnapshot, buildPluginSnapshot, buildPublicSnapshot, tokenMatches, writePluginPolicy, ADMIN_HTML, ADMIN_CSP_HASH } from '../server/admin.js';
import { openMemoryDb } from '../server/db.mjs';
import { AuthService } from '../server/auth.js';
import { SessionRegistry } from '../server/net.js';
import { startServer } from '../server/index.js';
import { zipFiles } from '../server/plugins/zip.js';
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
      mode: 'coop', public: true, match: null, auto: false, hostId: 'h', difficulty: 'NORMAL', content: null,
      seats: [seat('h', 'Host'), null, null, null], ...over,
      get modded() { return this.content?.vanilla === false; },
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
    full: false, freeSeats: 3, modded: false,
    seats: [{ name: 'Host', role: null, guest: true, isBot: false, isHost: true }, null, null, null],
  });
  assert.equal(snap.openRooms[1].humans, 1, 'bots are not counted as humans');
  const full = snap.openRooms.find((x) => x.code === 'FULL');
  assert.equal(full.full, true, 'a full lobby is listed, flagged full');
  assert.equal(full.freeSeats, 0);
  assert.equal(full.humans, 4);
  assert.deepEqual(snap.openRooms.map((x) => x.full), [false, false, true], 'no full room before a joinable one');
});

// 公开房间 directory (docs/MATCHMAKING.md §36, owner 2026-10-18): the screen asks `/online/api?all=1` and must see EVERY
// public room — the lobby's mini rows keep the capped default (12 open / 4 running) and slice themselves.
test('buildPublicSnapshot all:1 lifts the room caps for the 公开房间 screen; the default stays capped', () => {
  const seat = (playerId, name) => ({ playerId, name, isBot: false, left: false });
  const room = (code, over = {}) => {
    const r = { code, mode: 'coop', public: true, match: null, auto: false, hostId: 'h', difficulty: 'NORMAL', seats: [seat('h', 'Host'), null, null, null], ...over };
    r.seatOf = (id) => r.seats.find((s) => s && s.playerId === id) || null;
    r.freeSeat = () => r.seats.indexOf(null);
    return r;
  };
  const rooms = new Map();
  for (let i = 0; i < 20; i++) rooms.set(`OPEN${i}`, room(`OPEN${i}`, { seats: [seat(`h${i}`, `H${i}`), null, null, null] }));
  for (let i = 0; i < 9; i++) rooms.set(`RUN${i}`, room(`RUN${i}`, { match: {}, seats: [seat(`r${i}`, `R${i}`), null, null, null] }));
  const base = { registry: { all: () => [] }, lobby: { rooms }, matchmaker: null, now: 0 };
  const capped = buildPublicSnapshot(base);
  assert.equal(capped.openRooms.length, 12, 'the default payload keeps its cap');
  assert.equal(capped.playRooms.length, 4);
  const all = buildPublicSnapshot({ ...base, all: true });
  assert.equal(all.openRooms.length, 20, 'the directory sees every joinable room');
  assert.equal(all.playRooms.length, 9, 'and every running room');
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
    assert.equal((await fetch(`${base}/admin/api/speed?token=nope`)).status, 403, 'the speed probe is token-gated too');
    assert.equal((await fetch(`${base}/admin/api/origins?token=nope`)).status, 403, 'so is the origins config');
    const html = await fetch(`${base}/admin?token=testtok`);
    assert.equal(html.status, 200);
    const page = await html.text();
    assert.match(page, /服务器管理/);
    // The page's one inline script must be allowed by the response's CSP (the site policy hashes import
    // maps only). A missing hash makes every panel render empty in a browser, while the JSON API stays fine.
    const inline = /<script>([\s\S]*?)<\/script>/.exec(page)?.[1];
    assert.ok(inline, 'the admin page carries its script inline');
    const digest = createHash('sha256').update(inline).digest('base64');
    assert.equal(ADMIN_CSP_HASH, digest);
    assert.match(html.headers.get('content-security-policy') || '', new RegExp(`'sha256-${digest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
    const state = await fetch(`${base}/admin/api/state?token=testtok`);
    assert.equal(state.status, 200);
    const j = await state.json();
    assert.ok(j.counts && Array.isArray(j.accounts) && Array.isArray(j.online) && Array.isArray(j.rooms));
  } finally {
    await srv.close();
  }
});

test('admin documentation viewer: token-gated index, Markdown, assets and the docs shell', async () => {
  const srv = await startServer({ port: 0, quiet: true, accounts: true, db: openMemoryDb(), adminToken: 'testtok' });
  try {
    const base = `http://localhost:${srv.port}`;
    assert.equal((await fetch(`${base}/admin/docs`)).status, 403);
    assert.equal((await fetch(`${base}/admin/api/docs`)).status, 403);
    assert.equal((await fetch(`${base}/admin/api/docs/file?path=docs/README.md`)).status, 403);
    const page = await fetch(`${base}/admin/docs?token=testtok`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /\/js\/adminDocs\.js/);
    const index = await (await fetch(`${base}/admin/api/docs?token=testtok`)).json();
    assert.ok(index.ok && index.count > 20);
    assert.ok(index.files.some((f) => f.path === 'docs/README.md'));
    const doc = await (await fetch(`${base}/admin/api/docs/file?path=docs/README.md&token=testtok`)).json();
    assert.equal(doc.path, 'docs/README.md');
    assert.match(doc.markdown, /文档系统/);
    assert.equal((await fetch(`${base}/admin/api/docs/file?path=server/index.js&token=testtok`)).status, 404);
    assert.equal((await fetch(`${base}/admin/api/docs/file?path=docs/../README.md&token=testtok`)).status, 404);
    const image = await fetch(`${base}/admin/api/docs/asset?path=${encodeURIComponent('docs/img/band-draft.jpg')}&token=testtok`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/jpeg');
    const admin = await (await fetch(`${base}/admin?token=testtok`)).text();
    assert.match(admin, /href="\/admin\/docs"/);
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

    // the default scope reaches logged-in accounts only; a plain notice does NOT enter the changelog
    const clog0 = await (await fetch(`${base}/community/api/changelog`)).json();
    const r1 = await post({ text: '服务器将在 5 分钟后重启更新', sign: 'd星空之下' });
    assert.equal(r1.status, 200);
    const j1 = await r1.json();
    assert.equal(j1.sent, 1);
    assert.equal(j1.notice.sign, 'd星空之下');
    assert.equal(j1.notice.kind, 'plain');
    assert.equal(j1.changelog, null, 'a plain notice is not written to the changelog');
    assert.equal(doctor.ws.sent.length, 1);
    assert.equal(guest.ws.sent.length, 0, 'a guest is skipped for scope accounts');
    const frame = JSON.parse(doctor.ws.sent[0]);
    assert.deepEqual(
      { t: frame.t, text: frame.text, sign: frame.sign, kind: frame.kind },
      { t: 'sys.notice', text: '服务器将在 5 分钟后重启更新', sign: 'd星空之下', kind: 'plain' },
    );
    const clog1 = await (await fetch(`${base}/community/api/changelog`)).json();
    assert.equal(clog1.changelog.length, clog0.changelog.length, 'plain notices leave the log untouched');

    // scope 'all' reaches guests too
    const j2 = await (await post({ text: '全部在线', sign: 'd星空之下', scope: 'all' })).json();
    assert.equal(j2.sent, 2);
    assert.equal(guest.ws.sent.length, 1);

    // the changelog kind additionally appends the next minor version (source: notice)
    const j3 = await (await post({ text: '新增凯尔希策略调整', sign: 'd星空之下', changelog: true })).json();
    assert.match(j3.changelog.version, /^0\.4\.\d+$/);
    assert.equal(j3.notice.kind, 'changelog');
    assert.equal(j3.notice.version, j3.changelog.version);
    const clog2 = await (await fetch(`${base}/community/api/changelog`)).json();
    assert.equal(clog2.changelog.length, clog1.changelog.length + 1);
    assert.equal(clog2.changelog[0].version, j3.changelog.version);
    assert.equal(clog2.changelog[0].source, 'notice');
    assert.equal(clog2.changelog[0].body, '新增凯尔希策略调整');

    // where each session came from: the admin can see official / local / other, and a compact summary
    doctor.origin = 'https://mirror.example';
    guest.origin = 'https://strongholdprotocolcsym.top:10785';
    const st = await (await fetch(`${base}/admin/api/state?token=testtok`)).json();
    assert.deepEqual(st.notices.map((n) => n.text), ['新增凯尔希策略调整', '全部在线', '服务器将在 5 分钟后重启更新']);
    assert.equal(st.notices[0].sent, 1);
    assert.equal(st.notices[0].kind, 'changelog');
    assert.equal(st.notices[2].kind, 'plain');
    const drow = st.online.find((s) => s.playerId === doctor.playerId);
    const grow = st.online.find((s) => s.playerId === guest.playerId);
    assert.equal(drow.originKind, 'other', 'a mirror origin is visible in the online table');
    assert.equal(grow.originKind, 'official');
    assert.deepEqual(st.origins, {
      official: 1, local: 0, unknown: 0,
      other: [{ origin: 'https://mirror.example', count: 1 }],
    }, 'the summary answers "is anyone off the official address?"');
  } finally {
    await srv.close();
  }
});

// The page is one inline script: a template-literal `\n` in a JS string (the signing-key row) used to arrive as a real
// newline, so the browser refused the whole script and every panel stayed empty while the API was fine.
test('the admin page inline script parses', () => {
  const m = /<script>([\s\S]*?)<\/script>/.exec(ADMIN_HTML);
  assert.ok(m, 'the page carries one inline script');
  assert.doesNotThrow(() => new Function(m[1]));
});

// 后台控制台 (docs/MATCHMAKING.md §12.1, 2026-10-15): the page went from one long scrolling column to a sidebar
// console. These pin the INTERFACE only — the snapshot API, the notify / bug routes and the read-only stance are
// unchanged (the two tests above still cover them).
test('the admin page is a self-contained console: ten views, hash routing, searchable tables', () => {
  const html = ADMIN_HTML;
  const count = (re) => (html.match(re) || []).length;
  // still one self-contained document — no external stylesheet, script or font
  assert.ok(!/<link\b/i.test(html), 'no external <link>');
  assert.ok(!/<script[^>]+src=/i.test(html), 'no external <script src>');
  // the strings the route tests rely on
  assert.match(html, /服务器管理/);
  assert.match(html, /\/admin\/api\/bug\/image\//);
  // sidebar: ten nav buttons, each with its section (界面 = the classic/Hub main-interface switch)
  for (const v of ['overview', 'rooms', 'accounts', 'online', 'notice', 'bugs', 'plugins', 'speed', 'origins', 'ui']) {
    assert.ok(html.includes(`id="view-${v}"`), `section #view-${v} exists`);
    assert.ok(html.includes(`data-view="${v}"`), `nav button for ${v}`);
  }
  assert.equal(count(/<button class="nav__item" data-view="/g), 10, 'exactly ten nav buttons');
  assert.equal(count(/class="view"/g), 10, 'exactly ten view sections');
  // one view at a time, hash-routed (reload / bookmark / back land on the same view)
  assert.ok(html.includes('hashchange') && html.includes('setView(location.hash'), 'hash routing');
  assert.ok(html.includes("el('viewTitle')") && html.includes("el('viewSub')"), 'the header follows the view');
  // tables: head + body + a search box each, and sortable headers
  for (const k of ['rooms', 'accounts', 'online']) {
    for (const suffix of ['Head', 'Body', 'Search']) {
      assert.ok(html.includes(`id="${k}${suffix}"`), `${k}${suffix} exists`);
    }
  }
  assert.ok(count(/data-table="/g) === 3 && html.includes('th[data-key]'), 'three tables with sortable headers');
  assert.ok(html.includes('aria-label="反馈图片"'), 'the image viewer stays');
  // the polling contract is unchanged: 2 s, the same route and parameters
  assert.ok(html.includes('/admin/api/state?token='), 'state polling');
  assert.ok(html.includes('setInterval(tick, 2000)'), 'still every 2 s');
  assert.ok(html.includes('bugStatus=') && html.includes('bugSort='), 'the bug filter / sort params still ride the poll');
  assert.ok(html.includes('visibilitychange'), 'pauses while hidden and refreshes on return');
  assert.ok(html.includes('if (painted && document.hidden) return;'), 'the first paint happens even in a hidden tab');
  // dashboard bits
  assert.ok(html.includes('id="cards"') && html.includes('id="dist"') && html.includes('id="runtime"'), 'overview panels');
  assert.ok(html.includes("'玩家'") && html.includes("'对局'"), 'the KPI cards are grouped');
  // 测速 (docs/MATCHMAKING.md §12.2): both vantages and the client's own rule
  assert.ok(html.includes('id="speedRun"') && html.includes('id="speedBody"') && html.includes('id="speedVerdict"'), 'the speed view is wired');
  assert.ok(html.includes('/admin/api/speed?token='), 'it asks the server to probe the origins');
  assert.ok(html.includes('measureFromBrowser(') && html.includes('readCappedInPage('), 'and times the same URLs from this browser');
  // 来源配置 (docs/MATCHMAKING.md §12.3): the origins edited in place, saved through the API
  assert.ok(html.includes('id="originsList"') && html.includes('id="originsSave"') && html.includes('id="originsRevert"'), 'the origins view is wired');
  assert.ok(html.includes('/admin/api/origins?token='), 'it reads and writes the origins config');
  // 商城管理: metadata/listing edits and packaging an installed plugin
  assert.ok(html.includes('id="marketBody"') && html.includes('id="publishBtn"'), 'the market manager is wired');
  assert.ok(html.includes('id="pluginDrawer"') && html.includes('id="drawerSave"'), 'metadata edits use the side drawer');
  assert.ok(html.includes('id="drawerRelated"') && html.includes('id="themeToggle"'), 'related bindings and the theme switch are wired');
  assert.ok(html.includes('id="pluginImportBtn"') && html.includes('/admin/api/market/import'), 'the admin import surface is wired');
  assert.ok(html.includes('id="keyBody"') && html.includes('id="keyAdd"'), 'the signing-key registry is wired');
  assert.ok(html.includes('id="pluginSearch"') && html.includes('data-psub="installed"'), 'search and the installed subview are wired');
  assert.ok(html.includes('id="pluginCats"') && html.includes('插件分类'), 'the category filter row is wired');
  assert.ok(html.includes('id="drawerCategory"') && html.includes('id="drawerCategoryRow"'), 'the drawer can regroup an entry');
  assert.ok(html.includes('/admin/api/market?token='), 'it writes marketplace metadata through the admin API');
  assert.ok(html.includes('/admin/api/plugins/ai'), 'the reserved AI surface is documented in the page');
  for (const route of ['/admin/api/notify', '/admin/api/bug/status']) {
    assert.ok(html.includes(route + '?token='), `${route} is wired`);
  }
});


test('GET /admin/api/plugins/ai reserves the AI takeover surface behind the admin token', async () => {
  const srv = await startServer({ port: 0, quiet: true, accounts: true, db: openMemoryDb(), adminToken: 'testtok' });
  try {
    const base = `http://localhost:${srv.port}`;
    assert.equal((await fetch(`${base}/admin/api/plugins/ai`)).status, 403);
    const cap = await fetch(`${base}/admin/api/plugins/ai?token=testtok`);
    assert.equal(cap.status, 200);
    const doc = await cap.json();
    assert.equal(doc.reserved, true);
    assert.equal(doc.executor, false);
    assert.deepEqual(doc.actions, ['preview', 'edit', 'publish', 'test', 'approve', 'reject']);
    const post = await fetch(`${base}/admin/api/plugins/ai?token=testtok`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(post.status, 501, 'no AI executor is enabled by default');
  } finally {
    await srv.close();
  }
});

test('POST /admin/api/plugins/install and /uninstall move a plugin folder', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-admin-install-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const zip = zipFiles([{
    name: 'plugin.json',
    data: Buffer.from(JSON.stringify({ manifest: 2, id: 'installed-demo', name: 'Demo', version: '1.0.0', class: 'cosmetic', app: '>=0.4.0 <0.5.0', api: 1 })),
  }]);
  const srv = await startServer({ port: 0, quiet: true, pluginsDir: dir, adminToken: 'testtok', accounts: true, db: openMemoryDb() });
  try {
    const base = `http://localhost:${srv.port}`;
    const install = await fetch(`${base}/admin/api/plugins/install?token=testtok`, { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: zip });
    assert.equal(install.status, 200, await install.text());
    assert.ok(fs.existsSync(path.join(dir, 'installed-demo', 'plugin.json')));
    const uninstall = await fetch(`${base}/admin/api/plugins/uninstall?token=testtok`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'installed-demo' }) });
    assert.equal(uninstall.status, 200);
    assert.equal(fs.existsSync(path.join(dir, 'installed-demo')), false);
    assert.ok(fs.readdirSync(path.join(dir, '_removed')).length > 0);
  } finally {
    await srv.close();
  }
});

test('read-only admin token can read but not write', async () => {
  const srv = await startServer({ port: 0, quiet: true, accounts: true, db: openMemoryDb(), adminToken: 'testtok', adminReadonlyToken: 'readtok' });
  try {
    const base = `http://localhost:${srv.port}`;
    assert.equal((await fetch(`${base}/admin/api/state?token=readtok`)).status, 200);
    assert.equal((await fetch(`${base}/admin/api/notify?token=readtok`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"text":"x","sign":"x"}' })).status, 403);
    assert.equal((await fetch(`${base}/admin/api/state?token=testtok`)).status, 200);
  } finally {
    await srv.close();
  }
});

test('buildPluginSnapshot: installed entries, notices, skipped diagnostics and the owner policy', (t) => {
  const forgeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-admin-forge-'));
  t.after(() => fs.rmSync(forgeDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(forgeDir, 'forge-import.json'), JSON.stringify({
    version: 1, pack: { id: 'rose-pack', name: 'Rose pack', version: '1.0.0' }, primary: 'demo',
    products: [{ id: 'demo', class: 'content', dir: 'plugins/demo' }], skipped: 2, assumed: 1, partial: true,
    importedAt: '2026-10-20T00:00:00.000Z',
  }));
  const registry = {
    plugins: () => [{
      id: 'demo', class: 'content', status: 'loaded', bytes: 2048, where: forgeDir,
      manifest: { name: 'Demo', version: '1.2.3', api: 2, app: '>=0.3.0 <0.5.0', scope: ['room'], category: 'enemy', permissions: ['data'], notices: [{ id: 'n1', title: 'Hi', body: 'Body', date: '2026-10-19' }] },
      content: {},
    }, {
      id: 'faction-yan', class: 'content', status: 'loaded', builtin: true, source: 'builtin',
      manifest: { name: '炎', version: '1.0.0', category: 'faction', scope: ['room'] },
      content: {},
    }],
    report: () => ({ skipped: [{ id: 'bad', problems: ['no manifest'] }], warnings: ['one warning'] }),
  };
  const policy = { get: () => ({ rooms: 'host', default: [], allow: ['*'], classes: { cosmetic: true, content: true }, maxSets: 4, allowIncompatible: ['demo'] }) };
  const p = buildPluginSnapshot({ registry, policy, contents: { stats: () => ({ sets: 2, held: 1, builds: 3 }) }, market: { list: () => [{ id: 'demo', status: 'active' }] } });
  assert.equal(p.installed[0].id, 'demo');
  assert.equal(p.installed[0].name, 'Demo');
  assert.equal(p.installed[0].hasContent, true);
  assert.deepEqual([p.installed[0].category, p.installed[0].declaredCategory, p.installed[0].builtin], ['enemy', 'enemy', false]);
  assert.deepEqual([p.installed[1].category, p.installed[1].builtin], ['faction', true], 'the built-in faction plugin is marked and grouped');
  assert.deepEqual(p.installed[0].notices, [{ id: 'n1', title: 'Hi', body: 'Body', date: '2026-10-19' }]);
  assert.deepEqual(p.installed[0].forge.pack, { id: 'rose-pack', name: 'Rose pack', version: '1.0.0' });
  assert.equal(p.installed[0].forge.skipped, 2);
  assert.equal(p.installed[0].forge.assumed, 1);
  assert.equal(p.installed[0].forge.partial, true);
  assert.equal(p.skipped[0].id, 'bad');
  assert.deepEqual(p.warnings, ['one warning']);
  assert.equal(p.policy.rooms, 'host');
  assert.equal(p.policy.maxSets, 4);
  assert.deepEqual(p.policy.allowIncompatible, ['demo']);
  assert.equal(typeof p.probe.requests, 'number');
  assert.deepEqual(p.contentSets, { sets: 2, held: 1, builds: 3 });
  assert.deepEqual(p.market, [{ id: 'demo', status: 'active' }]);
  assert.deepEqual(buildPluginSnapshot(null).installed, []);
});

test('writePluginPolicy: safe fields only, preserves trusted pins, records an audit line', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-admin-policy-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, JSON.stringify({ trusted: { demo: 'pin' }, allowDownloadHosts: ['example.test'] }));
  const r = writePluginPolicy({ pluginsDir: dir, root: dir, now: Date.UTC(2026, 9, 20), body: {
    rooms: 'fixed', default: ['demo'], allow: ['demo'], classes: { content: true },
    limits: { maxSets: 2 }, allowIncompatible: ['demo'],
  } });
  assert.equal(r.ok, true);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.rooms, 'fixed');
  assert.deepEqual(saved.default, ['demo']);
  assert.deepEqual(saved.allowIncompatible, ['demo']);
  assert.deepEqual(saved.trusted, { demo: 'pin' }, 'trusted pins are not editable here');
  assert.deepEqual(saved.allowDownloadHosts, ['example.test']);
  assert.match(fs.readFileSync(path.join(dir, 'var', 'admin-audit.log'), 'utf8'), /plugin-policy/);
  assert.match(writePluginPolicy({ pluginsDir: dir, body: { trusted: {} } }).error, /unsupported/);
  assert.match(writePluginPolicy({ pluginsDir: dir, body: { limits: { maxSets: 999 } } }).error, /maxSets/);
});

test('POST /admin/api/plugin-policy writes the safe policy fields and refuses trusted edits', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-admin-policy-http-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ trusted: { demo: 'pin' } }));
  const srv = await startServer({ port: 0, quiet: true, pluginsDir: dir, adminToken: 'testtok', accounts: true, db: openMemoryDb() });
  t.after(() => srv.close());
  const base = srv.url;
  const post = (body, token = 'testtok') => fetch(`${base}/admin/api/plugin-policy?token=${token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await fetch(`${base}/admin/api/plugin-policy`)).status, 403);
  assert.equal((await fetch(`${base}/admin/api/plugin-policy?token=testtok`)).status, 405);
  assert.equal((await post({ trusted: {} })).status, 400, 'trusted pins are owner-local');
  const ok = await post({ rooms: 'fixed', default: ['demo'], allow: ['demo'], classes: { content: true }, limits: { maxSets: 1 }, allowIncompatible: true });
  assert.equal(ok.status, 200);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
  assert.equal(saved.rooms, 'fixed');
  assert.deepEqual(saved.trusted, { demo: 'pin' });
  assert.equal(saved.allowIncompatible, true);
});
