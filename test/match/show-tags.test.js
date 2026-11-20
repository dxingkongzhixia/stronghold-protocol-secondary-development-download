// test/match/show-tags.test.js — 规程's {showtag_value_N} texts (§37.201): the player's own piece views carry the live
// numbers (server/match/showTags.js) — 定期存折's pay, the round counters of 风絮 / 安洁莉娜 / 溯光星源, the next grant of
// 极光 / 忍冬's upgrading 特质 — and records without such a text add no field. Client side: test/ui/show-tags.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasShowTag, itemShowTags, garrisonShowTags } from '../../server/match/showTags.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../../data/versions/act3autochess-v3_1/${p}`, import.meta.url), 'utf8'));
const ITEMS = read('items.json');
const GARRISONS = read('garrisons.json');
const CHESS = read('chess.json');

const gd = {
  item: (id) => ITEMS[id],
  chess: (id) => CHESS[id],
  garrison: (id) => GARRISONS[id],
  baseIdOf: (id) => (CHESS[id]?.baseId || id),
};
const ps = (patch = {}) => ({ gd, counters: {}, round: { gainedChess: 0, refreshes: 0, spent: 0 }, ...patch });

test('the records: 定期存折 and the 特质 pairs carry the placeholder', () => {
  assert.ok(hasShowTag(ITEMS.chess_item_3_15_e_a.descRaw));
  const ids = Object.values(GARRISONS).filter((g) => hasShowTag(g.descRaw || g.desc)).map((g) => g.garrisonId);
  assert.ok(ids.includes('garrison_36_a') && ids.includes('garrison_50_a') && ids.includes('garrison_74_a'));
});

test('定期存折: the item view carries its current pay (value + the held growth counter)', () => {
  const book = { id: 'chess_item_3_15_e_a', uid: 7 };
  assert.deepEqual(itemShowTags(ps(), book), [0]);
  assert.deepEqual(itemShowTags(ps({ counters: { 'passbook:7': 3 } }), book), [3]);
  assert.equal(itemShowTags(ps(), { id: 'missing', uid: 1 }), undefined);
});

test('round counters: operators gained, refreshes, funds spent this round', () => {
  const p = ps({ round: { gainedChess: 3, refreshes: 2, spent: 7 } });
  assert.deepEqual(garrisonShowTags(p, { id: 'chess_char_3_06_a', uid: 1 }), { garrison_36_a: [3] });
  assert.deepEqual(garrisonShowTags(p, { id: 'chess_char_4_25_a', uid: 2 }), { garrison_91_a: [2], garrison_236_a: [2] });
  assert.deepEqual(garrisonShowTags(p, { id: 'chess_char_5_18_a', uid: 3 }), { garrison_121_a: [7] });
});

test('upgrading 特质: the next grant, from the counter its handler keeps', () => {
  const au = { id: 'chess_char_3_07_a', uid: 4 };
  const rd = { id: 'chess_char_3_13_a', uid: 5 };
  assert.deepEqual(garrisonShowTags(ps(), au), { garrison_50_a: [1] });
  assert.deepEqual(garrisonShowTags(ps({ counters: { 'garrison:upgrade:chess_char_3_07_a:SERVER_ADD_BOND_UPGRADE_LAYER': 2 } }), au), { garrison_50_a: [3] });
  assert.deepEqual(garrisonShowTags(ps(), rd), { garrison_74_a: [1] });
  assert.deepEqual(garrisonShowTags(ps({ counters: { 'freeRefreshUpgrade:5': 1 } }), rd), { garrison_74_a: [1] });
});

test('records without such a text add no field', () => {
  const out = garrisonShowTags(ps(), { id: 'chess_char_1_11_a', uid: 6 });
  assert.equal(out, undefined);
});
