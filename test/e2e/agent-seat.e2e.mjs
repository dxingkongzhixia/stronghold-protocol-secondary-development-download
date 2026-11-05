// test/e2e/agent-seat.e2e.mjs — agent seat end-to-end (docs/AGENT-SEATS.md P4).
//
// A real server + real Match, one human host and one external agent client. The agent takes seat 1 through a one-time
// invite, then the example decision loop (tools/agent/player.mjs) plays at least three preps and a battle through the
// ordinary `g.*` intents. Server-side battles run with clientCombat:false, so no browser is needed.
//
//   SP_AGENT_E2E=1 node --test test/e2e/agent-seat.e2e.mjs
//
// Opt-in: it compresses a co-op match, which is too timing-sensitive for the default suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

import { startServer } from '../../server/index.js';
import { Match } from '../../server/match/Match.js';
import { TestClient } from '../helpers/wsClient.js';
import { nextAction } from '../../tools/agent/player.mjs';

const ENABLED = process.env.SP_AGENT_E2E === '1';

/** Latest frame of `type` in the client's own log (TestClient keeps every frame). */
function latest(client, type) {
  for (let i = client.log.length - 1; i >= 0; i--) if (client.log[i].t === type) return client.log[i];
  return null;
}

test('agent seat plays three preps and a battle through ordinary intents', { skip: !ENABLED && 'set SP_AGENT_E2E=1' }, async () => {
  let captured = null;
  class HeadlessMatch extends Match {
    constructor(opts) {
      super({ ...opts, clientCombat: false, botRehearsal: 0, botSliceMs: 0.001, timerScale: 0.01 });
      captured = this;
    }
  }
  const srv = await startServer({
    port: 0, host: '127.0.0.1', quiet: true, assetIndex: false, studio: false,
    agentSeats: true, agentGraceMs: 2000, MatchClass: HeadlessMatch, seedFn: () => 20261105,
  });
  const url = `ws://127.0.0.1:${srv.port}/ws`;
  const host = await TestClient.connect(url);
  const agent = await TestClient.connect(url);
  const timers = [];
  try {
    const hostWelcome = await host.hello('E2EHost');
    host.id = hostWelcome.playerId;
    const agentWelcome = await agent.hello('E2EAgent');
    agent.id = agentWelcome.playerId;

    const ok = async (c, msg) => {
      const r = await c.request(msg, 10000);
      assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`);
      return r;
    };
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    const room = await host.waitFor('room.state', (s) => s.hostId === host.id);
    await ok(host, { t: 'room.addBot' });
    await host.waitFor('room.state', (s) => s.seats[1] && s.seats[1].isBot);
    await ok(host, { t: 'room.agentInvite', seat: 1 });
    const invite = await host.waitFor('agent.invite', (m) => m.seat === 1);
    await ok(agent, { t: 'agent.claim', token: invite.token });
    await host.waitFor('room.state', (s) => s.seats[1] && s.seats[1].playerId === agentWelcome.playerId);
    await ok(host, { t: 'room.start' });

    const preps = new Set();
    let battleSeen = false;
    let maxBoard = 0;
    let attempting = 0;
    for (const c of [host, agent]) {
      const st = { round: -1, attempt: 0, at: 0 };
      timers.push(setInterval(() => {
        if (!c.isOpen) return;
        const pub = latest(c, 'm.public');
        const priv = latest(c, 'm.private');
        if (!pub || !priv) return;
        if (pub.round !== st.round) { st.round = pub.round; st.attempt = 0; }
        if (c === agent && pub.phase === 'PREP' && pub.round > 0) preps.add(pub.round);
        if (c === agent && ['COMBAT', 'UNITE'].includes(pub.phase)) battleSeen = true;
        if (c === agent) maxBoard = Math.max(maxBoard, (priv.board || []).length);
        if (Date.now() - st.at < 180) return;
        const act = nextAction({ pub, priv, myId: c.id, attempt: st.attempt });
        if (!act) return;
        if (act.attempt != null) st.attempt = act.attempt;
        st.at = Date.now();
        attempting++;
        c.send(act.msg);
      }, 90));
    }

    const started = Date.now();
    while (Date.now() - started < 120000) {
      if (preps.size >= 3 && battleSeen) break;
      if (captured?.ended) break;
      await delay(250);
    }
    assert.ok(captured, 'the real Match ran');
    assert.ok(preps.size >= 3, `three agent preps (saw ${[...preps].sort().join(',') || 'none'})`);
    assert.ok(battleSeen, 'at least one battle phase');
    assert.ok(maxBoard > 0, 'the example loop deployed units');
    assert.equal(captured.errorCount, 0, `server-side match errors: ${JSON.stringify(captured.errors?.slice(0, 3))}`);
    assert.ok(attempting > 0, 'the agent sent ordinary intents');
    assert.equal(room.code.length, 4);
  } finally {
    for (const t of timers) clearInterval(t);
    await agent.terminate().catch(() => {});
    await host.terminate().catch(() => {});
    await srv.close();
  }
});
