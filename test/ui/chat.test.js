// test/ui/chat.test.js — room text chat (public/js/ui/chat.js, docs/MATCHMAKING.md §38): the pure mapping /
// normalisation of the m.chat / room.chat wire frames into the store slice (chatLine / chatHistory / appendChat). The
// panels themselves (ChatLog / ChatComposer / ChatBox / ChatDock) render in the browser; the server behaviour is in
// test/lobby-chat.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatLine, chatHistory, appendChat } from '../../public/js/ui/chat.js';
import { CHAT_HISTORY } from '../../shared/constants.js';

test('chatLine: normalises a wire message, rejects unusable input, coerces every field', () => {
  assert.deepEqual(chatLine({ from: 'p_1', name: 'Host', text: '你好', at: 123 }), { from: 'p_1', name: 'Host', text: '你好', at: 123 });
  // a missing / empty text is not a message at all
  for (const bad of [null, undefined, 'x', 42, [], {}, { text: '' }, { text: 5 }, { text: null }]) {
    assert.equal(chatLine(bad), null, JSON.stringify(bad));
  }
  // a hostile / truncated frame never leaks a non-string into the renderer
  assert.deepEqual(chatLine({ text: 'hi', from: 42, name: { $gt: '' }, at: 'nope' }), { from: null, name: '', text: 'hi', at: 0 });
  assert.deepEqual(chatLine({ text: 'hi' }), { from: null, name: '', text: 'hi', at: 0 });
  assert.equal(chatLine({ text: 'hi', from: '' }).from, null);
});

test('chatHistory: usable lines only, oldest first, capped at the last CHAT_HISTORY', () => {
  assert.deepEqual(chatHistory(null), []);
  assert.deepEqual(chatHistory('nope'), []);
  assert.deepEqual(chatHistory([{ text: 'a', from: 'p', at: 1 }, null, { text: '' }, { text: 'b', from: 'p', at: 2 }]).map((m) => m.text), ['a', 'b']);
  const many = Array.from({ length: CHAT_HISTORY + 5 }, (_, i) => ({ text: `#${i}`, from: 'p', at: i }));
  const kept = chatHistory(many);
  assert.equal(kept.length, CHAT_HISTORY);
  assert.equal(kept[0].text, '#5');
  assert.equal(kept.at(-1).text, `#${CHAT_HISTORY + 4}`);
});

test('appendChat: keeps the tail, ignores an unusable message, tolerates a bad slice', () => {
  const a = appendChat([], { text: 'one', from: 'p', at: 1 });
  assert.equal(a.length, 1);
  assert.equal(appendChat(a, { text: '' })[0].text, 'one', 'an unusable message leaves the list untouched');
  const b = appendChat(a, { text: 'two', from: 'q', at: 2 });
  assert.deepEqual(b.map((m) => m.text), ['one', 'two']);
  assert.notEqual(a, b, 'a new array (the store treats it as changed)');
  const base = Array.from({ length: CHAT_HISTORY }, (_, i) => ({ text: `#${i}`, from: 'p', at: i }));
  const capped = appendChat(base, { text: 'new', from: 'p', at: 99 });
  assert.equal(capped.length, CHAT_HISTORY);
  assert.equal(capped[0].text, '#1', 'the oldest fell off');
  assert.equal(capped.at(-1).text, 'new');
  assert.deepEqual(appendChat(null, { text: 'x' }).map((m) => m.text), ['x']);
  assert.deepEqual(appendChat(undefined, { text: '' }), []);
});
