#!/usr/bin/env node
// tools/agent/agent.mjs — the example agent-seat client (docs/AGENT-SEATS.md P3).
//
// It is a normal WebSocket player: hello → agent.claim { token } → the same g.* intents a human sends. No API key and no
// outbound model call; the server validates every intent through the human path.
//
//   # join a room with a host-issued one-time token
//   node tools/agent/agent.mjs --token <token> --name "My Agent"
//
//   # self-contained demo: create a co-op room with a bot, invite the agent into seat 1, start and play
//   node tools/agent/agent.mjs --demo
//
// The demo needs the server's switch on: SP_AGENT_SEATS=on (or startServer({ agentSeats: true })). A headless client
// cannot run browser battles, so run the demo server with SP_COMBAT=server (real server: `SP_COMBAT=server npm start`).
import WebSocket from 'ws';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextAction, FALLBACK_BANDS } from './player.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function usage() {
  console.log(`Usage:
  node tools/agent/agent.mjs --token <invite-token> [--url ws://127.0.0.1:3000/ws] [--name "My Agent"]
  node tools/agent/agent.mjs --demo [--url ...] [--name ...] [--host-name AgentHost] [--seat 1]

Server switches:
  SP_AGENT_SEATS=on     enable agent seats (default off)
  SP_COMBAT=server      headless demo only: the server simulates battles instead of a browser

Protocol: docs/AGENT-SEATS.md`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next != null && !next.startsWith('--')) { out[key] = next; i++; } else out[key] = true;
  }
  return out;
}

/** data/bands.json when the tool runs inside the repository, else the fallback ids. */
function loadBands() {
  try {
    const json = JSON.parse(readFileSync(path.join(ROOT, 'data', 'bands.json'), 'utf8'));
    const ids = Array.isArray(json) ? json.map((b) => b && b.bandId) : Object.keys(json);
    const list = ids.filter((id) => typeof id === 'string' && id);
    if (list.length) return list;
  } catch { /* fallback: a remote agent need not have the data files */ }
  return FALLBACK_BANDS;
}

const log = (...a) => console.log('[agent]', ...a);

class Conn {
  /** @param {string} url @param {string} label */
  constructor(url, label) {
    this.url = url;
    this.label = label;
    this.ws = null;
    this.id = null;
    this.nextRid = 1;
    this.inbox = [];
    this.waiters = [];
    this.pub = null;
    this.priv = null;
    this.result = null;
    this.closed = null;
    this.done = false;
    this.timer = null;
  }

  open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const timer = setTimeout(() => { try { ws.terminate(); } catch { /* ignore */ } reject(new Error(`connect timeout ${this.url}`)); }, 5000);
      ws.once('open', () => { clearTimeout(timer); resolve(); });
      ws.once('error', (e) => { clearTimeout(timer); reject(e); });
      ws.on('message', (data) => this._frame(data));
      ws.on('close', () => { this.done = true; this._wake(); });
    });
  }

  _frame(data) {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.t === 'm.public') this.pub = msg;
    else if (msg.t === 'm.private') this.priv = msg;
    else if (msg.t === 'm.result') this.result = msg;
    else if (msg.t === 'room.closed') this.closed = msg;
    else if (msg.t === 'error') log(`[${this.label}] error ${msg.code || ''} ${msg.msg || ''}`);
    const i = this.waiters.findIndex((w) => w.match(msg));
    if (i >= 0) {
      const [w] = this.waiters.splice(i, 1);
      clearTimeout(w.timer);
      w.resolve(msg);
    } else {
      this.inbox.push(msg);
    }
  }

  _wake() {
    for (const w of this.waiters.splice(0)) { clearTimeout(w.timer); w.resolve(null); }
  }

  send(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return null;
    const rid = msg.rid !== undefined ? msg.rid : this.nextRid++;
    const frame = { ...msg, rid };
    this.ws.send(JSON.stringify(frame));
    return rid;
  }

  waitFor(type, predicate = () => true, timeout = 5000) {
    const match = (m) => (type == null || m.t === type) && predicate(m);
    const i = this.inbox.findIndex(match);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0]);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const k = this.waiters.indexOf(w);
        if (k >= 0) this.waiters.splice(k, 1);
        resolve(null);
      }, timeout);
      const w = { match, resolve, timer };
      this.waiters.push(w);
    });
  }

  async request(msg, timeout = 5000) {
    const rid = this.send(msg);
    const reply = await this.waitFor(null, (m) => (m.t === 'ok' || m.t === 'error') && m.rid === rid, timeout);
    if (!reply) throw new Error(`${msg.t}: no reply`);
    if (reply.t === 'error') throw new Error(`${msg.t}: ${reply.code || 'error'}${reply.msg ? ` (${reply.msg})` : ''}`);
    return reply;
  }

  async hello(name, token) {
    const rid = this.send({ t: 'hello', name, version: 1, ...(token ? { token } : {}) });
    const welcome = await this.waitFor('welcome', (m) => m.rid === rid, 5000);
    if (!welcome) throw new Error('hello: no welcome');
    this.id = welcome.playerId;
    return welcome;
  }

  close() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    try { this.ws?.close(); } catch { /* ignore */ }
  }
}

