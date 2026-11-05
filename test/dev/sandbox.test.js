// test/dev/sandbox.test.js — the admin sandbox's scenario (public/dev/sandbox/state.js): the URL round trip, the legacy
// parameters every old link uses, and the BattleSpec the panel hands to createBattleFromSpec. Pure: no browser, no data
// files — the data maps are small fakes with the shapes data/*.json has.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_STATE, buildSpec, cleanGroup, groupsToParam, parseGroups, stateFromQuery, stateToQuery, waveSpawns,
} from '../../public/dev/sandbox/state.js';

const STAGE = {
  id: 'st',
  deployTiles: {
    normal: { melee: [[9, 3], [9, 4], [10, 3]], rangedOnly: [[8, 4]] },
    bossLeft: { melee: [[2, 4], [2, 5]], rangedOnly: [] },
  },
};
const WAVE = {
  id: 'wv', maxPlayTime: 90,
  routes: [{ motion: 'WALK', start: [9, 10], end: [9, 2] }, { motion: 'FLY', start: [0, 10], end: [0, 2] }],
  spawns: [
    { time: 1, key: 'enemy_a', count: 2, interval: 3, routeIndex: 0 },
    { time: 2, key: 'enemy_b', count: 1, interval: 0, routeIndex: 1 },
  ],
};
const ENEMIES = {
  enemy_a: { stats: { maxHp: 1000, atk: 100 } },
  enemy_b: { stats: { maxHp: 500, atk: 50 } },
};
const ctx = { stages: { st: STAGE }, waves: { wv: WAVE }, enemies: ENEMIES };

test('sandbox: the URL round trip keeps every scenario field', () => {
  const state = {
    ...DEFAULT_STATE,
    unit: 'char_123_x', skill: 1, elite: false, potential: 3, cultivate: 2, module: 'uniequip_x',
    row: 9, col: 4, dir: 'UP', stage: 'st', wave: 'wv', mix: true,
    groups: [{ key: 'enemy_a', count: 4, interval: 1.5, time: 3, route: 1, hp: 2, atk: 0.5 }],
    hp: 3, atk: 2, speed: 8, seed: 42, foes: false,
  };
  const back = stateFromQuery(`?${stateToQuery(state)}`);
  assert.deepEqual(back, state);
});

test('sandbox: old links (unit/s/stage/wave/mix/elite/hp/speed) still parse', () => {
  const s = stateFromQuery('?unit=char_4247_oxi&s=2&stage=act1autochess_m01&wave=act1autochess_05&elite=0&hp=3&speed=4&mix=1');
  assert.deepEqual(
    [s.unit, s.skill, s.stage, s.wave, s.elite, s.hp, s.speed, s.mix, s.potential, s.foes],
    ['char_4247_oxi', 2, 'act1autochess_m01', 'act1autochess_05', false, 3, 4, true, 6, true],
  );
  // junk clamps instead of throwing
  const j = stateFromQuery('?unit=../etc&s=99&p=0&cul=9&speed=3&row=-2&e=:bad;enemy_a:2');
  assert.equal(j.unit, DEFAULT_STATE.unit);
  assert.deepEqual([j.skill, j.potential, j.cultivate, j.speed, j.row], [2, 6, 0, 2, null]);
  assert.equal(j.groups.length, 1, 'only the well-formed group survives');
});

test('sandbox: spawn groups encode compactly and drop malformed parts', () => {
  const g = { key: 'enemy_a', count: 3, interval: 2.5, time: 1, route: 0, hp: 2, atk: 1 };
  assert.equal(groupsToParam([g]), 'enemy_a:3:2.5:1:0:2:1');
  assert.deepEqual(parseGroups(groupsToParam([g])), [g]);
  assert.deepEqual(parseGroups('bad;enemy_b:2:x'), [{ key: 'enemy_b', count: 2, interval: 2, time: 2, route: 0, hp: 1, atk: 1 }]);
  assert.equal(cleanGroup({ key: 'bad key' }), null);
});

test('sandbox: the spec fields the DIY piece with skill, potential, cultivate, module and facing', () => {
  const spec = buildSpec({ unit: 'char_999_y', skill: 1, elite: true, potential: 5, cultivate: 3, module: 'm1', row: 9, col: 4, dir: 'DOWN', stage: 'st', wave: 'wv' }, ctx);
  const u = spec.players[0].units[0];
  assert.equal(u.chessId, 'chess_char_6_diy1_b');
  assert.deepEqual(u.diy, { charId: 'char_999_y', skillIndex: 1, uniEquipId: 'm1' });
  assert.deepEqual([u.row, u.col, u.dir, u.potential, u.cultivate], [9, 4, 'DOWN', 5, 3]);
  assert.equal(spec.elite, undefined);
  assert.equal(spec.waveId, 'wv');
  assert.equal(spec.timeLimit, 90);
  const normal = buildSpec({ elite: false, stage: 'st', wave: 'wv' }, ctx).players[0].units[0];
  assert.equal(normal.chessId, 'chess_char_6_diy1_a');
});

test('sandbox: no position given -> a legal lane tile of the stage', () => {
  const u = buildSpec({ stage: 'st', wave: 'wv' }, ctx).players[0].units[0];
  assert.deepEqual([u.row, u.col], [9, 4], 'a melee tile on the walking lane, closest to the middle');
});

