// test/server-stats.test.js — match statistics on the accounts SQLite (server/stats.js, shared/stats.js,
// server/db.mjs schema v5; docs/MATCHMAKING.md §40):
//   the v5 migration (match_stats + its indexes),
//   the service: insert / per-owner dedupe / newest-first list / per-account + per-guest isolation / clear,
//   the bounded storage (STATS_MAX_RECORDS, STATS_FULL_KEEP compaction, STATS_MAX_CHARS, the newest always kept),
//   the protocol validation (stats.submit / list / clear / view),
//   the lobby handlers end to end (a registered player AND a guest are stored; the social stats.view) and its privacy
//   guarantee (no account id / token ever crosses the wire).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openMemoryDb } from '../server/db.mjs';
import { StatsService } from '../server/stats.js';
import { Lobby } from '../server/lobby.js';
import { SessionRegistry } from '../server/net.js';
import { validateC2S } from '../shared/protocol.js';
import { buildRecord } from '../shared/stats.js';
import { STATS_MAX_RECORDS, STATS_FULL_KEEP } from '../shared/constants.js';
import { startServer } from '../server/index.js';
import { TestClient } from './helpers/wsClient.js';

/** A realistic m.result-ish record for `myId` (2 players, so a compaction is observable). */
function record(seed, myId = 'p1', over = {}) {
  return buildRecord({
    victory: true, roundsPassed: 12, hiddenReached: true, hiddenCleared: false, reason: 'hidden_cleared',
    teamLp: 20, modeId: 'mode_single_hard', difficulty: 'HARD', stageId: 'stage_hard', bossId: 'enemy_boss',
    seed, durationMs: 600000,
    players: [
      { playerId: myId, seat: 0, name: 'Me', isBot: false, left: false, alive: true, victory: true, roundsPassed: 12, bandId: 'band_amiya', stats: { kills: 3 } },
      { playerId: 'mate', seat: 1, name: 'Mate', isBot: false, left: false, alive: true, victory: true, roundsPassed: 9, bandId: 'band_fang', stats: { kills: 1 } },
    ],
    ...over,
  }, { myId, now: 1_000_000 + seed });
}

/** Add one account, returning its id (match_stats.account_id has a FK to accounts). */
function addAccount(db, name) {
  return Number(db.prepare('INSERT INTO accounts (name, name_lower, pass_hash, created_at) VALUES (?, ?, ?, ?)').run(name, name.toLowerCase(), 'x', 0).lastInsertRowid);
}

// ---- schema v5 -------------------------------------------------------------------------------------------------------

test('db migration v5: match_stats + its per-owner indexes exist', () => {
  const db = openMemoryDb();
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 5);
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index')").all().map((r) => r.name);
  assert.ok(names.includes('match_stats'), 'match_stats table');
  for (const idx of ['idx_match_stats_account_record', 'idx_match_stats_guest_record', 'idx_match_stats_account_ended', 'idx_match_stats_guest_ended']) {
    assert.ok(names.includes(idx), `${idx} index`);
  }
});

// ---- the service -----------------------------------------------------------------------------------------------------

test('StatsService: insert, newest first, per-owner dedupe', () => {
  const db = openMemoryDb();
  const aid = addAccount(db, 'Alice');
  const svc = new StatsService({ db });
  const a = record(1); const b = record(2);
  assert.equal(svc.submit({ accountId: aid, record: a }).ok, true);
  assert.equal(svc.submit({ accountId: aid, record: b }).ok, true);
  assert.equal(svc.submit({ accountId: aid, record: a }).deduped, true, 'the same record id is ignored');
  assert.equal(svc.count({ accountId: aid }), 2);
  assert.deepEqual(svc.list({ accountId: aid }).map((r) => r.seed), [2, 1], 'newest first');
  // a malformed record is refused
  assert.equal(svc.submit({ accountId: aid, record: { nope: 1 } }).error, 'BAD_STATS');
  assert.equal(svc.submit({ accountId: aid, record: null }).error, 'BAD_STATS');
});

