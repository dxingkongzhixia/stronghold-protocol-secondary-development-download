// Server-side meta commands: `match.economy.write` applies through the Match host, and a `policy.decide` return
// value is a legal action that uses the same audited command list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from '../match/harness.js';

const descriptor = (modules) => ({
  plugins: [{
    id: 'meta-demo',
    manifest: { manifest: 3, id: 'meta-demo', version: '1.0.0' },
    modules,
  }],
});

test('a match module command changes funds through the Match host', () => {
  const modules = [{
    kind: 'match', entry: 'match/index.js', permissions: ['match.read', 'match.economy.write'],
    code: { hooks: { 'match.onMatchStart'(_ctx, api) { api.command({ type: 'addFunds', amount: 7, playerId: 'p_0' }); } } },
  }];
  const h = makeMatch({ keel: descriptor(modules), humans: 1, seed: 1 });
  const before = h.ps('p_0').funds;
  h.start();
  assert.equal(h.ps('p_0').funds, before + 7);
  const log = h.m.keelMatch.snapshot().commands['keel-room:match:match/index.js'];
  assert.equal(log.at(-1)?.result?.added, 7);
});

test('a policy.decide return value is applied as a legal command', () => {
  const modules = [{
    kind: 'policy', entry: 'policy/index.js', permissions: ['policy.observe', 'policy.act'],
    code: { hooks: { 'policy.decide'() { return { type: 'addFunds', amount: 3, playerId: 'p_0' }; } } },
  }];
  const h = makeMatch({ keel: descriptor(modules), humans: 1, seed: 1 });
  h.start();
  const before = h.ps('p_0').funds;
  h.toPrep(1);
  assert.ok(h.ps('p_0').funds >= before + 3, 'the policy action lands (round income may add more)');
  assert.equal(h.m.keelPolicyDecision?.type, 'addFunds');
});

test('an unsupported meta command is refused without changing the player', () => {
  const modules = [{
    kind: 'match', entry: 'match/index.js', permissions: ['match.read', 'match.economy.write'],
    code: { hooks: { 'match.onMatchStart'(_ctx, api) { api.command({ type: 'setLp', amount: 0, playerId: 'p_0' }); } } },
  }];
  const h = makeMatch({ keel: descriptor(modules), humans: 1, seed: 1 });
  const before = h.ps('p_0').lp;
  h.start();
  assert.equal(h.ps('p_0').lp, before);
  const log = h.m.keelMatch.snapshot().commands['keel-room:match:match/index.js'];
  assert.match(log.at(-1)?.result?.error ?? '', /unsupported command/);
});
