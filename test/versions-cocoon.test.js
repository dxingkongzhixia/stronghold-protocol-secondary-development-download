// test/versions-cocoon.test.js — 规程 boss_12 / boss_15 假想敌：蛛's 淤困捕食 and its 淤困之茧 (enemy_9036_acweb).
// The official Net selector respects target-free/camouflage (an 隐匿 operator gets no cocoon and consumes no slot), while
// 悲惨之雨's area effect ignores targetability; the cocoon binds the operator on its tile (disarm / silence / no block)
// and loses 4 % of its own max HP a second. These are version-only enemies, so the test loads the 规程 data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../server/data.js';
import { DataSource } from '../server/sim/simdata.js';
import { setGameData } from '../server/sim/content/support/index.js';
import * as enemiesMod from '../server/sim/content/enemies.js';
import * as bossesMod from '../server/sim/content/bosses.js';
import { makeBattle, chessRec } from './helpers/battleHarness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quiet = { warn() {}, error() {}, info() {} };
const RAW = loadData(path.join(ROOT, 'data', 'versions', 'act3autochess-v3_1'), { log: quiet });

const CHESS = {
  t_hidden: chessRec({ id: 't_hidden', profession: 'SNIPER', stats: { maxHp: 1e7, atk: 0, blockCnt: 0 }, rangeGrid: [[0, 0]], skill: null }),
  t_visible: chessRec({ id: 't_visible', profession: 'SNIPER', stats: { maxHp: 1e6, atk: 0, blockCnt: 0 }, rangeGrid: [[0, 0]], skill: null }),
};
const data = new DataSource({ ...RAW, chess: { ...RAW.chess, ...CHESS } });

function fight(t) {
  setGameData(RAW);
  t.after(() => setGameData(null));
  const h = makeBattle({
    data, content: 'generic', extraContent: [enemiesMod, bossesMod], autoFinish: false, timeLimit: 40, seed: 3,
    players: [{
      playerId: 'p1', seat: 0, side: 'L',
      units: [
        { uid: 1, kind: 'chess', chessId: 't_hidden', row: 10, col: 4 },
        { uid: 2, kind: 'chess', chessId: 't_visible', row: 10, col: 6 },
      ],
    }],
  });
  h.step();
  h.b.addBuff(h.unit(1), { key: 'test:stealth', persist: true, flags: { stealth: true } });
  t.after(() => assert.equal(h.b.errorCount, 0));
  return h;
}

const wait = (pos) => ({ motion: 'WALK', start: pos, end: pos, steps: [{ t: 'wait', s: 99999 }] });
const put = (h, key, pos) => h.spawn(key, { pos, route: wait(pos) });
const webs = (h) => h.enemies().filter((e) => e.defId === 'enemy_9036_acweb');
const bindOf = (u) => u.buffs.find((b) => b.key.startsWith('reg:bind:'));

test('规程 淤困捕食: an 隐匿 operator gets no cocoon; the visible one does', (t) => {
  const h = fight(t);
  assert.ok(h.unit(1).s.flags.stealth);
  const hidden = h.unit(1), visible = h.unit(2);
  put(h, 'enemy_9035_acspider', [10, 10]);
  h.run(15.5); // 淤困捕食: initial cooldown 15 s (PRTS)
  const list = webs(h);
  assert.equal(list.length, 1, 'one cocoon (the only targetable operator)');
  assert.deepEqual([list[0].x, list[0].y], [visible.x, visible.y]);
  assert.ok(bindOf(visible), 'the cocoon binds the visible operator');
  assert.equal(bindOf(hidden), undefined, 'no bind on the stealth operator');
});

test('规程 淤困之茧: binds the operator on its tile and loses its own max HP', (t) => {
  const h = fight(t);
  const u = h.unit(2), web = put(h, 'enemy_9036_acweb', [u.tileR, u.tileC]);
  h.step();
  assert.ok(web.findBuff('reg:web'), '自缚 + no displacement');
  assert.equal(web.stats.attacks, 0, 'the cocoon never attacks');
  const bind = bindOf(u);
  assert.ok(bind, 'the operator on its tile is bound');
  assert.equal(bind.flags.disarm, true);
  assert.equal(bind.flags.silence, true);
  assert.equal(bind.mods.blockCnt, -99);
  const hp = web.hp;
  h.run(1.05);
  assert.ok(hp - web.hp >= web.s.maxHp * 0.04 - 1, '4 % of its max HP a second');
  h.b.kill(web);
  h.step();
  assert.equal(bindOf(u), undefined, 'the bind is cleared when the cocoon dies');
});

test('规程 悲惨之雨: the area effect still reaches an 隐匿 operator', (t) => {
  const h = fight(t);
  const hidden = h.unit(1), hp = hidden.hp;
  const spider = put(h, 'enemy_9035_acspider_2', [10, 10]);
  spider.hp = spider.s.maxHp * 0.4;
  h.run(26); // AcidRain: 初始冷却 25 s (PRTS 隐秘核心 假想敌：茧)
  assert.ok(hidden.s.flags.stealth, 'still hidden');
  assert.ok(hidden.findBuff('reg:acid'), 'the rain debuff lands on it');
  assert.ok(hp - hidden.hp > 0, 'and its true damage ticks');
});
