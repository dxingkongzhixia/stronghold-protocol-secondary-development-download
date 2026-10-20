import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBandGrants, BAND_GRANT_LIMITS } from '../../shared/plugins/bandGrants.js';

const KALTSIT = {
  team: true,
  grantUnit: {
    charId: 'char_003_kalts', tier: 3, elite: false, skill: 2, skillLocked: true,
    bonds: ['deputShip', 'steadShip', 'preciShip'],
    token: 'token_10002_kalts_mon3tr', tokenOnDeath: 'downed', reviveMs: 20000, maxRevives: 2,
  },
  eliteGate: { others: 2, at: 'battleStart' },
  restEndBondLayers: { scope: 'self', layers: 3, activeOnly: true, cap: 'maxCount' },
};

test('the Kal\'tsit grant normalises with defaults and keeps the three bonds', () => {
  const { grants, problems } = readBandGrants(KALTSIT);
  assert.deepEqual(problems, []);
  assert.equal(grants.team, true);
  assert.equal(grants.grantUnit.charId, 'char_003_kalts');
  assert.equal(grants.grantUnit.tier, 3);
  assert.equal(grants.grantUnit.elite, false, 'Kal\'tsit starts non-elite');
  assert.equal(grants.grantUnit.skill, 2);
  assert.equal(grants.grantUnit.skillLocked, true);
  assert.deepEqual(grants.grantUnit.bonds, ['deputShip', 'steadShip', 'preciShip']);
  assert.equal(grants.grantUnit.tokenOnDeath, 'downed');
  assert.equal(grants.grantUnit.reviveMs, 20000);
  assert.equal(grants.grantUnit.maxRevives, 2);
  assert.deepEqual(grants.eliteGate, { others: 2, at: 'battleStart' });
  assert.deepEqual(grants.restEndBondLayers, { scope: 'self', layers: 3, activeOnly: true, cap: 'maxCount' });
});

test('a minimal grant gets the safe defaults', () => {
  const { grants, problems } = readBandGrants({ grantUnit: { charId: 'char_003_kalts' } });
  assert.deepEqual(problems, []);
  assert.equal(grants.team, true);
  assert.equal(grants.grantUnit.tier, 3);
  assert.equal(grants.grantUnit.elite, false);
  assert.equal(grants.grantUnit.skill, 0);
  assert.equal(grants.grantUnit.skillLocked, false);
  assert.equal(grants.grantUnit.tokenOnDeath, 'remove');
  assert.equal(grants.restEndBondLayers, undefined);
});

test('invalid scopes, bonds, skills and token states are refused whole', () => {
  const cases = [
    { restEndBondLayers: { scope: 'front' } },
    { restEndBondLayers: { layers: BAND_GRANT_LIMITS.restLayers + 1 } },
    { grantUnit: { charId: 'char_003_kalts', bonds: Array.from({ length: BAND_GRANT_LIMITS.bonds + 1 }, () => 'deputShip') } },
    { grantUnit: { charId: 'char_003_kalts', bonds: ['not a bond!'] } },
    { grantUnit: { charId: 'char_003_kalts', skill: 3 } },
    { grantUnit: { charId: 'char_003_kalts', tokenOnDeath: 'forever' } },
    { grantUnit: { charId: 'char_003_kalts', reviveMs: -1 } },
    { eliteGate: { others: 0 } },
    { eliteGate: { at: 'prep' } },
    { unknown: true },
  ];
  for (const bad of cases) {
    const { grants, problems } = readBandGrants(bad);
    assert.equal(grants, null, JSON.stringify(bad));
    assert.ok(problems.length > 0, JSON.stringify(bad));
  }
  assert.equal(readBandGrants(undefined).grants, null);
  assert.equal(readBandGrants({}).grants, null);
});
