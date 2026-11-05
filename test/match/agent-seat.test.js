// test/match/agent-seat.test.js — agent seats (docs/AGENT-SEATS.md): a host mints a one-time invite for an AI seat, an
// ordinary WebSocket session redeems it and plays through the same intent path as a human. No API key, no outbound call.
//
// Covers P0: invite delivery (host only, never in room.state), claim in the lobby and mid-match (Match.takeOver re-key),
// one-time use / unknown / expired tokens, removal of the seat, and the seat lock that keeps another spectator out.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

import { startServer } from '../../server/index.js';
import { Match } from '../../server/match/Match.js';
import { TestClient } from '../helpers/wsClient.js';
import { EMOTES, ERR } from '../../shared/constants.js';

async function boot(opts = {}) {
  const logLines = [];
  const log = {
    info: (...a) => logLines.push(a.map(String).join(' ')),
    warn: (...a) => logLines.push(a.map(String).join(' ')),
    error: (...a) => logLines.push(a.map(String).join(' ')),
    debug() {},
  };
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, assetIndex: false, studio: false, agentSeats: true, log, ...opts });
  const url = `ws://127.0.0.1:${srv.port}/ws`;
  const open = new Set();
  const connect = async (name) => {
    const c = await TestClient.connect(url);
    open.add(c);
    const w = await c.hello(name);
    c.id = w.playerId;
    c.token = w.token;
    return c;
  };
  return {
    srv, logLines, connect, url,
    async close() {
      await Promise.all([...open].map((c) => c.terminate().catch(() => {})));
      await srv.close();
    },
  };
}

