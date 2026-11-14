// test/lobby-versions.test.js — a room's official version (server/lobby.js): room.create { version }, the refusals
// (VERSION_UNKNOWN for one this server does not enable, VERSION_UNSUPPORTED for its missing data / gameplay plugins),
// room.state.version and welcome.versions, the room's data from the version (never the default singleton), and its
// match started in the version's own match host (kind 'version').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Lobby, Room } from '../server/lobby.js';
import { SessionRegistry } from '../server/net.js';
import { createVersionSets } from '../server/versions.js';
import { DATA_SHIM_JS } from '../server/http/static.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { DEFAULT_VERSION } from '../shared/versions.js';
import { ERR } from '../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VANILLA_CS = 'a'.repeat(64);
const ACT3 = 'act3autochess@V3_1';
const quiet = { info() {}, warn() {}, error() {}, debug() {} };

function versionSets() {
  return createVersionSets({
    simDir: path.join(ROOT, 'server', 'sim'), sharedDir: path.join(ROOT, 'shared'), shim: DATA_SHIM_JS,
    enabled: [DEFAULT_VERSION, ACT3], default: DEFAULT_VERSION, maxHosts: 1, vanilla: { cs: VANILLA_CS }, log: quiet,
  });
}

/** A lobby over the real version sets and a recording version-host pool. */
function makeLobby({ versions = versionSets(), versionHosts = recordingHosts(), content = { cs: VANILLA_CS } } = {}) {
  const registry = new SessionRegistry({ now: () => 0 });
  const lobby = new Lobby({ registry, content, versions, versionHosts, MatchClass: StubMatch, now: () => 1000, log: quiet });
  return { registry, lobby };
}

function recordingHosts() {
  const created = [];
  return {
    created,
    create(cs, opts) { created.push({ cs, opts }); return new StubMatch(opts); },
    stats: () => ({ workers: created.length ? 1 : 0, matches: created.length, transport: 'test' }),
  };
}

function session(registry, name) {
  const s = registry.create(name);
  s.connected = true;
  s.ws = { readyState: 1, bufferedAmount: 0, sent: [], send(raw) { this.sent.push(JSON.parse(raw)); } };
  return s;
}

test('room.create: a room without a version plays the default; a version room names it', (t) => {
  const { registry, lobby } = makeLobby();
  t.after(() => lobby.shutdown());
  const host = session(registry, 'Host');
  assert.deepEqual(lobby.create(host, { mode: 'coop', difficulty: 'NORMAL' }), { ok: true });
  const room = lobby.roomOf(host);
  assert.equal(room.version, DEFAULT_VERSION);
  assert.equal(room.content.cs, VANILLA_CS);
  assert.equal('version' in room.toState(), false, 'a default room.state keeps its shape');

  const other = session(registry, 'Other');
  assert.deepEqual(lobby.create(other, { mode: 'coop', difficulty: 'NORMAL', version: ACT3 }), { ok: true });
  const vroom = lobby.roomOf(other);
  const set = lobby.versions.byId(ACT3);
  assert.equal(vroom.version, ACT3);
  assert.equal(vroom.content.cs, set.cs);
  assert.equal(vroom.content.version, ACT3);
  assert.equal(vroom.content.vanilla, true);
  const state = vroom.toState();
  assert.equal(state.version, ACT3);
  assert.equal(state.content.cs, set.cs);
});

