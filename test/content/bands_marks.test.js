// test/content/bands_marks.test.js — the marks an active band skill puts on one operator for its next battle
// (server/sim/content/bands/marks.js): 意志鼓舞's knock-down + revives, 药枚实验's shield on attack, 消解空间's
// knock-down + bench summon. The server side (skill_mark_char_inst_tag → PlayerState.bandMarks → units[].marks) is
// tested in test/versions-bands-skills.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';

const OP = (id) => chessRec({
  id, profession: 'WARRIOR', bonds: [], tier: 1, golden: false, rangeGrid: [[0, 0], [0, 1]],
  stats: { maxHp: 2000, atk: 500, def: 200, res: 0, aspd: 100, bat: 1, respawnTime: 20, spRecovery: 1, blockCnt: 2 },
  skill: { spCost: 60, duration: 5, initSp: 0 },
});
const FOE = (key = 'e_d', o = {}) => enemyRec({ key, hp: 1e7, speed: 1, atk: 100, bat: 1, ...o });

/** A battle whose first unit carries `marks` (units[].marks), one foe per [row, col]. */
function marked(marks, { units, foes = [], defs = {}, foeDefs = {} } = {}) {
  return makeBattle({
    defs: { chess: { t_op: OP('t_op'), ...defs }, enemies: { e_d: FOE(), ...foeDefs } },
    players: [{
      playerId: 'p1', seat: 0, bonds: {}, bandId: null,
      units: (units ?? [{ chessId: 't_op', row: 10, col: 4 }]).map((u, i) => ({ uid: i + 1, kind: 'chess', marks, ...u })),
    }],
    enemies: foes.map(([r, c, key]) => ({ key: key ?? 'e_d', pos: [r, c] })),
    timeLimit: 999, autoFinish: false,
  });
}

test('意志鼓舞: knocked down and revived at battle start, then two more revives', () => {
  const h = marked([{ tag: 'revive', count: 2, startDead: true }]);
  h.step(1);
  const u = h.unit('t_op');
  assert.ok(u.alive, 'the start knock-down revived it');
  assert.equal(u.hp, u.s.maxHp, 'at full HP');
  h.b.kill(u);
  assert.ok(u.alive, 'first extra revive');
  h.b.kill(u);
  assert.ok(u.alive, 'second extra revive');
  h.b.kill(u);
  assert.ok(!u.alive, 'no third: the marker counted two');
});

test('药枚实验: every attack has the mark\'s chance of one shield layer (max 1)', () => {
  // a harmless foe: the shield must not be eaten by an enemy hit before the assertion
  const h = marked([{ tag: 'shield_on_attack', prob: 1, cap: 1 }], { foes: [[10, 6]], foeDefs: { e_d: FOE('e_d', { atk: 0 }) } });
  h.step(1);
  h.run(4);
  const u = h.unit('t_op');
  const b = u.findBuff('bandmark:shield');
  assert.ok(b && b.shieldHits === 1, 'one shield layer at prob 1');
});

test('消解空间: the first damage taken knocks the operator down and deploys the bench operator', () => {
  const h = marked([{ tag: 'knockdown_summon', summon: { chessId: 't_bench', skillIndex: 0 } }],
    { defs: { t_bench: OP('t_bench') }, foes: [[10, 6]] });
  h.step(1);
  const u = h.unit('t_op');
  h.run(4);
  assert.ok(!u.alive, 'the marked operator is knocked down');
  const bench = h.allies().find((a) => a.defId === 't_bench' && a.alive);
  assert.ok(bench, 'the bench operator stands on the field');
  assert.ok(bench.deployed);
});

test('a mark without its payload does nothing', () => {
  const h = marked([{ tag: 'knockdown_summon' }], { foes: [[10, 6]] });
  h.step(1);
  const u = h.unit('t_op');
  h.run(4);
  assert.ok(!u.alive, 'still knocked down');
  assert.equal(h.allies().filter((a) => a.alive).length, 0, 'nothing summoned');
});


// ---- player-level marks: a tile, the treasure, an equipment lend ---------------------------------------------