/**
 * One action per ~150 ms from the latest public + private views. `attempt` advances when a deploy is rejected, and
 * resets each round.
 */
function play(conn, { bands, label = conn.label } = {}) {
  const state = { round: -1, attempt: 0, at: 0, note: '' };
  conn.timer = setInterval(() => {
    if (conn.done) return;
    const pub = conn.pub;
    const priv = conn.priv;
    if (!pub || !priv || !conn.id) return;
    if (pub.round !== state.round) { state.round = pub.round; state.attempt = 0; }
    const now = Date.now();
    if (now - state.at < 150) return;
    const act = nextAction({ pub, priv, myId: conn.id, bands, attempt: state.attempt });
    if (!act) return;
    if (act.attempt != null) state.attempt = act.attempt;
    state.at = now;
    conn.send(act.msg);
    if (act.note !== state.note) { state.note = act.note; log(`[${label}] ${act.note}`); }
  }, 80);
}

async function claimAndPlay({ url, name, token, bands }) {
  const agent = new Conn(url, 'agent');
  await agent.open();
  const welcome = await agent.hello(name);
  log(`connected as ${welcome.playerId} (seat claim pending)`);
  await agent.request({ t: 'agent.claim', token });
  log('claimed the bot seat; playing through ordinary g.* intents');
  play(agent, { bands });
  return agent;
}

async function demo({ url, name, hostName, seat, bands, maxMs }) {
  const host = new Conn(url, 'host');
  await host.open();
  await host.hello(hostName);
  await host.request({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
  const room = await host.waitFor('room.state', (s) => s.hostId === host.id);
  if (!room) throw new Error('room.create: no room.state');
  log(`room ${room.code} created by ${hostName}`);
  // the demo starts from an empty co-op room: seat 0 is the host, room.addBot fills the lowest free seat
  const target = Number.isInteger(Number(seat)) ? Number(seat) : 1;
  await host.request({ t: 'room.addBot' });
  const withBot = await host.waitFor('room.state', (s) => s.seats[target] && s.seats[target].isBot, 5000);
  if (!withBot) throw new Error(`no bot in seat ${target} (the room fills seats lowest-first)`);
  let invite;
  try {
    await host.request({ t: 'room.agentInvite', seat: target });
    invite = await host.waitFor('agent.invite', (m) => m.seat === target, 5000);
  } catch (e) {
    throw new Error(`${e.message} — is SP_AGENT_SEATS=on?`, { cause: e });
  }
  if (!invite) throw new Error('no agent.invite frame');
  log(`invite for seat ${target} minted (expires ${new Date(invite.expiresAt).toISOString()})`);

  const agent = await claimAndPlay({ url, name, token: invite.token, bands });
  play(host, { bands, label: 'host' });

  await host.request({ t: 'room.start' });
  log('match started — watch the round log, Ctrl-C to stop');

  const finish = () => {
    const summary = agent.result || host.result;
    if (summary) {
      const me = (summary.players || []).find((p) => p.playerId === agent.id);
      log(`result: ${summary.victory ? 'victory' : 'defeat'} after ${summary.roundsPassed ?? '?'} rounds; agent ${me ? `seat ${me.seat}` : 'played'}`);
    }
    agent.close();
    host.close();
    setTimeout(() => process.exit(0), 30);
  };
  const wait = setInterval(() => {
    if (agent.result || host.result || agent.done || host.done) { clearInterval(wait); finish(); }
  }, 200);
  if (maxMs > 0) setTimeout(() => { clearInterval(wait); finish(); }, maxMs);
  process.on('SIGINT', () => { clearInterval(wait); agent.close(); host.close(); process.exit(0); });
  return wait;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) { usage(); return; }
  const url = args.url || process.env.SP_AGENT_URL || 'ws://127.0.0.1:3000/ws';
  const name = args.name || 'AI Agent';
  const bands = loadBands();
  const maxMs = Number(args['max-ms']) || 0;
  if (args.demo) {
    await demo({ url, name, hostName: args['host-name'] || 'AgentHost', seat: args.seat, bands, maxMs });
    return;
  }
  if (!args.token) { usage(); process.exitCode = 2; return; }
  const agent = await claimAndPlay({ url, name, token: args.token, bands });
  const wait = setInterval(() => {
    if (agent.result || agent.done || agent.closed) {
      clearInterval(wait);
      if (agent.result) log(`result: ${agent.result.victory ? 'victory' : 'defeat'} after ${agent.result.roundsPassed ?? '?'} rounds`);
      else if (agent.closed) log(`room closed: ${agent.closed.reason}`);
      agent.close();
      setTimeout(() => process.exit(agent.closed ? 2 : 0), 30);
    }
  }, 200);
  if (maxMs > 0) setTimeout(() => { clearInterval(wait); agent.close(); process.exit(0); }, maxMs);
  process.on('SIGINT', () => { clearInterval(wait); agent.close(); process.exit(0); });
}

main().catch((e) => { log(e.stack || e.message || String(e)); process.exit(1); });