test('room.create: an unknown version is VERSION_UNKNOWN; missing data or a mode it lacks is VERSION_UNSUPPORTED', (t) => {
  const { registry, lobby } = makeLobby();
  t.after(() => lobby.shutdown());
  const s = session(registry, 'Host');
  assert.equal(lobby.create(s, { mode: 'coop', difficulty: 'NORMAL', version: 'nope' }).error, ERR.VERSION_UNKNOWN);
  assert.equal(lobby.create(s, { mode: 'coop', difficulty: 'NORMAL', version: 'act1autochess' }).error, ERR.VERSION_UNKNOWN);

  // an enabled version whose data failed to load is refused
  const unloaded = versionSets();
  const real = unloaded.available;
  unloaded.available = (id) => (id === ACT3 ? false : real(id));
  const { registry: r2, lobby: l2 } = makeLobby({ versions: unloaded });
  t.after(() => l2.shutdown());
  assert.equal(l2.create(session(r2, 'H2'), { mode: 'coop', difficulty: 'NORMAL', version: ACT3 }).error, ERR.VERSION_UNSUPPORTED);

  // a mode the version does not offer is refused
  const noSolo = versionSets();
  const realOffered = noSolo.offered;
  noSolo.offered = (id, mode) => (mode === 'solo' ? [] : realOffered(id, mode));
  const { registry: r3, lobby: l3 } = makeLobby({ versions: noSolo });
  t.after(() => l3.shutdown());
  assert.equal(l3.create(session(r3, 'H3'), { mode: 'solo', difficulty: 'NORMAL', version: ACT3 }).error, ERR.VERSION_UNSUPPORTED);
});

test('welcome.versions lists the enabled versions (default marked); a default-only server adds none', (t) => {
  const { lobby } = makeLobby();
  t.after(() => lobby.shutdown());
  const info = lobby.welcomeInfo();
  assert.deepEqual(info.versions.map((v) => v.id), [DEFAULT_VERSION, ACT3]);
  assert.equal(info.versions.find((v) => v.default)?.id, DEFAULT_VERSION);
  assert.equal(info.versions[1].cs, lobby.versions.byId(ACT3).cs);
  assert.equal(info.versions[1].family, 'regulation');

  const { lobby: l2 } = makeLobby({ versions: null });
  t.after(() => l2.shutdown());
  assert.equal('versions' in l2.welcomeInfo(), false);
  assert.equal(l2.defaultVersion(), DEFAULT_VERSION);
  assert.equal(l2.versionEnabled(ACT3), false);
});

test('the room data and a started match come from the version, and the match runs in its own host', (t) => {
  const hosts = recordingHosts();
  const { registry, lobby } = makeLobby({ versionHosts: hosts });
  t.after(() => lobby.shutdown());
  const s = session(registry, 'Host');
  assert.deepEqual(lobby.create(s, { mode: 'coop', difficulty: 'NORMAL', version: ACT3 }), { ok: true });
  const room = lobby.roomOf(s);
  const data = lobby.dataFor(room);
  assert.equal(data.config.season, 'act3autochess');
  assert.notEqual(data, lobby.safeData(), 'the version data is its own object');

  room.seats[1] = { seat: 1, playerId: 'ai_1', name: 'AI', isBot: true, ready: true, connected: true, left: false };
  assert.deepEqual(lobby.startMatch(room), { ok: true });
  assert.equal(hosts.created.length, 1);
  assert.equal(hosts.created[0].cs, room.content.cs);
  assert.equal(hosts.created[0].opts.version, ACT3);
  assert.equal(hosts.created[0].opts.requireCs, true);
  assert.equal(hosts.created[0].opts.data.config.season, 'act3autochess');
  assert.equal(room.match?.hosted, undefined, 'the recorder is not a proxy: the lobby still holds the instance');
});

test('gameplay plugins are refused on a version room; cosmetic ones keep its base', (t) => {
  const versions = versionSets();
  const set = versions.byId(ACT3);
  const plugins = {
    resolve(ids) {
      if (ids.includes('game')) return { ok: true, set: { cs: 'b'.repeat(64), plugins: [], warnings: [], bytes: 0 } };
      return { ok: true, set: { cs: undefined, vs: 'v1', plugins: [{ id: 'art' }], warnings: [], bytes: 0 } };
    },
  };
  const { lobby } = makeLobby({ versions });
  lobby.plugins = plugins;
  t.after(() => lobby.shutdown());
  const room = new Room('ABCD', 'coop', 'NORMAL', 0, ACT3);
  room.content = set.base;
  assert.equal(lobby.resolveContent(room, ['game']).error, ERR.VERSION_UNSUPPORTED);
  const ok = lobby.resolveContent(room, ['art']);
  assert.equal(ok.content.cs, set.cs);
  assert.equal(ok.content.version, ACT3);
  assert.equal(ok.content.vs, 'v1');
});
