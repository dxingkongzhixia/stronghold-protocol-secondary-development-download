// test/versions-corebond.test.js — 规程 personal briefing: the core bonds split into two groups, the player keeps one
// (g.coreBond) and the other's operators leave the simulation (bonds join the match's bans, the pool is rebuilt).
// The default 盟约 match has no such choice.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, setData, resetData } from '../server/data.js';
import { GameData } from '../server/match/gamedata.js';
import { makeMatch, DATA } from './match/harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1');
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
after(() => resetData());

test('规程 solo: two core-bond groups, one chosen, the other group leaves the pool', () => {
  const data = loadData(DIR, { log: quiet });
  setData(data);
  const h = makeMatch({ mode: 'solo', humans: 1, seed: 11, data });
  h.start();
  const m = h.m, ps = h.ps('p_0');
  assert.equal(m.phase, 'INFO_CHECK');
  assert.equal(m.coreBondGroups.length, 2);
  const all = m.coreBondGroups.flat();
  assert.equal(new Set(all).size, all.length, 'the groups are disjoint');
  const core = m.gd.bondIds.filter((b) => m.gd.bond(b)?.isCore && !m.gd.modeInactiveBonds.has(b));
  assert.deepEqual([...all].sort(), [...core].sort(), 'every active core bond is in a group');

  // an operator whose only core bond sits in the OTHER group leaves after the choice
  const other = m.coreBondGroups[0];
  const off = new Set([...m.disabledBonds, ...m.staticInactiveBonds, ...other]);
  const leaving = m.gd.visibleChess.find((id) => {
    const bonds = m.gd.chess(id)?.bonds || [];
    return bonds.length > 0 && bonds.every((b) => off.has(b)) && m.pool.entries.has(id);
  });
  assert.ok(leaving, 'some operator belongs only to the other group and is in the pool');

  assert.deepEqual(h.m.handle(ps.playerId, { t: 'g.coreBond', group: 1 }), { ok: true });
  assert.equal(ps.coreBondPick, 1);
  assert.ok(m.disabledBonds.includes(other[0]));
  assert.ok(!m.pool.entries.has(leaving), 'the other group left the pool');
  assert.equal(ps.privateView().coreBond.pick, 1);
  assert.equal(h.m.handle(ps.playerId, { t: 'g.coreBond', group: 0 }).error, 'BAD_TARGET', 'one pick only');
});

test('规程 solo: a briefing without a pick takes the default group 0', () => {
  const data = loadData(DIR, { log: quiet });
  setData(data);
  const h = makeMatch({ mode: 'solo', humans: 1, seed: 12, data });
  h.start();
  h.autoHumans();
  h.toPrep(1);
  const m = h.m;
  assert.equal(m.coreBondPicked, 0);
  assert.ok(m.disabledBonds.includes(m.coreBondGroups[1][0]));
});

test('the default 盟约 match has no core-bond choice', () => {
  const h = makeMatch({ mode: 'solo', humans: 1, seed: 13, data: DATA }).start();
  const m = h.m, ps = h.ps('p_0');
  assert.equal(m.coreBondGroups, null);
  assert.equal(m.handle(ps.playerId, { t: 'g.coreBond', group: 0 }).error, 'BAD_TARGET');
});

test('规程 core-first ban: 初雪 leaves with 谢拉格 off though 协防 is lit; the covenant keeps her', () => {
  const data = loadData(DIR, { log: quiet });
  const gd = new GameData(data, 'mode_single_normal');
  assert.equal(gd.regulationBondDraw, true);
  const hatsu = gd.chess('chess_char_3_09_a');
  assert.deepEqual(hatsu.bonds, ['kjeragShip', 'emptyShip'], 'a core bond and a lit add-on');
  assert.equal(gd.bondsExclude(hatsu, new Set(['kjeragShip'])), true, '规程: the core is off → excluded');
  assert.equal(gd.bondsExclude(hatsu, new Set(['emptyShip'])), false, '规程: the core is lit → kept');
  // the covenant keeps its joint every-bond rule on the same record
  const def = new GameData(DATA, 'mode_multi_normal');
  assert.equal(def.regulationBondDraw, false);
  assert.equal(def.bondsExclude(hatsu, new Set(['kjeragShip'])), false, '盟约: 协防 is lit → kept');
  assert.equal(def.bondsExclude(hatsu, new Set(['kjeragShip', 'emptyShip'])), true);
});

test('规程 core-first ban: any lit core keeps a multi-core operator; a coreless one follows every add-on', () => {
  const gd = new GameData(loadData(DIR, { log: quiet }), 'mode_multi_hard');
  const multi = gd.chess('chess_char_2_07_a');   // 复奏: 莱塔尼亚 + 叙拉古, both core
  assert.equal(gd.bondsExclude(multi, new Set(['lethaniaShip'])), false, '叙拉古 still lit');
  assert.equal(gd.bondsExclude(multi, new Set(['lethaniaShip', 'siracusaShip'])), true, 'every core off');
  const coreless = gd.chess('chess_char_1_07_a'); // 灰喉: 精准 only
  assert.equal(gd.bondsExclude(coreless, new Set(['preciShip'])), true);
  assert.equal(gd.bondsExclude(coreless, new Set([])), false);
});
