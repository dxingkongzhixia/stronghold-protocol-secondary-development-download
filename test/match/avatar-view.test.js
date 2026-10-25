// The account avatar (schema v6) reaches the match's public player view: the band check, protocol-boot cards, the
// in-match team panel and the result screens all draw PlayerAvatar from m.public.players.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';

test('m.public.players carries the seat avatar only when the player has one', () => {
  const h = makeMatch({
    seats: [
      { seat: 0, playerId: 'p_0', name: 'Avatar', isBot: false, connected: true, avatar: 'char_003_kalts' },
      { seat: 1, playerId: 'p_1', name: 'Plain', isBot: false, connected: true },
    ],
    seed: 1,
  }).start();
  try {
    const pub = h.lastBc('m.public');
    assert.ok(pub && Array.isArray(pub.players));
    const a = pub.players.find((p) => p.playerId === 'p_0');
    const b = pub.players.find((p) => p.playerId === 'p_1');
    assert.equal(a.avatar, 'char_003_kalts');
    assert.equal('avatar' in b, false, 'a player without a picture keeps the old payload shape');
  } finally {
    h.m.dispose();
  }
});