test('sandbox: spawn groups replace the stream and carry their own multipliers', () => {
  const spec = buildSpec({
    stage: 'st', wave: 'wv', hp: 2, atk: 3,
    groups: [{ key: 'enemy_a', count: 4, interval: 1.5, time: 3, route: 1, hp: 2, atk: 0.5 }],
  }, ctx);
  assert.deepEqual(spec.spawns, [{ enemyKey: 'enemy_a', time: 3, routeIndex: 1, count: 4, interval: 1.5 }]);
  assert.deepEqual(spec.enemyOverrides, { enemy_a: { stats: { maxHp: 4000, atk: 150 } } }, 'global × group');
});

test('sandbox: the default stream and ?mix=1 both come from the wave; no enemies spawns none', () => {
  const stream = buildSpec({ stage: 'st', wave: 'wv' }, ctx);
  assert.deepEqual(stream.spawns, [{ enemyKey: 'enemy_a', time: 2, routeIndex: 0, count: 18, interval: 2.4 }]);
  const mixed = buildSpec({ stage: 'st', wave: 'wv', mix: true, hp: 1, atk: 1 }, ctx);
  assert.deepEqual(mixed.spawns, waveSpawns(WAVE));
  assert.deepEqual(mixed.enemyOverrides, {}, 'hp=1 / atk=1 override nothing');
  const none = buildSpec({ stage: 'st', wave: 'wv', foes: false }, ctx);
  assert.deepEqual([none.spawns, none.enemyOverrides], [[], {}]);
});

test('sandbox: an unknown stage or wave is a clear error, not a half battle', () => {
  assert.throws(() => buildSpec({ stage: 'nope', wave: 'wv' }, ctx), /unknown stage/);
  assert.throws(() => buildSpec({ stage: 'st', wave: 'nope' }, ctx), /unknown wave/);
});



const BOSSES = {
  boss_1: {
    bossId: 'boss_1', enemyKey: 'enemy_boss', name: '假想敌：胄', bloodPoint: { FUNNY: 1000, NORMAL: 2000, HARD: 4000, ABYSS: 8000 },
    templates: { mode_multi_normal: { round: 14, template: 'wv' } }, escortsByTemplate: {},
  },
};

test('sandbox: a boss scenario spawns the leader plus the wave escorts and carries the shared pool', () => {
  const spec = buildSpec({ stage: 'st', wave: 'wv', boss: 'boss_1', bossDifficulty: 'NORMAL', bossHpMul: 0.5, hp: 1, atk: 1 }, { ...ctx, bosses: BOSSES });
  assert.equal(spec.kind, 'boss');
  assert.equal(spec.bossId, 'boss_1');
  assert.deepEqual(spec.boss, { poolHp: 1000, poolMax: 1000 });
  assert.equal(spec.timeLimit, null, 'a boss field ends by the pool, not the clock');
  assert.deepEqual(spec.spawns[0], { enemyKey: 'enemy_boss', time: 2, routeIndex: 0, count: 1, interval: 0, tag: 'boss' });
  assert.deepEqual(spec.spawns.slice(1), waveSpawns(WAVE), 'the template wave is the escort list');
});

test('sandbox: without an explicit wave a boss falls back to its own template', () => {
  const spec = buildSpec({ stage: 'st', wave: 'missing', boss: 'boss_1' }, { ...ctx, bosses: BOSSES });
  assert.equal(spec.waveId, 'wv');
});

test('sandbox: up to three teammates join on nearby legal tiles with their own skills', () => {
  const spec = buildSpec({
    stage: 'st', wave: 'wv', unit: 'char_a', skill: 2, row: 9, col: 4,
    team: [{ unit: 'char_b', skill: 0 }, { unit: 'char_c', skill: 1, row: 10, col: 3 }],
  }, ctx);
  const units = spec.players[0].units;
  assert.equal(units.length, 3);
  assert.deepEqual(units.map((u) => [u.uid, u.diy.charId, u.diy.skillIndex]), [[1, 'char_a', 2], [2, 'char_b', 0], [3, 'char_c', 1]]);
  assert.deepEqual([units[2].row, units[2].col], [10, 3], 'an explicit tile wins');
  const tiles = units.map((u) => `${u.row},${u.col}`);
  assert.equal(new Set(tiles).size, tiles.length, 'no two units on one tile');
});

test('sandbox: boss and team survive the URL round trip', () => {
  const state = {
    ...DEFAULT_STATE, boss: 'boss_1', bossDifficulty: 'HARD', bossHpMul: 0.25,
    team: [{ unit: 'char_b', skill: 1, row: null, col: null, dir: 'UP' }],
  };
  assert.deepEqual(stateFromQuery(`?${stateToQuery(state)}`), state);
});


test('sandbox: a boss field deploys on bossLeft tiles (GEO.BOSS_RECT), not the normal band', () => {
  const spec = buildSpec({ stage: 'st', wave: 'wv', boss: 'boss_1', hp: 1, atk: 1 }, { ...ctx, bosses: BOSSES });
  const u = spec.players[0].units[0];
  assert.deepEqual([u.row, u.col], [2, 5], 'a bossLeft tile (rows 0-5), not a normal-band tile');
  assert.ok(u.row <= 5, 'GEO.BOSS_RECT rows are 0-5');
});
