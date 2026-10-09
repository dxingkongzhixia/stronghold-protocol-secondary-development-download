// 公开房间 directory screen (public/js/screens/rooms.js, docs/MATCHMAKING.md §36): the pure data mapping the screen
// renders from — per-seat normalisation (exactly MAX_SEATS cells; empty / left seats null; host / AI / guest flags)
// and the /online/api snapshot split into 组队中 (openRooms) and 对局中 (playRooms).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomSeats, splitRooms } from '../../public/js/screens/rooms.js';
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
