// test/ui/chat.test.js — room text chat (public/js/ui/chat.js, docs/MATCHMAKING.md §38): the pure mapping of the
// m.chat wire frame (chatMessage) and the transient bubble lifecycle (activeChatBubbles). There is no log / no history —
// a live bubble appears on receive and is gone once older than the TTL. The server behaviour is in test/lobby-chat.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatMessage, activeChatBubbles, chatDockStartsOpen, CHAT_OPEN_PREF } from '../../public/js/ui/chat.js';
import { CHAT_BUBBLE_MS } from '../../shared/constants.js';

test('chatMessage: normalises a wire message, rejects unusable input, coerces every field', () => {
  assert.deepEqual(chatMessage({ from: 'p_1', name: 'Host', text: '你好' }, 7, 1234), { seq: 7, from: 'p_1', name: 'Host', text: '你好', at: 1234 });
  // a missing / empty text is not a message at all
  for (const bad of [null, undefined, 'x', 42, [], {}, { text: '' }, { text: 5 }, { text: null }]) {
    assert.equal(chatMessage(bad, 1, 1), null, JSON.stringify(bad));
  }
  // a hostile / truncated frame never leaks a non-string into the renderer
  assert.deepEqual(chatMessage({ text: 'hi', from: 42, name: { $gt: '' } }, NaN, NaN), { seq: 0, from: null, name: '', text: 'hi', at: 0 });
  assert.deepEqual(chatMessage({ text: 'hi' }, 1, 2), { seq: 1, from: null, name: '', text: 'hi', at: 2 });
  assert.equal(chatMessage({ text: 'hi', from: '' }, 1, 2).from, null);
});

test('activeChatBubbles: a bubble is live right after receipt and gone once older than the TTL', () => {
  const at = 1_000_000;
  const chat = [chatMessage({ from: 'p1', name: 'A', text: 'hi' }, 1, at)];
  assert.equal(activeChatBubbles(chat, at).get('p1').text, 'hi', 'live on arrival');
  assert.equal(activeChatBubbles(chat, at + CHAT_BUBBLE_MS - 1).has('p1'), true, 'still live just under the TTL');
  assert.equal(activeChatBubbles(chat, at + CHAT_BUBBLE_MS).has('p1'), false, 'expired at the TTL');
  assert.equal(activeChatBubbles(chat, at + CHAT_BUBBLE_MS + 5000).has('p1'), false, 'stays gone');
  // TTL is overridable
  assert.equal(activeChatBubbles(chat, at + 100, 50).has('p1'), false);
  // a frame from the future by more than a second (a client-clock oddity) is ignored
  assert.equal(activeChatBubbles(chat, at - 2000).has('p1'), false);
  for (const bad of [null, undefined, 'x', 42, {}]) assert.equal(activeChatBubbles(bad, at).size, 0);
});

test('activeChatBubbles: the newest message per sender wins; different senders each keep their bubble (own and others alike)', () => {
  const at = 2_000_000;
  const chat = [
    chatMessage({ from: 'p1', name: 'A', text: 'first' }, 1, at),
    chatMessage({ from: 'p2', name: 'B', text: 'hello' }, 2, at + 10),
    chatMessage({ from: 'p1', name: 'A', text: 'second' }, 3, at + 20),
  ];
  const live = activeChatBubbles(chat, at + 30);
  assert.equal(live.size, 2, 'one bubble per sender');
  assert.equal(live.get('p1').text, 'second', 'the sender’s newest message replaces their older one');
  assert.equal(live.get('p1').seq, 3);
  assert.equal(live.get('p2').text, 'hello');
  // a sender with no seat (a spectator) is still mapped (the caller places it on their entry)
  const seatless = chatMessage({ from: 'spec_1', name: 'W', text: 'watching' }, 4, at + 30);
  assert.equal(activeChatBubbles([seatless], at + 30).get('spec_1').text, 'watching');
  // an old message of one sender does not hide a newer message of another
  const mixed = [chatMessage({ from: 'p1', name: 'A', text: 'old' }, 1, at), chatMessage({ from: 'p2', name: 'B', text: 'new' }, 2, at + CHAT_BUBBLE_MS)];
  const now = at + CHAT_BUBBLE_MS;
  const m = activeChatBubbles(mixed, now);
  assert.equal(m.has('p1'), false, 'the older sender aged out');
  assert.equal(m.get('p2').text, 'new', 'the newer sender is live');
});

test('chat dock toggle: collapsed by default, and the last state is remembered (CHAT_OPEN_PREF)', () => {
  assert.equal(CHAT_OPEN_PREF, 'chatOpen');
  // default (nothing saved) is collapsed; only an explicit true expands it
  assert.equal(chatDockStartsOpen(undefined), false);
  assert.equal(chatDockStartsOpen(false), false);
  assert.equal(chatDockStartsOpen('yes'), false);
  assert.equal(chatDockStartsOpen(1), false);
  assert.equal(chatDockStartsOpen(true), true);
  // the pref round-trips through localStorage: expanded stays expanded, collapsed stays collapsed
  const orig = globalThis.localStorage;
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  try {
    assert.equal(chatDockStartsOpen(), false, 'fresh browser: collapsed');
    mem.set(`sp.pref.${CHAT_OPEN_PREF}`, 'true');
    assert.equal(chatDockStartsOpen(), true, 'a saved open state expands the dock');
    mem.set(`sp.pref.${CHAT_OPEN_PREF}`, 'false');
    assert.equal(chatDockStartsOpen(), false, 'a saved closed state stays collapsed');
  } finally {
    if (orig === undefined) delete globalThis.localStorage; else globalThis.localStorage = orig;
  }
});