test('StatsService: accounts and guests are isolated (no cross-owner read)', () => {
  const db = openMemoryDb();
  const a = addAccount(db, 'Alice'); const b = addAccount(db, 'Bob');
  const svc = new StatsService({ db });
  svc.submit({ accountId: a, record: record(1) });
  svc.submit({ accountId: b, record: record(2) });
  svc.submit({ guestId: 'p_guestA', record: record(3) });
  svc.submit({ guestId: 'p_guestB', record: record(4) });
  assert.equal(svc.count({ accountId: a }), 1);
  assert.equal(svc.count({ accountId: b }), 1);
  assert.equal(svc.count({ guestId: 'p_guestA' }), 1);
  assert.equal(svc.count({ guestId: 'p_guestB' }), 1);
  assert.equal(svc.list({ accountId: a })[0].seed, 1);
  assert.equal(svc.list({ guestId: 'p_guestA' })[0].seed, 3);
  // the same record id under two owners is two rows (the dedupe is per owner)
  svc.submit({ guestId: 'p_guestB', record: record(1) });
  assert.equal(svc.count({ guestId: 'p_guestB' }), 2);
  // clearing one owner leaves the others
  assert.equal(svc.clear({ accountId: a }), 1);
  assert.equal(svc.count({ accountId: a }), 0);
  assert.equal(svc.count({ accountId: b }), 1);
  assert.equal(svc.count({ guestId: 'p_guestA' }), 1);
  // a bad owner (both / neither key) is refused
  assert.equal(svc.submit({ accountId: a, guestId: 'p_x', record: record(9) }).error, 'BAD_STATS');
  assert.equal(svc.submit({ record: record(9) }).error, 'BAD_STATS');
  assert.deepEqual(svc.list({}), []);
});

test('StatsService: the row cap keeps the newest STATS_MAX_RECORDS', () => {
  const db = openMemoryDb();
  const aid = addAccount(db, 'Alice');
  const svc = new StatsService({ db, maxRecords: 5, fullKeep: 100, maxChars: 1e9 });
  for (let i = 0; i < 9; i++) svc.submit({ accountId: aid, record: record(i) });
  assert.equal(svc.count({ accountId: aid }), 5);
  assert.deepEqual(svc.list({ accountId: aid }).map((r) => r.seed), [8, 7, 6, 5, 4]);
});

test('StatsService: only the newest fullKeep keep their rows (older ones are compacted)', () => {
  const db = openMemoryDb();
  const aid = addAccount(db, 'Alice');
  const svc = new StatsService({ db, maxRecords: 100, fullKeep: 2, maxChars: 1e9 });
  for (let i = 0; i < 4; i++) svc.submit({ accountId: aid, record: record(i) });
  const list = svc.list({ accountId: aid });
  assert.equal(list.length, 4);
  assert.equal(list[0].compact, undefined, 'newest keep full rows');
  assert.equal(list[0].players.length, 2);
  assert.equal(list[1].compact, undefined);
  assert.equal(list[2].compact, true, 'older rows are compacted');
  assert.equal(list[2].players.length, 1, 'no teammates in a compact row');
});

test('StatsService: the character budget drops the oldest, never the newest', () => {
  const db = openMemoryDb();
  const aid = addAccount(db, 'Alice');
  const one = JSON.stringify(record(0)).length;
  const svc = new StatsService({ db, maxRecords: 100, fullKeep: 100, maxChars: one * 3 + 60 });
  for (let i = 0; i < 8; i++) svc.submit({ accountId: aid, record: record(i) });
  const n = svc.count({ accountId: aid });
  assert.ok(n >= 1 && n <= 3, `kept ${n}`);
  assert.ok(svc.chars({ accountId: aid }) <= one * 3 + 60);
  assert.equal(svc.list({ accountId: aid })[0].seed, 7, 'the newest is always kept');
});

// ---- the protocol ----------------------------------------------------------------------------------------------------

test('stats.* are validated C2S messages', () => {
  assert.equal(validateC2S({ t: 'stats.submit', record: { players: [{ playerId: 'p1' }] } }), null);
  assert.notEqual(validateC2S({ t: 'stats.submit' }), null, 'record required');
  assert.notEqual(validateC2S({ t: 'stats.submit', record: { players: [] } }), null, 'at least one player');
  assert.notEqual(validateC2S({ t: 'stats.submit', record: { players: Array.from({ length: 7 }, () => ({})) } }), null, 'at most 6 players');
  assert.equal(validateC2S({ t: 'stats.list' }), null);
  assert.equal(validateC2S({ t: 'stats.list', limit: 50 }), null);
  assert.notEqual(validateC2S({ t: 'stats.list', limit: 0 }), null);
  assert.equal(validateC2S({ t: 'stats.clear' }), null);
  assert.equal(validateC2S({ t: 'stats.view', name: 'Alice' }), null);
  assert.notEqual(validateC2S({ t: 'stats.view' }), null, 'name required');
  assert.notEqual(validateC2S({ t: 'stats.view', name: '' }), null);
});

// ---- the lobby handlers end to end (a registered player AND a guest; the social view + privacy) -----------------------

