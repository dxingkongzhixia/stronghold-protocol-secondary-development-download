// test/ui/band-skill.test.js — 规程's active strategy skill button (public/js/ui/bandSkill.js): the target lists it
// offers for COMMON_CHESS / SHOP_SLOT (g.bandSkill's target shapes) and the remaining-use text. The default 盟约 set has
// no bandSkill, so the component renders nothing there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandSkillChessTargets, bandSkillShopTargets, bandSkillUsesText } from '../../public/js/ui/bandSkill.js';

const op = (uid, extra = {}) => ({ uid, kind: 'chess', id: 'c' + uid, items: [], ...extra });

test('COMMON_CHESS targets: board first, then hand and temp, only operators', () => {
  const priv = {
    board: [op(1, { row: 9, col: 3 }), op(2, { row: 10, col: 5 })],
    hand: [null, op(3), { uid: 4, kind: 'item', id: 'i' }],
    temp: [op(5)],
  };
  assert.deepEqual(bandSkillChessTargets(priv).map((p) => p.uid), [1, 2, 3, 5]);
  assert.deepEqual(bandSkillChessTargets({}), []);
});

test('SHOP_SLOT targets: the unsold slots keep their index', () => {
  const priv = { shop: { slots: [{ kind: 'chess', id: 'a' }, null, { kind: 'item', id: 'b', sold: true }, { kind: 'item', id: 'c' }] } };
  assert.deepEqual(bandSkillShopTargets(priv).map((x) => x.slot), [0, 3]);
  assert.deepEqual(bandSkillShopTargets({}), []);
});

test('the uses text: a count, or the cooldown in rounds', () => {
  assert.equal(bandSkillUsesText({ usesLeft: 2, cooldown: 0 }), '×2');
  assert.equal(bandSkillUsesText({ usesLeft: 0, cooldown: 0 }), '×0');
  assert.equal(bandSkillUsesText({ usesLeft: null, cooldown: 0 }), '');
  assert.match(bandSkillUsesText({ usesLeft: null, cooldown: 4 }), /4$/);
  assert.equal(bandSkillUsesText(null), '');
});
