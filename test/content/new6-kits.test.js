// The 2026-11-01 six-star additions (塔露拉 / 冻河 / 国度): each DIY pick loads its own official kit and fights a few
// seconds without content errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const picks = [
  ['char_4247_oxi', '塔露拉', 2],
  ['char_4244_tocka', '冻河', 2],
  ['char_4246_dminon', '国度', 2],
  ['char_4182_oblvns', '丰川祥子', 2],
];
const walker = () => enemyRec({ key: 'e_walk', hp: 4000, atk: 300, speed: 0.8, bat: 1.5 });

test('2026-11-01 6★: each DIY pick runs its own hand-authored kit in a real battle', () => {
  for (const [charId, name, skillIndex] of picks) {
    const h = makeBattle({
      units: [{ uid: 1, diy: { slot: 'chess_char_6_diy1_a', charId, skillIndex, uniEquipId: null }, row: 10, col: 6 }],
      defs: { enemies: { e_walk: walker() } },
      enemies: [{ key: 'e_walk', route: 0, count: 3, interval: 3 }],
      timeLimit: 30, autoFinish: false, seed: 3,
    });
    h.step();
    const u = h.b.units.find((x) => x.kind === 'op' && x.side === 'ally');
    assert.ok(u, `${name}: fielded`);
    assert.equal(u.def.charId, charId, `${name}: charId`);
    assert.ok(u.kit && !u.kit.generic, `${name}: own kit`);
    h.run(15);
    assert.equal(h.b.errorCount ?? 0, 0, `${name}: ${JSON.stringify(h.b.errors?.slice(0, 3))}`);
  }
});
