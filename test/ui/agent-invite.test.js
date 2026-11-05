// test/ui/agent-invite.test.js — the player-facing agent invite (docs/AGENT-SEATS.md).
// A static contract: any seated real player can mint an invite from a bot seat, the one-time token is shown once, and
// the client listens for the dedicated `agent.invite` frame (an `ok` carries no fields).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const room = readFileSync(path.join(ROOT, 'public/js/screens/room.js'), 'utf8');
const main = readFileSync(path.join(ROOT, 'public/js/main.js'), 'utf8');
const store = readFileSync(path.join(ROOT, 'public/js/store.js'), 'utf8');

test('room screen: any seated real player can invite an agent to a bot seat', () => {
  assert.match(room, /net\.request\('room\.agentInvite', \{ seat, ttlSec: 600 \}\)/);
  assert.match(room, /canInviteAgent = coop && !facts\.spectating && !!mySeat && !mySeat\.agent/);
  assert.match(room, /seat\.isBot && canInvite/);
  assert.match(room, /data-testid="agent-invite-token"/);
  assert.match(room, /node tools\/agent\/llm\.mjs --url/);
  // the token is only in the invite frame; it must never enter the room table
  assert.doesNotMatch(room, /agentInvite.*seats/);
});

test('client net: agent.invite is stored separately and cleared with the room', () => {
  assert.match(store, /agentInvite: null/);
  assert.match(main, /net\.on\('agent\.invite'/);
  assert.match(main, /store\.set\(\{ agentInvite: msg \}\)/);
  assert.match(main, /store\.set\(\{ agentInvite: null \}\)/);
});

test('room screen: only the inviter can send a private coach directive to its agent', () => {
  assert.match(room, /net\.request\('agent\.coach', \{ text \}\)/);
  assert.match(room, /seat\.agent && seat\.agentOwner === myId/);
  assert.match(room, /data-testid="agent-coach"/);
  assert.match(room, /COACH_PRESETS/);
});
