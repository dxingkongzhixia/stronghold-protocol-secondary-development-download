// “不死的黑蛇” / Deathless Black Snake — content-set and battle smoke tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createPluginRegistry } from '../../server/plugins/registry.js';
import { buildContentSet } from '../../server/plugins/contentSet.js';
import { DataSource, getDefaultSource } from '../../server/sim/simdata.js';
import { makeBattle } from '../helpers/battleHarness.js';

const BOSS = 'enemy_x_black_snake_bsnake';
// The boss plugin carries official art and is therefore a local, git-ignored plugin (plugins/AGENTS.md).
// The engine half (PLUGIN_KITS + content/enemies.js lookup) is always present; this end-to-end test only
// runs where the owner has the plugin installed.
const PLUGIN = path.resolve('plugins/black-snake');
const skip = fs.existsSync(PLUGIN) ? false : 'plugins/black-snake is not installed in this checkout';

function content() {
  const registry = createPluginRegistry({
    publicDir: 'public', dataDir: 'data', packsDir: 'packs', pluginsDir: 'plugins',
  }, { app: '0.4.0', log: { info() {}, warn() {} } });
  const set = buildContentSet({ registry, ids: ['black-snake'] });
  assert.deepEqual(set.problems, []);
  if (!set.data) throw new Error('black-snake content set was not composed');
  return new DataSource({
    chess: set.data.chess, enemies: set.data.enemies, tokens: set.data.tokens,
    stages: set.data.stages, waves: set.data.waves,
  }, getDefaultSource());
}

function battle(data) {
  return makeBattle({
    data,
    units: [{ chessId: 'chess_char_1_01_a', row: 10, col: 8 }],
    enemies: [{ key: BOSS, pos: [10, 10] }],
    timeLimit: 160,
    autoFinish: false,
    hooks: ['statusApplied'],
  });
}

test('black-snake: the NORMAL boss wave spawns the boss and its escorts', { skip }, () => {
  const h = makeBattle({ data: content(), waveTemplate: 'wave_x_black_snake_boss_s', timeLimit: 12, autoFinish: false });
  h.run(8);
  assert.ok(h.enemies().some((e) => e.defId === BOSS), 'the boss spawns from its own wave template');
  assert.ok(h.enemies().length > 1, 'the escort spawns are still present');
  assert.equal(h.b.errors.length, 0);
});

test('black-snake: the boss applies Burning Breath and survives its first phase', { skip }, () => {
  const h = battle(content());
  h.step();
  const boss = h.enemies()[0];
  const ally = h.unit('chess_char_1_01_a');
  assert.ok(boss && ally);
  // Keep the test operator alive for the long phase; its own HP is irrelevant to the mechanics under test.
  ally.base.maxHp = 1e8;
  ally.hp = 1e8;
  h.run(6);
  assert.ok(ally.findBuff('burningBreath'), 'the attack applied Burning Breath');
  h.b.dealDamage(ally, boss, { amount: 1e9, type: 'true' });
  assert.equal(boss.buffs.some((b) => b.key === 'bsnake:down'), true, 'the first defeat starts the down window');
  h.run(6);
  assert.equal(boss.hp, boss.s.maxHp, 'the first phase rebirth restores full HP');
  assert.ok(boss.buffs.some((b) => b.key === 'bsnake:enraged'), 'the rebirth enters Enraged State');
  h.run(30);
  assert.ok(boss.buffs.some((b) => b.key === 'bsnake:return'), 'Deathless Inferno returns the boss with invulnerability');
  assert.ok(h.eventsOf('fx').some((e) => e[1] === 'bgm' && e[4]?.key === 'boss:boss_x_black_snake_bsnake_hard'),
    'the first inferno switches to the hard-phase track');
  assert.ok(h.eventsOf('fx').some((e) => e[1] === 'phase' && e[4]?.kind === 'bsnakeInferno'),
    'the first inferno emits its generic phase effect');
  assert.equal(h.b.errors.length, 0);
});

test('black-snake: the energy aggregate self-destructs after 25 s with directional fireballs', { skip }, () => {
  const h = battle(content());
  h.step();
  const ally = h.unit('chess_char_1_01_a');
  ally.base.maxHp = 1e8;
  ally.hp = 1e8;
  const aggregate = h.spawn('enemy_x_black_snake_aggregate', { pos: [10, 9], routeIndex: 0 });
  assert.ok(aggregate);
  h.run(25.2);
  assert.equal(aggregate.alive, false, 'the timed energy crystal leaves the field');
  assert.ok(h.eventsOf('fx').some((e) => e[1] === 'pluginProjectile'),
    'its directional fireballs use the compiled trail');
  assert.equal(h.b.errors.length, 0);
});

test('black-snake: 抵抗 shortens Burning Breath, and the inferno fires real lane projectiles', { skip }, () => {
  const h = battle(content());
  h.step();
  const boss = h.enemies()[0];
  const ally = h.unit('chess_char_1_01_a');
  ally.base.maxHp = 1e8;
  ally.hp = 1e8;
  h.b.addBuff(ally, { key: 'resist', status: 'resist', duration: 30, data: { value: 0.5 } });
  h.run(5);
  const breath = ally.findBuff('burningBreath');
  assert.ok(breath, 'the boss attack still applies the status');
  assert.ok(breath.timeLeft < 20, '抵抗 removes half of the 30.5 s duration');
  assert.ok(h.hooksOf('statusApplied').some((c) => c.target === ally && c.status === 'burningBreath'),
    'the catalogue status reports statusApplied');

  h.b.dealDamage(ally, boss, { amount: 1e9, type: 'true' });
  assert.ok(h.runUntil(() => h.eventsOf('fx').some((e) => e[1] === 'pluginProjectile'
    && e[4]?.skill === 'plugin:black-snake:enemy_bsnake_reborn_01_trail'), 10),
  'the projectile carries the official compiled trail');
  assert.ok(h.b.projectiles.list.some((p) => p.visual === 'enemy' && p.source === boss),
    'the inferno spawns a flying fireball rather than dealing damage at the target');
  assert.equal(h.b.errors.length, 0);
});

test('black-snake: the second defeat runs the final Deathless Inferno and removes the boss', { skip }, () => {
  const h = battle(content());
  h.step();
  const boss = h.enemies()[0];
  const ally = h.unit('chess_char_1_01_a');
  ally.base.maxHp = 1e8;
  ally.hp = 1e8;
  h.b.dealDamage(ally, boss, { amount: 1e9, type: 'true' });
  h.run(6 + 28 + 16); // down, first inferno, and the 15 s return invulnerability
  assert.ok(boss.alive, 'the boss is back after the first inferno');
  h.b.dealDamage(ally, boss, { amount: 1e9, type: 'true' });
  h.run(6 + 30);
  assert.equal(boss.alive, false, 'the second inferno leaves the field');
  assert.ok(h.eventsOf('fx').some((e) => e[1] === 'phase' && e[4]?.kind === 'bsnakeFinal'),
    'the final inferno emits its generic phase effect');
  assert.equal(h.b.errors.length, 0);
});
