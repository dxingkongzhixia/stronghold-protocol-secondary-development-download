// 公开房间 origin / return (owner 2026-10-09; docs/MATCHMAKING.md §36.4): a room entered from the 公开房间 screen
// remembers where it came from, so an intentional 离开同盟 reopens 公开房间 instead of dropping back on the plain
// lobby. The intent is transient UI state (`ui.roomsReturn`, never a pref): set only by that screen's own 加入 / 观战,
// consumed once when the lobby remounts, and cleared on the title / a session reset / a kick — never set by a manual
// 创建同盟 / 密钥 / inline chip / `?room=` entry. The browser side is the connected-browser check in the task report;
// the store lifecycle is exercised here.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { store, initialState, setRoomsReturn, consumeRoomsReturn, setProtocolReturn, consumeProtocolReturn } from '../../public/js/store.js';
import { remembersRoomOrigin } from '../../public/js/screens/lobby.js';

const clear = () => store.patch('ui', { roomsReturn: false });

describe('公开房间 origin flag (ui.roomsReturn)', () => {
  test('defaults off, as part of the initial store state', () => {
    assert.equal(initialState.ui.roomsReturn, false);
    clear();
    assert.equal(store.get().ui.roomsReturn, false);
  });

  test('set on a 公开房间 join / spectate, consumed exactly once by the lobby', () => {
    clear();
    setRoomsReturn(true);
    assert.equal(store.get().ui.roomsReturn, true);
    assert.equal(consumeRoomsReturn(), true, 'the lobby opens 公开房间');
    assert.equal(store.get().ui.roomsReturn, false, 'the flag is gone after the consume');
    assert.equal(consumeRoomsReturn(), false, 'one-shot: the next lobby mount sees nothing');
  });

  test('a failed 公开房间 join clears it again (no stale return for a later, unrelated leave)', () => {
    clear();
    setRoomsReturn(true);   // the join handler sets it before the request
    setRoomsReturn(false);  // ...and its catch clears it when the room never opened
    assert.equal(consumeRoomsReturn(), false);
  });

  test('store.reset() (title / session reset) clears it', () => {
    setRoomsReturn(true);
    store.reset();
    assert.equal(store.get().ui.roomsReturn, false);
  });

  test('only the 公开房间 screen sets the origin; manual entries never do', () => {
    assert.equal(remembersRoomOrigin('rooms'), true);
    for (const source of [null, undefined, 'lobby', 'create', 'key', 'chip', 'deep-link']) {
      assert.equal(remembersRoomOrigin(source), false, `source ${String(source)} keeps the plain-lobby behaviour`);
    }
  });

  test('full lifecycle: 公开房间 join → leave → the lobby reopens 公开房间; manual join → leave → plain lobby', () => {
    // entered from the 公开房间 screen: the origin is remembered while the room is on screen
    clear();
    setRoomsReturn(remembersRoomOrigin('rooms'));
    store.set({ room: { code: 'ABCD' } });
    // the player leaves on purpose (room.js leave): the room clears, the intent survives for the lobby
    store.set({ room: null });
    assert.equal(consumeRoomsReturn(), true, 'reopens 公开房间');
    assert.equal(consumeRoomsReturn(), false, 'and only once');

    // a manual entry (密钥 / 创建 / inline chip / ?room=) never remembers an origin
    clear();
    setRoomsReturn(remembersRoomOrigin(null));
    store.set({ room: { code: 'WXYZ' } });
    store.set({ room: null });
    assert.equal(consumeRoomsReturn(), false, 'plain lobby');
  });
});

describe('选择模拟协议 origin flag (ui.protocolReturn)', () => {
  test('defaults off and is one-shot', () => {
    assert.equal(initialState.ui.protocolReturn, false);
    setProtocolReturn(true);
    assert.equal(store.get().ui.protocolReturn, true);
    assert.equal(consumeProtocolReturn(), true);
    assert.equal(store.get().ui.protocolReturn, false);
    assert.equal(consumeProtocolReturn(), false, 'a later lobby mount starts on the Hub');
  });

  test('cleared by any other room entry / title return (the flag is set only by a protocol create)', () => {
    setProtocolReturn(true);
    store.patch('ui', { protocolReturn: false }); // Hub join/spectate/backToTitle path
    assert.equal(consumeProtocolReturn(), false);
  });
});
