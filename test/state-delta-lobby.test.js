// test/state-delta-lobby.test.js — the two wiring points of the delta transport, without a socket:
//   1. server/lobby.js broadcastRoom -> sendSession: a negotiated connection gets `m.state` (full, then patches),
//      a connection that did not negotiate keeps the plain `m.public` frames;
//   2. public/js/net.js _onMessage: `m.state` frames are decoded back into the m.public / m.private messages the rest
//      of the client already listens for, and a gap asks the server for one resync (rate-limited).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Lobby } from '../server/lobby.js';
import { SessionRegistry } from '../server/net.js';
import { negotiateStateDelta } from '../server/stateTransport.js';
import { STATE_DELTA_VERSION } from '../shared/stateDelta.js';
import { Net } from '../public/js/net.js';

const WS_OPEN = 1; // the server-side constant (server/net.js); sendRaw skips any other readyState
const fakeWs = () => {
  const frames = [];
  return { frames, readyState: WS_OPEN, bufferedAmount: 0, send(data, cb) { frames.push(String(data)); cb?.(); } };
};

test('broadcastRoom: the negotiated connection gets m.state (full then patch); the other keeps m.public', () => {
  const lobby = new Lobby({ registry: new SessionRegistry(), content: { cs: 'ab'.repeat(32) }, plugins: { resolve: () => null, unofficial: () => 0 } });
  const delta = fakeWs();
  const plain = fakeWs();
  lobby.memberSessions = () => [{ connected: true, ws: delta }, { connected: true, ws: plain }];
  const room = { disposed: false, code: 'TEST' };
  negotiateStateDelta(delta, STATE_DELTA_VERSION);

  const first = { t: 'm.public', round: 1, players: [{ id: 'p_0', hp: 10, board: Array.from({ length: 30 }, (_, i) => ({ uid: i, row: 10, col: 2 })) }] };
  lobby.broadcastRoom(room, first);
  const second = structuredClone(first);
  second.round = 2;
  second.players[0].hp = 9;
  lobby.broadcastRoom(room, second);

  assert.equal(delta.frames.length, 2);
  const f0 = JSON.parse(delta.frames[0]);
  assert.equal(f0.t, 'm.state');
  assert.equal(f0.kind, 'm.public');
  assert.ok('full' in f0, 'the first frame is a full one');
  assert.deepEqual(f0.full, first);
  const f1 = JSON.parse(delta.frames[1]);
  assert.equal(f1.t, 'm.state');
  assert.equal(f1.base, 1, 'the second frame is a patch on the first');
  assert.ok(Array.isArray(f1.patch) && f1.patch.length > 0);

  assert.equal(plain.frames.length, 2);
  for (const frame of plain.frames) {
    const m = JSON.parse(frame);
    assert.equal(m.t, 'm.public', 'a connection that did not negotiate keeps the plain frame');
  }
  assert.deepEqual(JSON.parse(plain.frames[1]), second);
});

test('the browser Net decodes m.state into m.public, and a lost delta asks for one rate-limited resync', async () => {
  const net = new Net({ WebSocket: class { close() {} } });
  const seen = [];
  net.on('m.public', (m) => seen.push(m));
  const sent = [];
  net.request = (t) => { sent.push(t); return Promise.resolve({ t: 'ok' }); };

  const view = { t: 'm.public', round: 1, players: [{ id: 'p_0', hp: 10 }] };
  net._onMessage(JSON.stringify({ t: 'm.state', kind: 'm.public', seq: 1, full: view }));
  assert.deepEqual(seen[0], view, 'a full frame reaches the m.public listeners');

  const next = { t: 'm.public', round: 2, players: [{ id: 'p_0', hp: 9 }] };
  const { diffState } = await import('../shared/stateDelta.js');
  net._onMessage(JSON.stringify({ t: 'm.state', kind: 'm.public', seq: 2, base: 1, patch: diffState(view, next) }));
  assert.deepEqual(seen[1], next, 'a patch is applied and emitted as m.public');

  // a gap: the channel waits, and one resync request goes out (a second gap inside the window does not ask again)
  net._onMessage(JSON.stringify({ t: 'm.state', kind: 'm.public', seq: 5, base: 4, patch: [] }));
  net._onMessage(JSON.stringify({ t: 'm.state', kind: 'm.public', seq: 6, base: 5, patch: [] }));
  assert.equal(seen.length, 2, 'nothing was emitted from the gap');
  assert.deepEqual(sent, ['state.resync'], 'exactly one resync request');

  // the server's full frame puts the channel back in service
  const resumed = { t: 'm.public', round: 3, players: [{ id: 'p_0', hp: 8 }] };
  net._onMessage(JSON.stringify({ t: 'm.state', kind: 'm.public', seq: 7, full: resumed }));
  assert.deepEqual(seen[2], resumed);
  net.close?.();
});