test('lobby: stats.submit / list / view / clear for a registered player and a guest (no identity leak)', async () => {
  const srv = await startServer({ port: 0, quiet: true, accounts: true, db: openMemoryDb() });
  const base = `ws://127.0.0.1:${srv.port}/ws`;
  try {
    const acc = srv.auth.register('Alice', 'secret1');
    const alice = await TestClient.connect(base);
    const aWelcome = await alice.hello('Alice', undefined, { accountToken: acc.token });
    assert.ok(aWelcome.playerId, 'registered session');
    const bob = await TestClient.connect(base);
    const bWelcome = await bob.hello('Bob');
    assert.ok(bWelcome.playerId, 'guest session');
    const alicePid = aWelcome.playerId;
    const bobPid = bWelcome.playerId;

    // a registered player submits and lists their own record
    const recA = record(1011, alicePid);
    assert.equal((await alice.request({ t: 'stats.submit', record: recA })).t, 'ok');
    alice.send({ t: 'stats.list' });
    const listA = await alice.waitFor('stats.records', (m) => m.scope === 'self');
    assert.equal(listA.records.length, 1);
    assert.equal(listA.owner.guest, false);
    assert.equal(listA.records[0].seed, 1011);

    // a guest is stored too (the owner key is the guest session identity)
    const recB = record(2022, bobPid);
    assert.equal((await bob.request({ t: 'stats.submit', record: recB })).t, 'ok');
    bob.send({ t: 'stats.list' });
    const listB = await bob.waitFor('stats.records', (m) => m.scope === 'self');
    assert.equal(listB.records.length, 1);
    assert.equal(listB.owner.guest, true);

    // isolation: neither list carries the other's record
    assert.deepEqual(listA.records.map((r) => r.seed), [1011]);
    assert.deepEqual(listB.records.map((r) => r.seed), [2022]);

    // a replayed submit is deduped (still one row)
    assert.equal((await alice.request({ t: 'stats.submit', record: recA })).t, 'ok');
    alice.send({ t: 'stats.list' });
    assert.equal((await alice.waitFor('stats.records', (m) => m.scope === 'self')).records.length, 1);

    // the social view: Alice reads Bob's public list by display name; and vice versa
    alice.send({ t: 'stats.view', name: 'Bob' });
    const viewBob = await alice.waitFor('stats.records', (m) => m.scope === 'other');
    assert.equal(viewBob.owner.name, 'Bob');
    assert.equal(viewBob.owner.guest, true);
    assert.deepEqual(viewBob.records.map((r) => r.seed), [2022]);

    bob.send({ t: 'stats.view', name: 'Alice' });
    const viewAlice = await bob.waitFor('stats.records', (m) => m.scope === 'other');
    assert.equal(viewAlice.owner.guest, false);
    assert.deepEqual(viewAlice.records.map((r) => r.seed), [1011]);

    // privacy: nothing that answers carries an account id, an account token or a session token
    const payload = JSON.stringify([listA, viewBob, viewAlice]);
    assert.ok(!payload.includes(acc.token), 'the account token never crosses the wire');
    assert.equal(/"accountId"|"account_id"|"email"|"token"|"accountToken"/.test(payload), false, 'no identity fields');
    for (const frame of [listA, viewBob, viewAlice]) {
      assert.deepEqual(Object.keys(frame.owner).sort(), ['guest', 'name', 'role'], 'the public owner carries name / role / guest only');
    }

    // an unknown / ambiguous name is refused (not leaked as "not found")
    const unknown = await alice.request({ t: 'stats.view', name: 'NobodyHere' });
    assert.equal(unknown.t, 'error');
    assert.equal(unknown.code, 'BAD_TARGET');

    // the owner clears their own records only
    assert.equal((await alice.request({ t: 'stats.clear' })).t, 'ok');
    alice.send({ t: 'stats.list' });
    assert.equal((await alice.waitFor('stats.records', (m) => m.scope === 'self')).records.length, 0);
    bob.send({ t: 'stats.list' });
    assert.equal((await bob.waitFor('stats.records', (m) => m.scope === 'self')).records.length, 1, "Bob's record is untouched");

    await alice.close();
    await bob.close();
  } finally {
    await srv.close();
  }
});

test('lobby: stats are disabled without a DB (guests-only server)', () => {
  const registry = new SessionRegistry();
  const lobby = new Lobby({ registry });
  const session = { accountId: null, playerId: 'p1', name: 'A', role: null };
  assert.equal(lobby.statsSubmit(session, { record: record(1) }).error, 'INTERNAL');
  assert.equal(lobby.statsList(session, {}).error, 'INTERNAL');
  assert.equal(lobby.statsClear(session).error, 'INTERNAL');
  assert.equal(lobby.statsView(session, { name: 'A' }).error, 'INTERNAL');
});

test('lobby: the 2× limits are the shared STATS_* ones (2000 rows / 60 full / 1.6M chars)', () => {
  assert.equal(STATS_MAX_RECORDS, 2000);
  assert.equal(STATS_FULL_KEEP, 60);
});