/** A battle with no operators, carrying player-level band marks (PlayerBattleInput.bandMarks). */
function globalMarks(marks, opts = {}) {
  return makeBattle({
    defs: { chess: {}, enemies: { e_d: FOE('e_d'), ...(opts.enemyDefs || {}) } },
    players: [{ playerId: 'p1', seat: 0, bonds: {}, bandId: null, units: opts.units ?? [], bandMarks: marks }],
    enemies: opts.foes ?? [],
    timeLimit: opts.timeLimit ?? 3, autoFinish: false,
  });
}

test('溃心领域: only the first enemy through the marked tile is feared', () => {
  const h = globalMarks([{ tag: 'fear_tile', row: 10, col: 9, fear: 3 }], {
    foes: [{ key: 'e_d', pos: [10, 9], time: 0 }, { key: 'e_d', pos: [10, 9], time: 5 }],
    timeLimit: 8,
  });
  const spawned = [];
  h.b.on('enemySpawn', (c) => spawned.push(c.enemy));
  h.step(2);
  assert.ok(spawned[0] && spawned[0].s.flags.fear, 'the first enemy is feared');
  h.run(5.2);
  assert.equal(spawned.length, 2, 'the second enemy spawned');
  assert.ok(!spawned[1].s.flags.fear, 'the first pass used the mark up');
});

test('宝藏探机: a surviving chest pays its coin, a touched one vanishes', () => {
  const defs = { e_chest: FOE('e_chest', { hp: 100, speed: 0, atk: 0, lpr: 0 }) };
  const survive = globalMarks([{ tag: 'treasure', row: 10, col: 8, enemyId: 'e_chest', coin: 1 }], { enemyDefs: defs });
  survive.runToEnd();
  assert.equal(survive.result().perPlayer.p1.coins, 1, 'still there at the end');

  const touched = globalMarks([{ tag: 'treasure', row: 10, col: 8, enemyId: 'e_chest', coin: 1 }], {
    enemyDefs: defs, foes: [{ key: 'e_d', pos: [10, 8], time: 0 }],
  });
  touched.runToEnd();
  assert.ok(!touched.enemies().some((e) => e.alive && e.defId === 'enemy_e_chest'), 'the chest vanished on the touch');
  assert.equal(touched.result().perPlayer.p1.coins || 0, 0, 'no coin for a touched chest');
});

test('宝藏探机: contact is body overlap, not the tile centre', () => {
  const defs = { e_chest: FOE('e_chest', { hp: 100, speed: 0, atk: 0, lpr: 0 }) };
  const touched = globalMarks([{ tag: 'treasure', row: 10, col: 8, enemyId: 'e_chest', coin: 1 }], { enemyDefs: defs });
  touched.step();
  touched.b.spawnEnemy('e_d', { pos: [10.55, 8], mods: { speedMul: 0 } });
  touched.step(2);
  assert.ok(!touched.enemies().some((e) => e.alive && e.defId === 'enemy_e_chest'), '0.55 from the tile centre touches');
  const clear = globalMarks([{ tag: 'treasure', row: 10, col: 8, enemyId: 'e_chest', coin: 1 }], { enemyDefs: defs });
  clear.step();
  clear.b.spawnEnemy('e_d', { pos: [10.7, 8], mods: { speedMul: 0 } });
  clear.step(2);
  assert.ok(clear.enemies().some((e) => e.alive && e.defId === 'enemy_e_chest'), '0.7 does not');
});

test('电气化！: the lent equipment reaches every deployed operator with a free slot', () => {
  const h = makeBattle({
    defs: { chess: { t_op: OP('t_op'), t_full: OP('t_full') }, enemies: { e_d: FOE('e_d') } },
    players: [{
      playerId: 'p1', seat: 0, bonds: {}, bandId: null,
      units: [
        { uid: 1, kind: 'chess', chessId: 't_op', row: 10, col: 4 },
        { uid: 2, kind: 'chess', chessId: 't_full', row: 11, col: 4, items: ['x', 'y'] },
      ],
      bandMarks: [{ tag: 'lend_equip', itemId: 'chess_item_1_01_e_a', slots: 2 }],
    }],
    enemies: [], timeLimit: 5, autoFinish: false,
  });
  h.step(1);
  const lender = h.unit('t_op');
  const full = h.unit('t_full');
  assert.ok(lender.s.atk > 500, 'the +15 % ATK of the item reached the free operator');
  assert.equal(full.s.atk, 500, 'no free slot, no lend');
  assert.equal(lender.items.length, 0, 'a lend is not a carried item');
});
