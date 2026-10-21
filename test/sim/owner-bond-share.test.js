// A token flagged `shareOwnerBonds` mirrors its owner's passive bond buffs (M3 <- Kal'tsit), without counting as a
// bond member itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';

test('a shareOwnerBonds token receives and loses its owner\'s bond buffs', () => {
  const token = structuredClone(getDefaultSource().rawToken('token_10002_kalts_mon3tr'));
  token.shareOwnerBonds = true;
  const h = makeBattle({
    units: [
      { chessId: 'test_bond_owner', row: 10, col: 4 },
      { kind: 'token', tokenId: 'token_10002_kalts_mon3tr', ownerUid: 1, row: 10, col: 5 },
    ],
    defs: {
      chess: { test_bond_owner: chessRec({ id: 'test_bond_owner', stats: { maxHp: 2000, atk: 100 } }) },
      tokens: { token_10002_kalts_mon3tr: token },
    },
  });
  h.run(0.1);
  const owner = h.unit(1);
  const m3 = h.b.allyUnits.find((u) => u.kind === 'token' && u.defId === 'token_10002_kalts_mon3tr');
  assert.ok(owner && m3, 'owner and M3 deployed');
  const before = m3.s.atk;
  h.b.addBuff(owner, { key: 'bond:preci', mods: { atkPct: 0.5 }, persist: true, allowDead: true });
  h.run(1.2);
  assert.ok(m3.buffs.some((b) => b.key === 'bond:preci'), 'bond buff mirrored');
  assert.ok(m3.s.atk > before, 'the mirrored ATK bonus reaches the token stats');

  h.b.removeBuff(owner, 'bond:preci');
  h.run(1.2);
  assert.equal(m3.buffs.some((b) => b.key === 'bond:preci'), false, 'and is removed with the owner');
});
