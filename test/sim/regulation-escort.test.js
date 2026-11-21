// test/sim/regulation-escort.test.js — the round-84 escort kits ported from the mainline (regulation.js kitGunsho /
// kitSpnshd / kitDsuply …): 速射轻弩手's three-bolt volley, 骸骨卫士长's attack-speed retaliation, and the 补给车 aura
// whose 凋亡 rider joins a 重生造物's attack. Act3 data; content 'generic' + the enemy/boss modules like the other
// enemy tests, so no bond or domain module interferes.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from '../../server/sim/simdata.js';
import { setGameData } from '../../server/sim/content/support/index.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';
import { chessRec, makeBattle } from '../helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const ACT3 = Object.fromEntries(fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => [path.basename(f, '.json'), JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))]));
const wall = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 1 }, rangeGrid: [[0, 0]], skill: null });
// `opts.data` replaces the harness's own DataSource (defs are ignored then): the synthetic wall joins the act3 tables.
const dsWall = new DataSource({ ...ACT3, chess: { ...ACT3.chess, t_wall: wall } });

after(() => setGameData(null));

function fight(enemies) {
  setGameData(ACT3);
  return makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod],
    data: dsWall, seed: 11, autoFinish: false, captureNoisy: true, hooks: ['damaged'],
    kits: { t_wall: () => ({ trait: { noAttack: true } }) },
    units: [{ chessId: 't_wall', row: 9, col: 5 }],
    enemies,
  });
}

test('速射轻弩手: one volley is three 100 % ATK bolts at the first ally on its line', () => {
  const h = fight([{ key: 'enemy_1403_gunsho', time: 0, pos: [9, 6] }]);
  h.step(1);
  const e = h.enemies()[0];
  const u = h.allies()[0];
  assert.ok(e && u, 'both on the field');
  h.run(4);
  const bolts = h.hooksOf('damaged').filter((c) => c.source === e && c.target === u && (c.dmg?.tags || []).includes('crossBolt'));
  assert.equal(bolts.length, 3, 'three bolts');
  assert.ok(bolts.every((c) => c.type === 'phys'), 'physical');
  assert.ok(bolts.every((c) => Math.abs(c.amount - e.s.atk) < 1e-6), '100 % ATK each');
  assert.equal(h.b.errors.length, 0);
});

test('萨卡兹骸骨卫士长: a hit from an ally slows that ally by 40 ASPD for 5 s', () => {
  const h = fight([{ key: 'enemy_1363_spnshd_2', time: 0, pos: [9, 8] }]);
  h.step(1);
  const e = h.enemies()[0];
  const u = h.allies()[0];
  const before = u.s.aspd;
  h.b.dealDamage(u, e, { amount: 10, type: 'phys', isAttack: true });
  const b = u.findBuff('reg:spnshdSlow');
  assert.ok(b, 'the ASPD debuff is on the attacker');
  assert.equal(b.mods.aspd, -40);
  assert.ok(u.s.aspd <= before - 40 + 1e-6);
  h.run(6);
  assert.ok(!u.findBuff('reg:spnshdSlow'), 'gone after 5 s');
  assert.equal(h.b.errors.length, 0);
});

test('补给车: a 重生造物 carries the aura, and its attack adds the 凋亡 rider', () => {
  const h = fight([
    { key: 'enemy_1224_dsuply', time: 0, pos: [9, 3] },
    { key: 'enemy_1220_dzoms', time: 1, pos: [9, 7] },
  ]);
  h.run(3);
  const reborn = h.b.enemies.find((e) => e.defId === 'enemy_1220_dzoms');
  assert.ok(reborn, 'the 重生造物 is on the field');
  assert.ok(reborn.findBuff('ab:dsuply'), 'the cart aura is on the 重生造物');
  const u = h.allies()[0];
  const before = u.elem?.apoptosis ?? 0;
  h.b.dealDamage(reborn, u, { amount: 1, type: 'phys', isAttack: true });
  assert.ok((u.elem?.apoptosis ?? 0) > before, 'the attack carried the 凋亡 rider');
  assert.equal(h.b.errors.length, 0);
});
