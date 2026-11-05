// test/agent-llm.test.js — the LLM-driven agent client (tools/agent/llm.mjs, docs/AGENT-SEATS.md P3).
// Verifies both wire formats against a local fake provider, and the action allowlist. No real key, no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { GEO } from '../shared/constants.js';
import { makeClient, validAction, parseReply } from '../tools/agent/llm.mjs';

function fakeProvider(handler) {
  return new Promise((resolve) => {
    const seen = [];
    const srv = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const rec = { method: req.method, url: req.url, headers: req.headers, body: (() => { try { return JSON.parse(body); } catch { return null; } })() };
        seen.push(rec);
        const out = handler(rec);
        res.writeHead(out.status || 200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(out.json));
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${srv.address().port}`, seen, close: () => new Promise((r) => srv.close(r)) }));
  });
}

test('OpenAI-compatible provider: POST /chat/completions with a bearer key', async () => {
  const srv = await fakeProvider(() => ({ json: { choices: [{ message: { content: '{"action":{"t":"g.ready","ready":true}}' } }], usage: { prompt_tokens: 12, completion_tokens: 4 } } }));
  try {
    const c = makeClient({ provider: 'openai', model: 'test-model', 'api-key': 'secret-key', 'base-url': srv.url });
    const r = await c.ask('system prompt', '{"phase":"PREP"}');
    assert.match(r.text, /g\.ready/);
    assert.equal(srv.seen.length, 1);
    assert.equal(srv.seen[0].url, '/chat/completions');
    assert.equal(srv.seen[0].headers.authorization, 'Bearer secret-key');
    assert.equal(srv.seen[0].body.model, 'test-model');
    assert.equal(srv.seen[0].body.messages[0].role, 'system');
    assert.equal(srv.seen[0].body.messages[1].content, '{"phase":"PREP"}');
  } finally { await srv.close(); }
});

test('Anthropic provider: POST /messages with x-api-key and the version header', async () => {
  const srv = await fakeProvider(() => ({ json: { content: [{ type: 'text', text: '{"action":null}' }], usage: { input_tokens: 9, output_tokens: 2 } } }));
  try {
    const c = makeClient({ provider: 'anthropic', model: 'claude-test', 'api-key': 'secret-key', 'base-url': srv.url });
    const r = await c.ask('system prompt', '{"phase":"PREP"}');
    assert.equal(r.text, '{"action":null}');
    assert.equal(srv.seen[0].url, '/messages');
    assert.equal(srv.seen[0].headers['x-api-key'], 'secret-key');
    assert.equal(srv.seen[0].headers['anthropic-version'], '2023-06-01');
    assert.equal(srv.seen[0].body.system, 'system prompt');
    assert.equal(srv.seen[0].body.messages[0].role, 'user');
  } finally { await srv.close(); }
});

test('the model reply is parsed from fences/prose and only legal actions pass', () => {
  assert.deepEqual(parseReply('```json\n{"action":{"t":"g.ready","ready":true}}\n```'), { action: { t: 'g.ready', ready: true } });
  assert.deepEqual(parseReply('Sure: {"action":null} done'), { action: null });
  assert.equal(parseReply('not json'), null);

  const state = {
    myId: 'p1', bands: ['band_a', 'band_b'],
    pub: { phase: 'PREP', draft: null },
    priv: {
      seat: 1, funds: 3, deployCap: 2, deployCount: 0, canReady: true,
      shop: { level: 1, slots: [{ kind: 'chess', id: 'c1', price: 1, sold: false }, null], rewardOffer: null },
      hand: [{ uid: 7, id: 'c1', kind: 'chess' }],
      board: [],
    },
  };
  assert.deepEqual(validAction({ t: 'g.buy', slot: 0 }, state), { t: 'g.buy', slot: 0 });
  assert.equal(validAction({ t: 'g.buy', slot: 5 }, state), null, 'unknown slot');
  assert.equal(validAction({ t: 'g.buy', slot: 1 }, state), null, 'empty slot');
  assert.deepEqual(validAction({ t: 'g.move', uid: 7, to: { area: 'board', row: GEO.FIELD.r0, col: GEO.FIELD.c0 }, dir: 'UP' }, state),
    { t: 'g.move', uid: 7, to: { area: 'board', row: GEO.FIELD.r0, col: GEO.FIELD.c0 }, dir: 'UP' });
  assert.equal(validAction({ t: 'g.move', uid: 99, to: { area: 'board', row: GEO.FIELD.r0, col: GEO.FIELD.c0 } }, state), null, 'unknown uid');
  assert.deepEqual(validAction({ t: 'g.ready', ready: true }, state), { t: 'g.ready', ready: true });
  assert.equal(validAction({ t: 'g.test', cmd: 'x' }, state), null, 'admin/test intents never pass');
});
