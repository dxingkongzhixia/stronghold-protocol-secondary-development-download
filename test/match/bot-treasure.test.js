// test/match/bot-treasure.test.js — 寻宝人's active strategy skill used by a bot: `botTreasureTile` picks a deployable tile
// no enemy route crosses, `botTreasure` hands it to the intent (which owns phase / cost / cooldown / target checks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botTreasure, botTreasureTile } from '../../server/match/bot.js';

test('the treasure tile avoids every enemy route and takes the lowest row', () => {
  const m = { stage: { groundPaths: { 'a->end': [[10, 5], [10, 6]], 'b->end': [[12, 4]] } } };
  const ps = { deployMap: () => new Map([['10,5', 'melee'], ['10,6', 'melee'], ['11,4', 'melee'], ['12,4', 'melee']]) };
  assert.deepEqual(botTreasureTile(m, ps), [11, 4]);
  assert.equal(botTreasureTile({ stage: { groundPaths: {} } }, { deployMap: () => new Map([['10,6', 'melee']]) })[1], 6);
  assert.equal(botTreasureTile(m, { deployMap: () => new Map() }), null);
});

test('a bot places the 宝藏 on that tile through the strategy intent', () => {
  const m = {
    stage: { groundPaths: { route: [[10, 6]] } },
    calls: [],
    useBandSkill(ps, msg) { this.calls.push({ ps, msg }); return { ok: true }; },
  };
  const ps = { bandId: 'band_treasure', deployMap: () => new Map([['10,6', 'melee'], ['11,5', 'melee']]) };
  assert.equal(botTreasure(m, ps), true);
  assert.deepEqual(m.calls[0].msg.target, { kind: 'tile', row: 11, col: 5 });
  // not this strategy: no call
  m.calls.length = 0;
  assert.equal(botTreasure(m, { ...ps, bandId: null, bandSkillId: null }), false);
  assert.equal(m.calls.length, 0);
});
