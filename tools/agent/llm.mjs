#!/usr/bin/env node
// tools/agent/llm.mjs — an LLM-driven agent seat client (docs/AGENT-SEATS.md P3, rule B).
//
// A normal WebSocket player with a one-time invite; the model runs on THIS machine. The game server never sees a key and
// never calls out. The client asks the model for one action at a time, validates it locally, and falls back to the small
// rule loop in player.mjs when the model is unavailable, slow, over budget or returns something illegal.
//
//   node tools/agent/llm.mjs --token <invite-token> --provider openai --model gpt-4.1
//   node tools/agent/llm.mjs --demo --provider anthropic --model claude-sonnet-4-5
//
// Provider settings (arguments win, then env; the key is never printed):
//   --provider openai|anthropic   SP_LLM_API_FORMAT / SP_LLM_PROVIDER
//   --model <id>                  SP_LLM_MODEL
//   --base-url <url>              SP_LLM_BASE_URL (defaults: api.openai.com/v1, api.anthropic.com/v1)
//   --max-calls <n>               SP_LLM_MAX_CALLS (default 80; after that the rule loop plays)
//   SP_LLM_API_KEY               required; --api-key works but may leak through the shell history
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GEO } from '../../shared/constants.js';
import { nextAction, FALLBACK_BANDS } from './player.mjs';
import { claimAndPlay, demo } from './agent.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULTS = { openai: 'https://api.openai.com/v1', anthropic: 'https://api.anthropic.com/v1' };
const ALLOWED = new Set(['g.infoReady', 'g.band', 'g.buy', 'g.refresh', 'g.freeze', 'g.levelUp', 'g.sell', 'g.move', 'g.reward', 'g.choice', 'g.ready']);

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

function loadBands() {
  try {
    const json = JSON.parse(readFileSync(path.join(ROOT, 'data', 'bands.json'), 'utf8'));
    const ids = Array.isArray(json) ? json.map((b) => b && b.bandId) : Object.keys(json);
    const list = ids.filter((id) => typeof id === 'string' && id);
    if (list.length) return list;
  } catch { /* remote agents need not have data files */ }
  return FALLBACK_BANDS;
}