const ok = async (c, msg) => {
  const r = await c.request(msg);
  assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`);
  return r;
};
const err = async (c, msg, code) => {
  const r = await c.request(msg);
  assert.equal(r.t, 'error', `expected ${code} for ${msg.t}, got ${JSON.stringify(r)}`);
  assert.equal(r.code, code, `${msg.t}: ${JSON.stringify(r)}`);
  return r;
};

test('agent seat: any seated human can invite; agent claims the bot seat; reuse, wrong and spectator attempts are refused', async () => {
  const s = await boot();
  try {
    const host = await s.connect('AgentHost');
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    await ok(host, { t: 'room.addBot' });
    const before = await host.waitFor('room.state', (st) => st.seats[1] && st.seats[1].isBot);
    const code = before.code;

    // a second REAL human joins (seat 2) — invites are not host-only
    const peer = await s.connect('AgentPeer');
    await ok(peer, { t: 'room.join', code });
    await peer.waitFor('room.state', (st) => st.seats.some((x) => x && x.playerId === peer.id));
    // a spectator is not a player: it may not invite, but a seated human may
    const watcher = await s.connect('AgentWatcher');
    await ok(watcher, { t: 'room.spectate', code });
    await watcher.waitFor('room.state', (st) => st.spectators.some((x) => x.playerId === watcher.id));
    await err(watcher, { t: 'room.agentInvite', seat: 1 }, ERR.SPECTATOR);

    await ok(peer, { t: 'room.agentInvite', seat: 1, ttlSec: 600 });
    const invite = await peer.waitFor('agent.invite');
    assert.equal(invite.seat, 1);
    assert.equal(invite.code, code);
    assert.ok(invite.expiresAt > Date.now());
    assert.ok(typeof invite.token === 'string' && invite.token.length >= 32, '32-byte token');
    // the plaintext is not broadcast: the host's state frame carries the reserved bot seat, not the token
    const reserved = await host.waitFor('room.state', (st) => st.seats[1] && st.seats[1].isBot);
    assert.equal(JSON.stringify(reserved).includes(invite.token), false);

    // a spectator cannot take the reserved seat while the invite is live
    await err(watcher, { t: 'room.takeOver', seat: 1 }, ERR.BAD_TARGET);

    // the agent is an ordinary session: hello, then redeem
    const agent = await s.connect('AgentOne');
    await ok(agent, { t: 'agent.claim', token: invite.token });
    const claimed = await host.waitFor('room.state', (st) => st.seats[1] && st.seats[1].playerId === agent.id);
    assert.equal(claimed.seats[1].isBot, false);
    assert.equal(claimed.seats[1].agent, true);
    assert.equal(claimed.seats[1].fromAi, true);
    assert.equal(claimed.seats[1].connected, true);
    // the plaintext never appears in a state frame
    assert.equal(JSON.stringify(claimed).includes(invite.token), false);
    // the agent is a player, not a spectator
    assert.equal(claimed.spectators.some((x) => x.playerId === agent.id), false);

    // rule: an agent may chat like a human (ordinary room.chat, no special case)
    await ok(agent, { t: 'room.chat', text: 'hello from the agent' });
    const chat = await host.waitFor('m.chat', (m) => m.from === agent.id);
    assert.equal(chat.text, 'hello from the agent');

    // owner coaching: only the inviter may send it, and it reaches the agent privately
    await ok(peer, { t: 'agent.coach', text: '优先升级商店' });
    const directive = await agent.waitFor('agent.directive', (m) => m.text === '优先升级商店');
    assert.equal(directive.from, 'AgentPeer');
    await err(host, { t: 'agent.coach', text: 'buy this' }, ERR.BAD_TARGET);
    await err(watcher, { t: 'agent.coach', text: 'buy this' }, ERR.SPECTATOR);
    await err(peer, { t: 'agent.coach', text: 'x'.repeat(201) }, ERR.BAD_MSG);

    // one-time: a fresh session reusing the token is refused
    const late = await s.connect('AgentLate');
    await err(late, { t: 'agent.claim', token: invite.token }, ERR.BAD_TARGET);
    // an unknown / malformed token is refused too
    const other = await s.connect('AgentOther');
    const bogus = 'A'.repeat(43);
    await err(other, { t: 'agent.claim', token: bogus }, ERR.BAD_TARGET);

    // a session already in a room cannot claim another seat
    await err(host, { t: 'agent.claim', token: bogus }, ERR.ALREADY);

    // the token never reaches the log
    const joined = s.logLines.join('\n');
    assert.equal(joined.includes(invite.token), false, 'plaintext token must not be logged');
    assert.match(joined, /agent AgentOne claimed seat 1/);
    // P2 ops: /healthz exposes the switch, occupied seats and lifetime counters
    const health = await (await fetch(`${s.srv.url}/healthz`)).json();
    assert.equal(health.agents.enabled, true);
    assert.equal(health.agents.seated, 1);
    assert.equal(health.agents.claims, 1);
  } finally {
    await s.close();
  }
});

test('agent seat: seat rules, expiry and bot removal invalidate the invite', async () => {
  const s = await boot();
  try {
    const host = await s.connect('AgentHost2');
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'HARD' });
    await ok(host, { t: 'room.addBot' });
    const st = await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].isBot);

    // inviting a human seat or an empty seat is refused
    await err(host, { t: 'room.agentInvite', seat: 0 }, ERR.BAD_TARGET);
    await err(host, { t: 'room.agentInvite', seat: 2 }, ERR.BAD_TARGET);

    // a short-lived invite expires (bounds allow 1 s for tests)
    await ok(host, { t: 'room.agentInvite', seat: 1, ttlSec: 1 });
    const short = await host.waitFor('agent.invite');
    await delay(1100);
    const late = await s.connect('AgentLate2');
    await err(late, { t: 'agent.claim', token: short.token }, ERR.BAD_TARGET);

    // a fresh invite, then the host removes the bot: the seat is gone, the token is dead
    await ok(host, { t: 'room.agentInvite', seat: 1 });
    const second = await host.waitFor('agent.invite');
    await ok(host, { t: 'room.removeBot', seat: 1 });
    const after = await host.waitFor('room.state', (x) => x.seats[1] === null);
    assert.equal(after.seats[1], null);
    await err(late, { t: 'agent.claim', token: second.token }, ERR.BAD_TARGET);

    // a new invite for the same seat replaces the previous token (only the latest works)
    await ok(host, { t: 'room.addBot' });
    await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].isBot);
    await ok(host, { t: 'room.agentInvite', seat: 1 });
    const first = await host.waitFor('agent.invite');
    await ok(host, { t: 'room.agentInvite', seat: 1 });
    const latest = await host.waitFor('agent.invite');
    assert.notEqual(first.token, latest.token);
    const agent = await s.connect('AgentOne2');
    await err(agent, { t: 'agent.claim', token: first.token }, ERR.BAD_TARGET);
    await ok(agent, { t: 'agent.claim', token: latest.token });
    await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].playerId === agent.id);

    // solo rooms never issue invites
    const solo = await s.connect('AgentSolo');
    await ok(solo, { t: 'room.create', mode: 'solo', difficulty: 'NORMAL' });
    const soloState = await solo.waitFor('room.state', (x) => x.mode === 'solo');
    assert.ok(soloState);
    await err(solo, { t: 'room.agentInvite', seat: 0 }, ERR.BAD_TARGET);
    assert.equal(st.code.length, 4);
  } finally {
    await s.close();
  }
});

test('agent seat: the global switch is off unless enabled', async () => {
  const s = await boot({ agentSeats: false });
  try {
    const host = await s.connect('AgentOff');
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    await ok(host, { t: 'room.addBot' });
    await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].isBot);
    await err(host, { t: 'room.agentInvite', seat: 1 }, ERR.BAD_TARGET);
    const health = await (await fetch(`${s.srv.url}/healthz`)).json();
    assert.equal(health.agents.enabled, false);
    assert.equal(health.agents.seated, 0);
  } finally {
    await s.close();
  }
});

test('agent seat: a clients-only server still accepts invites (a real browser executes the field)', async () => {
  const s = await boot({ clientsOnly: true });
  try {
    const host = await s.connect('COHost');
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    await ok(host, { t: 'room.addBot' });
    await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].isBot);
    await ok(host, { t: 'room.agentInvite', seat: 1 });
    const invite = await host.waitFor('agent.invite');
    const agent = await s.connect('COAgent');
    await ok(agent, { t: 'agent.claim', token: invite.token });
    const state = await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].agent);
    assert.equal(state.seats[1].agent, true);
  } finally {
    await s.close();
  }
});

test('agent seat: the owner may coach an offline agent; the directive is replayed on reconnect', async () => {
  const s = await boot({ agentGraceMs: 5000 });
  try {
    const host = await s.connect('CoachHost');
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    const room = await host.waitFor('room.state', (x) => x.hostId === host.id);
    await ok(host, { t: 'room.addBot' });
    await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].isBot);
    const peer = await s.connect('CoachPeer');
    await ok(peer, { t: 'room.join', code: room.code });
    await peer.waitFor('room.state', (x) => x.seats.some((y) => y && y.playerId === peer.id));
    await ok(peer, { t: 'room.agentInvite', seat: 1 });
    const invite = await peer.waitFor('agent.invite');
    const agent = await s.connect('CoachAgent');
    await ok(agent, { t: 'agent.claim', token: invite.token });
    await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].agent && x.seats[1].agentOwner === peer.id);
    const token = agent.token;
    await agent.terminate();
    // the owner is still here: the directive is stored on the seat and replayed when the agent returns
    await ok(peer, { t: 'agent.coach', text: '下一轮先铺满棋盘' });
    const back = await TestClient.connect(s.url);
    await back.hello('CoachAgent', token);
    const replayed = await back.waitFor('agent.directive', (m) => m.text === '下一轮先铺满棋盘', 2000);
    assert.equal(replayed.text, '下一轮先铺满棋盘');
    await back.terminate();
  } finally {
    await s.close();
  }
});

test('agent seat: rule B — the seat follows the inviter (disconnect grace, reconnect, explicit leave)', async () => {
  const s = await boot({ agentGraceMs: 200 });
  try {
    const host = await s.connect('BoundHost');
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    const room = await host.waitFor('room.state', (x) => x.hostId === host.id);
    await ok(host, { t: 'room.addBot' });
    await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].isBot);
    const peer = await s.connect('BoundPeer');
    await ok(peer, { t: 'room.join', code: room.code });
    await peer.waitFor('room.state', (x) => x.seats.some((y) => y && y.playerId === peer.id));
    await ok(peer, { t: 'room.agentInvite', seat: 1 });
    const invite = await peer.waitFor('agent.invite');
    const agent = await s.connect('BoundAgent');
    await ok(agent, { t: 'agent.claim', token: invite.token });
    await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].playerId === agent.id && x.seats[1].agent);

    // a disconnect is only a grace: the inviter reconnects inside it and keeps the agent seat
    await peer.terminate();
    await delay(40);
    const back = await TestClient.connect(s.url);
    const welcome = await back.hello('BoundPeer', peer.token);
    assert.equal(welcome.resumed, true);
    await delay(350);
    const still = await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].playerId === agent.id, 2000);
    assert.equal(still.seats[1].agent, true, 'reconnect inside the grace keeps the agent');

    // an explicit leave releases the seat at once and detaches the still-connected agent
    await ok(back, { t: 'room.leave' });
    const handed = await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].isBot, 2000);
    assert.ok(handed.seats[1].playerId.startsWith('ai_'));
    const closed = await agent.waitFor('room.closed', (m) => m.reason === 'agent-owner-left', 2000);
    assert.equal(closed.reason, 'agent-owner-left');
    await back.terminate();
  } finally {
    await s.close();
  }
});

test('agent seat: rule B — an offline inviter cannot be used to claim a new seat', async () => {
  const s = await boot({ agentGraceMs: 5000 });
  try {
    const host = await s.connect('BoundHost2');
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    const room = await host.waitFor('room.state', (x) => x.hostId === host.id);
    await ok(host, { t: 'room.addBot' });
    await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].isBot);
    const peer = await s.connect('BoundPeer2');
    await ok(peer, { t: 'room.join', code: room.code });
    await peer.waitFor('room.state', (x) => x.seats.some((y) => y && y.playerId === peer.id));
    await ok(peer, { t: 'room.agentInvite', seat: 1 });
    const invite = await peer.waitFor('agent.invite');
    await peer.terminate();
    const agent = await s.connect('BoundAgent2');
    await err(agent, { t: 'agent.claim', token: invite.token }, ERR.BAD_TARGET);
  } finally {
    await s.close();
  }
});

test('agent seat: the disconnect grace hands the seat back to the built-in bot', async () => {
  const s = await boot({ agentGraceMs: 150 });
  try {
    const host = await s.connect('AgentHost4');
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    await ok(host, { t: 'room.addBot' });
    await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].isBot);
    await ok(host, { t: 'room.agentInvite', seat: 1 });
    const invite = await host.waitFor('agent.invite');
    const agent = await s.connect('AgentDrop');
    await ok(agent, { t: 'agent.claim', token: invite.token });
    await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].playerId === agent.id);

    const token = agent.token;
    await agent.terminate();
    // after the short grace the seat is the built-in bot again (and the token no longer leads into the room)
    const back = await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].isBot, 3000);
    assert.ok(back.seats[1].playerId.startsWith('ai_'), 'a fresh AI holds the seat');
    assert.equal(back.seats[1].agent, undefined);

    const resumed = await TestClient.connect(s.url);
    const welcome = await resumed.hello('AgentBack', token);
    assert.equal(welcome.resumed, true);
    const closed = await resumed.waitFor('room.closed');
    assert.equal(closed.reason, 'agent-timeout');
    await resumed.terminate();
  } finally {
    await s.close();
  }
});

test('agent seat: mid-match claim re-keys the bot state and the agent plays through ordinary intents', async () => {
  let captured = null;
  class RecordingMatch extends Match {
    constructor(opts) {
      super({ ...opts, botRehearsal: 0, botSliceMs: 0.001 });
      captured = this;
    }
  }
  const s = await boot({ MatchClass: RecordingMatch, seedFn: () => 4242 });
  try {
    const host = await s.connect('AgentHost3');
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    await ok(host, { t: 'room.addBot' });
    const room = await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].isBot);
    assert.ok(room);
    await ok(host, { t: 'room.start' });
    await host.waitFor('m.public', (p) => p.phase === 'INFO_CHECK');
    assert.ok(captured, 'the match instance is live');
    const bot = [...captured.players.values()].find((p) => p.seat === 1);
    assert.ok(bot && bot.isBot, 'seat 1 is a bot at the start');
    const botId = bot.playerId;

    await ok(host, { t: 'room.agentInvite', seat: 1 });
    const invite = await host.waitFor('agent.invite');
    const agent = await s.connect('AgentMid');
    await ok(agent, { t: 'agent.claim', token: invite.token });

    // the lobby seat and the match's PlayerState are the agent's now — same object, same board/gold/loadout
    const claimed = await host.waitFor('room.state', (x) => x.seats[1] && x.seats[1].playerId === agent.id);
    assert.equal(claimed.inMatch, true);
    const ps = captured.players.get(agent.id);
    assert.ok(ps, 'the match knows the agent playerId');
    assert.equal(ps, bot, 'the bot PlayerState was re-keyed, not recreated');
    assert.equal(ps.isBot, false);
    assert.equal(ps.agent, true);
    assert.equal(ps.connected, true);
    assert.equal(captured.players.has(botId), false);
    // it is a player, so it gets its own private view and can act
    const priv = await agent.waitFor('m.private', (p) => p.seat === 1);
    assert.equal(priv.seat, 1);
    await ok(agent, { t: 'g.infoReady' });
    // rule: an agent plays and emotes through the ordinary intent path
    await ok(agent, { t: 'g.emote', id: EMOTES[0] });
    await host.waitFor('m.emote', (m) => m.playerId === agent.id);
    await ok(host, { t: 'g.infoReady' });
    await host.waitFor('m.public', (p) => p.phase === 'BAND_DRAFT', 15000);
    assert.equal(captured.errorCount, 0);
  } finally {
    await s.close();
  }
});

test('agent client: the lobby keeper puts the seat back to ready after the host changes the room', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { keepReady } = await import('../../tools/agent/agent.mjs');
  const sent = [];
  const conn = { id: 'p_ag', room: { seats: [{ playerId: 'p_ag', ready: false }] }, send: (m) => sent.push(m) };
  try {
    keepReady(conn);
    t.mock.timers.tick(1000);
    assert.deepEqual(sent, [{ t: 'room.ready', ready: true }], 'a cleared lobby flag is put back');
    conn.room.seats[0].ready = true;
    t.mock.timers.tick(1000);
    assert.equal(sent.length, 1, 'already ready: silent');
    conn.room.inMatch = true;
    conn.room.seats[0].ready = false;
    t.mock.timers.tick(1000);
    assert.equal(sent.length, 1, 'a running match keeps its own g.ready');
  } finally {
    clearInterval(conn.readyTimer);
    conn.readyTimer = null;
  }
});

test('agent client: a setup reroll is agreed by default; the server no longer counts agent seats as voters', async () => {
  const { nextAction } = await import('../../tools/agent/player.mjs');
  const info = { phase: 'INFO_CHECK', players: [{ playerId: 'p_ag', ready: true }] };
  const priv = {};
  // an older server still lists the agent as a voter: agree instead of leaving the host at 1/2
  const vote = { id: 4, voters: ['p_h', 'p_ag'], agreed: ['p_h'] };
  assert.deepEqual(nextAction({ pub: { ...info, rerollVote: vote }, priv, myId: 'p_ag' }).msg,
    { t: 'g.rerollVote', voteId: 4, agree: true });
  // the current server filters agent seats out of the voters, so no vote is sent; readiness is still confirmed
  assert.equal(nextAction({ pub: { ...info, rerollVote: { id: 4, voters: ['p_h'], agreed: [] } }, priv, myId: 'p_ag' }), null);
  assert.deepEqual(nextAction({ pub: { ...info, rerollVote: null, players: [{ playerId: 'p_ag', ready: false }] }, priv, myId: 'p_ag' }).msg,
    { t: 'g.infoReady', setupRevision: 0 });
  // after a setup reroll the revision is > 0; an infoReady without it is refused (BAD_TARGET) for the whole phase
  assert.deepEqual(nextAction({ pub: { ...info, setupRevision: 2, players: [{ playerId: 'p_ag', ready: false }] }, priv, myId: 'p_ag' }).msg,
    { t: 'g.infoReady', setupRevision: 2 });
});

test('agent client: the band draft uses the room allowed list (mode, boss, content set), not the vanilla one', async () => {
  const { nextAction } = await import('../../tools/agent/player.mjs');
  const pub = { phase: 'BAND_DRAFT', draft: { turn: 'p_ag', picks: {}, bands: ['band_room_a', 'band_room_b'] } };
  assert.deepEqual(nextAction({ pub, priv: {}, myId: 'p_ag' }).msg, { t: 'g.band', bandId: 'band_room_a' });
  const taken = { ...pub, draft: { ...pub.draft, picks: { p_h: 'band_room_a' } } };
  assert.deepEqual(nextAction({ pub: taken, priv: {}, myId: 'p_ag' }).msg, { t: 'g.band', bandId: 'band_room_b' });
  const old = { phase: 'BAND_DRAFT', draft: { turn: 'p_ag', picks: {} } };
  assert.equal(nextAction({ pub: old, priv: {}, myId: 'p_ag' }).msg.bandId, 'band_bldsk');
});
