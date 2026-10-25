// PRTS real plugin composition — the mimic must be targetable, and the mimic owns its fly/orb mechanics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createPluginRegistry } from '../../server/plugins/registry.js';
import { buildContentSet } from '../../server/plugins/contentSet.js';
import { DataSource, getDefaultSource } from '../../server/sim/simdata.js';
import { makeBattle } from '../helpers/battleHarness.js';

const BOSS = 'enemy_x_prts_source_code_prts';
const MIMIC = 'enemy_x_prts_source_code_mimic';
const PLUGIN = path.resolve('plugins/prts-source-code');
const KALTSIT = path.resolve('plugins/prts-kaltsit');
const skip = fs.existsSync(PLUGIN) ? false : 'plugins/prts-source-code is not installed in this checkout';
const skipKaltsit = fs.existsSync(KALTSIT) ? false : 'plugins/prts-kaltsit is not installed in this checkout';

function registry() {
  return createPluginRegistry({
    publicDir: 'public', dataDir: 'data', packsDir: 'packs', pluginsDir: 'plugins',
  }, { app: '0.4.0', log: { info() {}, warn() {} } });
}

function composed(ids) {
  const set = buildContentSet({ registry: registry(), ids });
  assert.deepEqual(set.problems, []);
  if (!set.data) throw new Error(`${ids.join('+')} content set was not composed`);
  return set;
}

test('prts: the Kal\'tsit band keeps its own icon while inheriting Touch mechanics (its own plugin)', { skip: skipKaltsit }, () => {
  const set = composed(['prts-kaltsit']);
  const band = set.data.bands.band_x_prts_kaltsit_touch;
  assert.ok(band);
  assert.equal(band.effectRef, 'band_amedic', 'the Touch team-grant mechanics stay inherited');
  assert.equal(band.iconId, 'band_x_prts_kaltsit_touch', 'the strategy uses its own Kal\'tsit art, not Touch\'s');
  assert.equal(band.grants.grantUnit.charId, 'char_x_prts_kaltsit_one');
  assert.equal(band.grants.grantUnit.token, 'token_x_prts_kaltsit_mon3tr');
  assert.deepEqual(band.grants.restEndRandomChess, {
    minTier: 1, maxTier: 6, count: 1,
    rounds: [2, 4, 6, 8, 10, 12],
    maxTierByRound: { 2: 3, 4: 3, 6: 3 },
  }, 'rounds 2/4/6/8/10/12 grant one operator; 2/4/6 cap at tier 3');
});

test('prts: the strategy and the bosses are separate plugins (the 2026-10-24 split)', { skip }, () => {
  const bosses = composed(['prts-source-code']);
  const strategy = skipKaltsit ? null : composed(['prts-kaltsit']);
  // the boss half no longer carries Kal'tsit, her token or the strategy
  assert.equal(bosses.data.chess.chess_x_prts_source_code_one_a, undefined);
  assert.equal(bosses.data.tokens.token_x_prts_source_code_mon3tr, undefined);
  assert.equal(bosses.data.bands.band_x_prts_source_code_touch, undefined);
  assert.ok(bosses.data.bosses.boss_x_prts_source_code_prts);
  assert.ok(bosses.data.enemies[BOSS]);
  // the strategy half carries no boss record and no boss waves
  if (strategy) {
    assert.ok(strategy.data.chess.chess_x_prts_kaltsit_one_a);
    assert.ok(strategy.data.chess.chess_x_prts_kaltsit_one_b);
    assert.ok(strategy.data.tokens.token_x_prts_kaltsit_mon3tr);
    assert.equal(strategy.data.bosses.boss_x_prts_source_code_prts, undefined);
    assert.equal(strategy.data.enemies[BOSS], undefined);
  }
});

function content() {
  const set = composed(['prts-source-code']);
  return new DataSource({
    chess: set.data.chess, enemies: set.data.enemies, tokens: set.data.tokens,
    stages: set.data.stages, waves: set.data.waves,
  }, getDefaultSource());
}

