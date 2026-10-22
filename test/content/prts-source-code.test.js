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
const skip = fs.existsSync(PLUGIN) ? false : 'plugins/prts-source-code is not installed in this checkout';

function content() {
  const registry = createPluginRegistry({
    publicDir: 'public', dataDir: 'data', packsDir: 'packs', pluginsDir: 'plugins',
  }, { app: '0.4.0', log: { info() {}, warn() {} } });
  const set = buildContentSet({ registry, ids: ['prts-source-code'] });
  assert.deepEqual(set.problems, []);
  if (!set.data) throw new Error('prts-source-code content set was not composed');
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

test('prts: the real mimic is targetable and the boss is guarded by the link', { skip }, () => {
  const h = battle(content());
  h.step();
  const boss = h.enemies().find((e) => e.defId === BOSS);
  const mimic = h.enemies().find((e) => e.defId === MIMIC);
  assert.ok(boss && mimic, 'both the boss and its mimic spawned');
  assert.equal(boss.buffs.some((b) => b.key === 'protocol:guard'), true, 'the boss is guarded while the mimic lives');
  assert.equal(mimic.buffs.some((b) => b.key === 'protocol:guard'), false, 'the mimic must not guard itself');
  assert.equal(!!mimic.s.flags.untargetable, false, 'the mimic is targetable');
  assert.equal(!!mimic.s.flags.invulnerable, false, 'the mimic can take damage');
  const hp = mimic.hp;
  h.b.dealDamage(null, mimic, { amount: 100, type: 'true' });
  assert.equal(mimic.hp < hp, true, 'normal damage reaches the mimic');
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
