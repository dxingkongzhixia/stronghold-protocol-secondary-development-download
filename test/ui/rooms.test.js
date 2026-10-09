// 公开房间 directory screen (public/js/screens/rooms.js, docs/MATCHMAKING.md §36): the pure data mapping the screen
// renders from — per-seat normalisation (exactly MAX_SEATS cells; empty / left seats null; host / AI / guest flags)
// and the /online/api snapshot split into 组队中 (openRooms) and 对局中 (playRooms).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomSeats, roomIsFull, splitRooms } from '../../public/js/screens/rooms.js';
import { MAX_SEATS } from '../../shared/constants.js';

test('roomSeats: exactly MAX_SEATS cells, null for empty / left, the public identity otherwise', () => {
  const room = {
    hostId: 'p_host',
    seats: [
      { name: '房主', role: 'admin', isBot: false, isHost: true, guest: false },
      { name: 'Guest', role: null, isBot: false, isHost: false, guest: true },
      { name: 'AI·华法琳', role: null, isBot: true, isHost: false, guest: false },
    ],
  };
  const cells = roomSeats(room);
  assert.equal(cells.length, MAX_SEATS);
  assert.deepEqual(cells.map((c) => (c ? [c.name, c.initial, c.guest, c.isBot, c.isHost] : null)), [
    ['房主', '房', false, false, true],
    ['Guest', 'G', true, false, false],
    ['AI·华法琳', 'A', false, true, false],
    null,
  ]);
  assert.equal(cells[0].role, 'admin');
  assert.deepEqual(roomSeats(null), [null, null, null, null], 'no room → all empty');
  assert.deepEqual(roomSeats({ seats: [null, undefined] }), [null, null, null, null], 'padded to MAX_SEATS');
});

test('splitRooms: openRooms → 组队中, playRooms → 对局中, missing arrays → empty', () => {
  const open = [{ code: 'AAAA' }];
  const play = [{ code: 'BBBB' }];
  assert.deepEqual(splitRooms({ openRooms: open, playRooms: play }), { open, play });
  assert.deepEqual(splitRooms(null), { open: [], play: [] });
  assert.deepEqual(splitRooms({ openRooms: 'x' }), { open: [], play: [] });
});

// 公开房间 ordering (docs/MATCHMAKING.md §36, owner 2026-10-09): 组队中 lists not-full rooms first, full lobbies last;
// a full lobby room's action is 观战, decided by the server `full` flag / the seats.
test('roomIsFull: the server `full` flag, else freeSeats, else the seat cells decide the 观战 action', () => {
  assert.equal(roomIsFull({ full: true }), true);
  assert.equal(roomIsFull({ full: false }), false);
  assert.equal(roomIsFull({ freeSeats: 0 }), true);
  assert.equal(roomIsFull({ freeSeats: 2 }), false);
  assert.equal(roomIsFull({ seats: [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }] }), true, 'all seats taken');
  assert.equal(roomIsFull({ seats: [{ name: 'a' }, null, null, null] }), false, 'a free seat');
  assert.equal(roomIsFull(null), false, 'no room is never full');
});

test('splitRooms: 组队中 is not-full first (humans desc), a full lobby sinks to the bottom', () => {
  const data = {
    openRooms: [
      { code: 'FULL', full: true, humans: 4 },
      { code: 'B', full: false, humans: 2 },
      { code: 'A', full: false, humans: 3 },
    ],
    playRooms: [{ code: 'P1' }],
  };
  assert.deepEqual(splitRooms(data).open.map((r) => r.code), ['A', 'B', 'FULL']);
  assert.deepEqual(splitRooms(data).play.map((r) => r.code), ['P1'], '对局中 order untouched');
  // a legacy payload without the `full` flag: the seat cells still sink a full lobby
  const legacy = {
    openRooms: [
      { code: 'F2', seats: [{ name: '1' }, { name: '2' }, { name: '3' }, { name: '4' }] },
      { code: 'O', seats: [{ name: '1' }, null, null, null] },
    ],
  };
  assert.deepEqual(splitRooms(legacy).open.map((r) => r.code), ['O', 'F2']);
});