function battle(data) {
  return makeBattle({
    data,
    units: [{ chessId: 'chess_char_1_01_a', row: 10, col: 8 }],
    enemies: [
      { key: BOSS, time: 0, pos: [10, 10] },
      { key: MIMIC, time: 0, pos: [10, 9] },
    ],
    timeLimit: 40,
    autoFinish: false,
  });
}

test('prts: the real mimic is targetable and the boss uses an HP shield instead of invincibility', { skip }, () => {
  const h = battle(content());
  h.step();
  const boss = h.enemies().find((e) => e.defId === BOSS);
  const mimic = h.enemies().find((e) => e.defId === MIMIC);
  assert.ok(boss && mimic, 'both the boss and its mimic spawned');
  const shield = boss.buffs.find((b) => b.key === 'protocol:shield');
  assert.ok(shield, 'the boss starts with its link shield');
  assert.equal(shield.shield, boss.s.maxHp * 0.5, 'the shield is 50% of the boss max HP');
  assert.equal(boss.buffs.some((b) => b.key === 'protocol:guard'), false, 'the boss is not hard-guarded');
  assert.equal(!!boss.s.flags.untargetable, false, 'the boss can be selected');
  assert.equal(!!boss.s.flags.invulnerable, false, 'the boss can be damaged through its shield');
  assert.equal(mimic.buffs.some((b) => b.key === 'protocol:guard' || b.key === 'protocol:shield'), false, 'the mimic carries neither guard nor shield');
  assert.equal(!!mimic.s.flags.untargetable, false, 'the mimic is targetable');
  assert.equal(!!mimic.s.flags.invulnerable, false, 'the mimic can take damage');

  const mimicHp = mimic.hp;
  h.b.dealDamage(null, mimic, { amount: 100, type: 'true' });
  assert.equal(mimic.hp < mimicHp, true, 'normal damage reaches the mimic');

  const bossHp = boss.hp;
  h.b.dealDamage(null, boss, { amount: 100, type: 'true' });
  assert.equal(boss.hp, bossHp, 'the shield takes the hit before the boss HP');
  assert.equal(shield.shield, boss.s.maxHp * 0.5 - 100, 'the shield value went down');
  assert.equal(h.b.errors.length, 0);
});

test('prts: the shield breaks once and is never restored by a revive', { skip }, () => {
  const h = battle(content());
  h.step();
  const boss = h.enemies().find((e) => e.defId === BOSS);
  const mimic = h.enemies().find((e) => e.defId === MIMIC);
  const hp = boss.hp;
  const breaks = [];
  h.b.on('protocolShieldBreak', (c) => breaks.push(c));
  h.b.dealDamage(null, boss, { amount: boss.s.maxHp * 0.5 + 1234, type: 'true' });
  assert.equal(boss.hp, hp - 1234, 'damage beyond the shield reaches boss HP');
  assert.equal(breaks.length, 1, 'the shield break fired once');
  assert.equal(boss.buffs.some((b) => b.key === 'protocol:shield'), false, 'the shield is gone');
  assert.equal(h.b.snapshot().protocol.shield, 0);

  h.b.loseHp(mimic, 1e9);
  h.run(9.2);
  assert.equal(mimic.alive, true, 'the mimic revived');
  assert.equal(boss.buffs.some((b) => b.key === 'protocol:shield'), false, 'the revive does not restore the shield');
  assert.equal(boss.s.flags.untargetable, undefined, 'the boss remains targetable after the shield broke');
  assert.equal(h.b.errors.length, 0);
});

test('prts: the first revive puts the fly window on the mimic, not on PRTS', { skip }, () => {
  const h = battle(content());
  h.step();
  const boss = h.enemies().find((e) => e.defId === BOSS);
  const mimic = h.enemies().find((e) => e.defId === MIMIC);
  h.b.loseHp(mimic, 1e9);
  h.run(9.2); // 8 s down + the revive tick
  assert.ok(mimic.buffs.some((b) => b.key === 'protocol:fly'), 'the mimic enters its fly window');
  assert.equal(boss.buffs.some((b) => b.key === 'protocol:fly'), false, 'PRTS does not fly');
  assert.equal(h.b.errors.length, 0);
});
