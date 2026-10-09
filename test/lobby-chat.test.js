// test/lobby-chat.test.js — room text chat (同盟等待室 + 局内, docs/MATCHMAKING.md §38): `room.chat { text }` →
// `m.chat { from, name, text, at }`, broadcast to EVERY member of the room (seats + spectators) in the waiting lobby
// AND while the room's match runs; transient (no history / replay), length-capped, control-char-stripped, per-session
// rate-limited, and NEVER persisted (in memory only).

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR, CHAT_MAX, CHAT_RATE_LIMIT } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
const err = async (c, msg, code) => { const r = await c.request(msg); assert.equal(r.t, 'error', JSON.stringify(r)); assert.equal(r.code, code, JSON.stringify(r)); return r; };
const seatOf = (state, id) => state.seats.find((s) => s && s.playerId === id) || null;
async function createRoom(c, mode = 'coop') {
  await ok(c, { t: 'room.create', mode, difficulty: 'NORMAL' });
  return c.waitFor('room.state', (s) => s.hostId === c.id && s.mode === mode);
}
async function joinRoom(c, code) {
  await ok(c, { t: 'room.join', code });
  return c.waitFor('room.state', (s) => s.code === code && !!seatOf(s, c.id));
}

describe('room.chat protocol', () => {
  test('room.chat { text } — one required non-empty string, capped at CHAT_MAX', () => {
    assert.equal(validateC2S({ t: 'room.chat', text: '你好' }), null);
    assert.equal(validateC2S({ t: 'room.chat', text: 'x'.repeat(CHAT_MAX) }), null);
    assert.notEqual(validateC2S({ t: 'room.chat' }), null, 'text is required');
    assert.notEqual(validateC2S({ t: 'room.chat', text: '' }), null, 'empty');
    assert.notEqual(validateC2S({ t: 'room.chat', text: '   ' }), null, 'whitespace only');
    assert.notEqual(validateC2S({ t: 'room.chat', text: 'x'.repeat(CHAT_MAX + 1) }), null, 'over the cap');
    assert.notEqual(validateC2S({ t: 'room.chat', text: 42 }), null);
    assert.notEqual(validateC2S({ t: 'room.chat', text: { $gt: '' } }), null);
    // there is no history frame any more: the server never sends room.chat
    assert.equal(validateC2S({ t: 'room.chat', text: 'hi' }), null);
  });
});