const log = (...a) => console.log('[llm-agent]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYSTEM = `You play one seat in Stronghold Protocol: Alliance (a co-op auto-chess tower defense).
You receive the public view and your own private view as JSON and must choose ONE action.

Reply with JSON only, no prose:
{"action": <action>} or {"action": null}

Allowed actions (use only ids/uid/slot values that exist in the state):
- {"t":"g.infoReady"}
- {"t":"g.band","bandId":"<id>"}      pick an unclaimed band on your draft turn
- {"t":"g.buy","slot":<0-15>}         buy a shop slot (chess only unless you need an item)
- {"t":"g.refresh"} {"t":"g.freeze"} {"t":"g.levelUp"}
- {"t":"g.sell","uid":<id>}
- {"t":"g.move","uid":<id>,"to":{"area":"board","row":<r>,"col":<c>},"dir":"UP|RIGHT|DOWN|LEFT"}
- {"t":"g.reward","idx":<0-5>}        promotion reward
- {"t":"g.choice","idx":<0-5>}        personal 机变 / bounty choice
- {"t":"g.ready","ready":true}

Strategy: pick a free band; spend funds on chess; deploy hand pieces into free deploy cells (deployCount < deployCap);
take reward/choices; ready when the hand cannot be deployed or funds are spent. Do not invent ids. Prefer progress over
perfection: if unsure, buy the cheapest chess, deploy, then ready.`;

/** Strip a JSON reply that a model wrapped in prose / fences. */
export function parseReply(text) {
  if (typeof text !== 'string') return null;
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return null; }
}

export function validAction(raw, { pub, priv, myId, bands }) {
  if (!raw || typeof raw !== 'object' || typeof raw.t !== 'string' || !ALLOWED.has(raw.t)) return null;
  const int = (v) => Number.isInteger(v);
  const uid = (id) => (priv.hand || []).some((p) => p && p.uid === id) || (priv.board || []).some((p) => p && p.uid === id);
  switch (raw.t) {
    case 'g.infoReady': return { t: 'g.infoReady' };
    case 'g.band': {
      if (pub.draft?.turn !== myId || !bands.includes(raw.bandId)) return null;
      const taken = new Set(Object.values(pub.draft.picks || {}).filter(Boolean));
      return taken.has(raw.bandId) ? null : { t: 'g.band', bandId: raw.bandId };
    }
    case 'g.buy': return int(raw.slot) && raw.slot >= 0 && raw.slot < 16 && priv.shop?.slots?.[raw.slot] ? { t: 'g.buy', slot: raw.slot } : null;
    case 'g.refresh': return { t: 'g.refresh' };
    case 'g.freeze': return { t: 'g.freeze' };
    case 'g.levelUp': return { t: 'g.levelUp' };
    case 'g.sell': return int(raw.uid) && (priv.board || []).some((p) => p && p.uid === raw.uid) ? { t: 'g.sell', uid: raw.uid } : null;
    case 'g.reward': return int(raw.idx) && raw.idx >= 0 && raw.idx <= 5 && priv.shop?.rewardOffer ? { t: 'g.reward', idx: raw.idx } : null;
    case 'g.choice': return int(raw.idx) && raw.idx >= 0 && raw.idx <= 5 && priv.personalChoice ? { t: 'g.choice', idx: raw.idx } : null;
    case 'g.move': {
      const to = raw.to;
      if (!int(raw.uid) || !uid(raw.uid) || !to || to.area !== 'board') return null;
      if (!int(to.row) || !int(to.col) || to.row < GEO.FIELD.r0 || to.row > GEO.FIELD.r1 || to.col < GEO.FIELD.c0 || to.col > GEO.FIELD.c1) return null;
      const dir = ['UP', 'RIGHT', 'DOWN', 'LEFT'].includes(raw.dir) ? raw.dir : undefined;
      return { t: 'g.move', uid: raw.uid, to: { area: 'board', row: to.row, col: to.col }, ...(dir ? { dir } : {}) };
    }
    case 'g.ready': return priv.canReady ? { t: 'g.ready', ready: true } : null;
    default: return null;
  }
}

/** A compact, bounded state for the prompt (never the whole public view). */
export function promptState({ pub, priv, myId, bands }) {
  const players = (pub.players || []).map((p) => ({ seat: p.seat, name: p.name, bandId: p.bandId || null, ready: !!p.ready, lp: p.lp, isBot: !!p.isBot, agent: !!p.agent }));
  const shop = (priv.shop?.slots || []).map((s, slot) => (s ? { slot, kind: s.kind, id: s.id, price: s.price, sold: !!s.sold } : null)).filter(Boolean);
  const hand = (priv.hand || []).map((p, slot) => (p ? { slot, uid: p.uid, id: p.id, kind: p.kind, tier: p.tier ?? null } : null)).filter(Boolean);
  const board = (priv.board || []).map((p) => ({ uid: p.uid, id: p.id, kind: p.kind, row: p.row, col: p.col }));
  const choice = priv.personalChoice ? { round: priv.personalChoice.round, cards: (priv.personalChoice.cards || []).map((c) => c && (c.name || c.id)) } : null;
  const reward = priv.shop?.rewardOffer ? (priv.shop.rewardOffer.slots || []).map((s, idx) => (s ? { idx, kind: s.kind, id: s.id, sold: !!s.sold } : null)).filter(Boolean) : null;
  return {
    phase: pub.phase, round: pub.round,
    you: {
      playerId: myId, seat: priv.seat, funds: priv.funds, shopLevel: priv.shop?.level ?? null,
      deployCap: priv.deployCap, deployCount: priv.deployCount, canReady: !!priv.canReady, ready: !!priv.ready,
      bandId: priv.bandId || null,
    },
    draft: pub.draft ? { turn: pub.draft.turn, picks: pub.draft.picks, bandIds: bands } : null,
    players,
    shop, hand, board,
    personalChoice: choice,
    rewardOffer: reward,
    bonds: (priv.bonds || []).map((b) => ({ name: b.name, active: !!b.active, layers: b.layers || 0 })).slice(0, 12),
  };
}

export function makeClient(opts) {
  const provider = String(opts.provider || process.env.SP_LLM_PROVIDER || process.env.SP_LLM_API_FORMAT || 'openai').toLowerCase() === 'anthropic' ? 'anthropic' : 'openai';
  const key = String(opts['api-key'] || process.env.SP_LLM_API_KEY || '');
  const model = String(opts.model || process.env.SP_LLM_MODEL || '');
  const base = String(opts['base-url'] || process.env.SP_LLM_BASE_URL || DEFAULTS[provider]).replace(/\/+$/, '');
  const timeoutMs = Math.max(1000, Number(opts['timeout-ms'] || process.env.SP_LLM_TIMEOUT_MS || 20000));
  const maxTokens = Math.max(64, Number(opts['max-tokens'] || process.env.SP_LLM_MAX_TOKENS || 1200));
  const temperature = opts.temperature != null ? Number(opts.temperature) : (process.env.SP_LLM_TEMPERATURE != null ? Number(process.env.SP_LLM_TEMPERATURE) : 0.3);
  if (!key) throw new Error('missing SP_LLM_API_KEY (or --api-key)');
  if (!model) throw new Error('missing model: --model or SP_LLM_MODEL');
  if (!/^https?:\/\//i.test(base)) throw new Error(`bad base URL: ${base}`);
  const maxCalls = Math.max(1, Number(opts['max-calls'] || process.env.SP_LLM_MAX_CALLS || 80));

  async function ask(system, user) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      let res;
      if (provider === 'anthropic') {
        res = await fetch(`${base}/messages`, {
          method: 'POST', signal: ctl.signal,
          headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model, max_tokens: maxTokens, temperature, system, messages: [{ role: 'user', content: user }] }),
        });
      } else {
        res = await fetch(`${base}/chat/completions`, {
          method: 'POST', signal: ctl.signal,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model, max_tokens: maxTokens, temperature,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          }),
        });
      }
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      const json = JSON.parse(text);
      if (provider === 'anthropic') {
        return { text: (json.content || []).filter((c) => c && c.type === 'text').map((c) => c.text).join(''), usage: json.usage || null };
      }
      return { text: json.choices?.[0]?.message?.content || '', usage: json.usage || null };
    } finally {
      clearTimeout(timer);
    }
  }

  return { provider, model, maxCalls, ask };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log('node tools/agent/llm.mjs --token <token> --provider openai|anthropic --model <id> [--demo]');
    return;
  }
  const url = args.url || process.env.SP_AGENT_URL || 'ws://127.0.0.1:3000/ws';
  const name = args.name || 'LLM Agent';
  const bands = loadBands();
  const client = makeClient(args);
  let calls = 0;
  let latency = 0;
  let lastStateKey = '';
  let lastActKey = '';
  const blocked = new Set();
  const sig = (a) => JSON.stringify(a);

  const decide = async (state) => {
    // trivial confirmations / waiting turns never need a model call
    if (state.pub.phase === 'INFO_CHECK') return nextAction(state);
    if (state.pub.phase === 'BAND_DRAFT' && state.pub.draft?.turn !== state.myId) return null;
    if (!['BAND_DRAFT', 'PREP'].includes(state.pub.phase)) return nextAction(state);
    if (calls >= client.maxCalls) return nextAction(state);
    const stateKey = JSON.stringify(promptState({ ...state, bands }));
    // The previous action changed nothing → it was refused. Remember it and let the rule loop try another target
    // (a model that keeps proposing the same illegal cell would otherwise burn the call budget).
    if (stateKey === lastStateKey && lastActKey) {
      if (blocked.size < 200) blocked.add(lastActKey);
      lastActKey = '';
      log('state unchanged; rule fallback');
      return nextAction(state);
    }
    const user = stateKey;
    calls++;
    const t0 = Date.now();
    try {
      const reply = await client.ask(SYSTEM, user);
      latency = Date.now() - t0;
      const parsed = parseReply(reply.text);
      const action = validAction(parsed && (parsed.action ?? parsed), state);
      const usage = reply.usage ? ` tokens ${reply.usage.input_tokens ?? reply.usage.prompt_tokens ?? '?'}/${reply.usage.output_tokens ?? reply.usage.completion_tokens ?? '?'}` : '';
      log(`call ${calls}/${client.maxCalls} ${client.provider}/${client.model} ${latency}ms${usage}`);
      if (action && !blocked.has(sig(action))) {
        lastStateKey = stateKey;
        lastActKey = sig(action);
        return { msg: action, note: `model ${action.t}` };
      }
      if (action) log('model repeated a refused action; rule fallback');
      else log('model reply had no legal action; rule fallback');
    } catch (e) {
      log(`model call failed (${e.message}); rule fallback`);
    }
    return nextAction(state);
  };

  if (args.demo) {
    await demo({ url, name, hostName: args['host-name'] || 'AgentHost', seat: args.seat, bands, maxMs: Number(args['max-ms']) || 0, decide });
    return;
  }
  if (!args.token) throw new Error('missing --token (or use --demo)');
  const agent = await claimAndPlay({ url, name, token: args.token, bands, decide });
  const wait = setInterval(() => {
    if (agent.result || agent.done || agent.closed) {
      clearInterval(wait);
      if (agent.result) log(`result: ${agent.result.victory ? 'victory' : 'defeat'} after ${agent.result.roundsPassed ?? '?'} rounds`);
      else if (agent.closed) log(`room closed: ${agent.closed.reason}`);
      agent.close();
      setTimeout(() => process.exit(agent.closed ? 2 : 0), 30);
    }
  }, 200);
  const maxMs = Number(args['max-ms']) || 0;
  if (maxMs > 0) setTimeout(() => { clearInterval(wait); agent.close(); process.exit(0); }, maxMs);
  process.on('SIGINT', () => { clearInterval(wait); agent.close(); process.exit(0); });
  // keep the process alive while the agent plays
  await sleep(0);
}

// Only the CLI entry runs; tests import parseReply / validAction / makeClient directly.
const IS_ENTRY = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_ENTRY) run().catch((e) => { log(e.message || String(e)); process.exit(1); });