describe('room.chat (lobby)', () => {
  let srv;
  let pool;
  const cap = quietLog();
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log: cap.log, MatchClass: StubMatch, chatRateLimit: CHAT_RATE_LIMIT, chatRateWindowMs: 10_000 });
    pool = clientPool(() => `ws://127.0.0.1:${srv.port}/ws`);
  });
  afterEach(async () => { await pool.closeAll(); });
  after(async () => {
    await srv?.close();
    assert.deepEqual(cap.errors, [], 'no server errors logged');
  });

  test('broadcast reaches the seats AND the spectators, with { from, name, text, at }; never another room', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    assert.equal(Object.hasOwn(st, 'chat'), false, 'room.state never carries chat');
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    const watcher = await pool.player('Watcher');
    await ok(watcher, { t: 'room.spectate', code: st.code });
    await watcher.waitFor('room.state', (s) => s.spectators.some((x) => x.playerId === watcher.id));

    // an outsider in another room must not receive it
    const other = await pool.player('Other');
    await createRoom(other);
    other.clearInbox();

    host.clearInbox(); guest.clearInbox(); watcher.clearInbox();
    const at = Date.now();
    await ok(host, { t: 'room.chat', text: '大家好' });
    for (const c of [host, guest, watcher]) {
      const msg = await c.waitFor('m.chat');
      assert.equal(msg.t, 'm.chat');
      assert.equal(msg.from, host.id);
      assert.equal(msg.name, 'Host');
      assert.equal(msg.text, '大家好');
      assert.ok(Number.isFinite(msg.at) && msg.at >= at - 1000, 'at is a server timestamp');
    }
    await other.expectNone('m.chat');

    // a spectator may chat too (room.chat is not a g.* intent; it is refused only outside a room)
    const seen = host.waitFor('m.chat', (m) => m.from === watcher.id);
    await ok(watcher, { t: 'room.chat', text: '观战发言' });
    assert.equal((await seen).text, '观战发言');
  });

  test('control characters are stripped and whitespace collapsed; an all-junk message is BAD_CHAT', async () => {
    const host = await pool.player('Host');
    await createRoom(host);
    const got = host.waitFor('m.chat');
    await ok(host, { t: 'room.chat', text: '  a\u0000b\u200bc   d  ' });
    const msg = await got;
    assert.equal(msg.text, 'abc d', 'control / zero-width stripped, whitespace collapsed, trimmed');
    await err(host, { t: 'room.chat', text: '\u0000\u200b\u0007' }, ERR.BAD_CHAT);
  });

  test('the length cap is enforced over the wire (BAD_MSG) and a rate-limited burst gets RATE', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    await err(host, { t: 'room.chat', text: 'x'.repeat(CHAT_MAX + 1) }, ERR.BAD_MSG);
    await err(host, { t: 'room.chat', text: '   ' }, ERR.BAD_MSG);
    for (let i = 0; i < CHAT_RATE_LIMIT; i++) await ok(host, { t: 'room.chat', text: `m${i}` });
    await err(host, { t: 'room.chat', text: 'one too many' }, ERR.RATE);
    // a different session is not affected by the burst
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    await ok(guest, { t: 'room.chat', text: 'ok' });
  });

  test('a player outside a room cannot chat (NOT_IN_ROOM)', async () => {
    const lone = await pool.player('Lone');
    await err(lone, { t: 'room.chat', text: 'hi' }, ERR.NOT_IN_ROOM);
  });

  test('chat works with no accounts DB at all (owner rule: in memory only, never persisted)', async () => {
    assert.equal(srv.db, null, 'the test server runs without the accounts SQLite database');
    const host = await pool.player('Host');
    await createRoom(host);
    await ok(host, { t: 'room.chat', text: 'in memory only' });
    assert.equal((await host.waitFor('m.chat')).text, 'in memory only');
  });

  test('in a running match the same room.chat still reaches seats AND spectators', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    await ok(guest, { t: 'room.ready', ready: true });
    await host.waitFor('room.state', (s) => seatOf(s, guest.id)?.ready === true);
    const watcher = await pool.player('Watcher');
    await ok(watcher, { t: 'room.spectate', code: st.code });
    await watcher.waitFor('room.state', (s) => s.spectators.some((x) => x.playerId === watcher.id));
    await ok(host, { t: 'room.start' });
    const inMatch = await host.waitFor('room.state', (s) => s.inMatch === true);
    assert.equal(inMatch.inMatch, true);

    host.clearInbox(); guest.clearInbox(); watcher.clearInbox();
    await ok(host, { t: 'room.chat', text: '局内聊天' });
    for (const c of [host, guest, watcher]) {
      const msg = await c.waitFor('m.chat', (m) => m.text === '局内聊天');
      assert.equal(msg.from, host.id);
    }
  });

  test('no history: a later joiner gets nothing past; a resumed member only gets NEW live messages', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    await ok(host, { t: 'room.chat', text: 'before join' });
    // a new member joining after the message must NOT receive any history
    const guest = await pool.player('Guest');
    guest.clearInbox();
    await joinRoom(guest, st.code);
    await guest.expectNone(null, (m) => m.t === 'room.chat' || (m.t === 'm.chat' && m.text === 'before join'));
    // a live message after joining does arrive
    const live = guest.waitFor('m.chat', (m) => m.text === 'after join');
    await ok(host, { t: 'room.chat', text: 'after join' });
    assert.equal((await live).text, 'after join');
  });

  test('leaving a room stops the broadcast to that session', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    await ok(host, { t: 'room.chat', text: 'while here' });
    await guest.waitFor('m.chat', (m) => m.text === 'while here');
    await ok(guest, { t: 'room.leave' });
    guest.clearInbox();
    await ok(host, { t: 'room.chat', text: 'after leave' });
    await guest.expectNone('m.chat');
  });
});

describe('room.chat is in memory only (owner rule: no DB, no disk, no history buffer)', () => {
  test('the schema / community service never mention chat; the lobby keeps nothing and writes no SQL / disk', () => {
    const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
    for (const rel of ['server/db.mjs', 'server/community.js']) {
      assert.doesNotMatch(read(rel), /chat/i, `${rel} must not mention chat / gain a chat table`);
    }
    const lobby = read('server/lobby.js');
    assert.doesNotMatch(lobby, /\bCREATE\s+TABLE\b|INSERT\s+INTO|UPDATE\s+\w+\s+SET|node:sqlite/i, 'no SQL in the lobby');
    assert.doesNotMatch(lobby, /\bwriteFileSync\b|\bappendFileSync\b|\bcreateWriteStream\b/, 'chat is never written to disk');
    assert.doesNotMatch(lobby, /this\.chat\s*=\s*\[/, 'no in-memory room chat buffer (transient only)');
    assert.doesNotMatch(lobby, /\bchat\s*[:=][^;]*JSON\.stringify/, 'chat is never serialised into a snapshot');
    assert.match(lobby, /t: 'm\.chat'/, 'the message is broadcast, not stored');
    assert.match(read('shared/protocol.js'), /'room\.chat': \{ text:/, 'room.chat is validated');
  });
});
