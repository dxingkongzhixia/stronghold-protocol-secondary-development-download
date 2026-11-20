// server/sim/content/regulation-bosses.js — 规程·序列Ⅰ leaders and their parts (act3autochess@V3_1).
//
// Kept off BOSS_KITS: test/content/enemies_bosses.test.js requires every BOSS_KITS key to exist in the default
// enemies.json, and these keys are regulation-only. bosses.js onSpawn falls back to REGULATION_BOSS_KITS.
// This module does not import enemies.js or bosses.js (those import it).
//
// Official numbers come from the built enemy record (talents / skills). Points with no blackboard are marked [ASSUMED].

import { COLS } from '../constants.js';
import { hypot } from '../detmath.js';
import {
  hurt, elem, areaAllies, allTargets, alliesInTiles, zone, remainingRoute, lpLoss, canCast, castSlot, watchDeaths,
} from './enemies/helpers.js';
import { skill, blinkForward } from './enemies/archetypes.js';
import { activateTraps, spawnTrap, trapSpot, TRAP_KEY } from './traps.js';

const MECH = 'enemy_9029_acfnc';
const MECH_2 = 'enemy_9029_acfnc_2';
const GEAR = 'enemy_9028_acfncb';
const ARMOR = 'enemy_9027_acfnca';
const SPIDER = 'enemy_9035_acspider';
const SPIDER_2 = 'enemy_9035_acspider_2';
const WEB = 'enemy_9036_acweb';
const EEL = 'enemy_9037_aceel';
const EEL_2 = 'enemy_9037_aceel_2';
const BEAST = 'enemy_2124_dyjsfg';
const TAIL = 'enemy_2123_dyjsww';

/** [ASSUMED] hidden 械 chain has no range key. */
const CHAIN_RANGE = 2.5;
/** [ASSUMED] 冲击之械 contact with the mech, and the slam's radius. */
const ARMOR_HIT = 0.7;
const SLAM_RADIUS = 0.9;
/** [ASSUMED] 后兽 blink distance (the skill blackboard has no distance). */
const BLINK_DIST = 2;
/** Operator deploy direction in world (dx, dy): UP is toward row 0, RIGHT +x. */
const FACING = Object.freeze({ UP: Object.freeze([0, -1]), DOWN: Object.freeze([0, 1]), LEFT: Object.freeze([-1, 0]), RIGHT: Object.freeze([1, 0]) });
/** [ASSUMED] 并济 splash around the locked operator (PRTS: 半径 1.5). */
const PUNISH_RADIUS = 1.5;

const num = (v, d) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v)) return +v;
  return d;
};
const tv = (ab, key, d) => num(ab && ab.t ? ab.t[key] : undefined, d);
const sv = (map, key) => {
  const v = map && map[key];
  return typeof v === 'string' && v ? v : '';
};
const bb = (sk, key, d) => num(sk && sk.bb ? sk.bb[key] : undefined, d);

function spEvery(sk, fire, sil = false) {
  if (!sk || !(sk.sp > 0)) return null;
  return {
    sk, sil,
    tick(b, e, a, dt) {
      if (!canCast(e, sil, b)) return;
      a.acc = (a.acc ?? 0) + dt;
      if (a.acc + 1e-9 < sk.sp) return;
      a.acc = 0;
      castSlot(b, e, sk);
      fire(b, e, a);
    },
  };
}

/** Cooldown skills go through skill(); SP-only skills must not (cd 0 would cast every tick). */
function timed(sk, fire, extra = {}) {
  if (!sk || !fire) return null;
  if (sk.sp > 0 && !(sk.cd > 0)) return spEvery(sk, fire, !!extra.sil);
  if (sk.cd > 0) return skill(sk, fire, extra);
  return null;
}

function waitAt(y, x, motion) {
  const p = [y, x];
  return { motion, start: p, end: p, steps: [{ t: 'wait', s: 99999 }] };
}

function toEnd(b, y, x, motion = 'WALK') {
  const end = b.grid.specialTiles('end')[0] || [Math.round(y), Math.round(x)];
  return { motion, start: [y, x], end, checkpoints: [] };
}

function partOpts(parent, pos, route, motion) {
  return {
    pos, route, tag: 'part', countInTotal: false, mods: parent.mods ?? null,
    ownerPlayerId: parent.ownerId ?? null, sourcePlayerId: parent.sourcePlayerId ?? null,
    ...(motion ? {} : {}),
  };
}

function livingOf(b, key, bossId) {
  const out = [];
  for (const u of b.aliveEnemies()) {
    if (u.defId === key && (bossId == null || u.mem.regBossId === bossId)) out.push(u);
  }
  return out;
}

function nearestAlly(b, src, from, range, seen) {
  let best = null;
  let bd = range;
  for (const u of areaAllies(b, src, from.x, from.y, range)) {
    if (!u || seen.has(u.id)) continue;
    const d = hypot(u.x - from.x, u.y - from.y);
    if (d > range + 1e-9) continue;
    if (!best || d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && u.id < best.id)) { best = u; bd = d; }
  }
  return best;
}

/** 【洪流攻势】 picks one highest-block operator on each player field (PRTS: 左侧/右侧玩家场地各一个). */
function highestBlockPerSide(b) {
  const out = [null, null];
  for (const u of b.allies()) {
    if (!u.alive) continue;
    const i = u.x < 10.5 ? 0 : 1;
    const cur = out[i];
    const blk = u.s.blockCnt;
    // PRTS 洪流攻势: the highest block count per side, ties to the highest taunt (仇恨值), then the lower id.
    const taunt = u.s.taunt ?? 0, curTaunt = cur ? (cur.s.taunt ?? 0) : 0;
    if (!cur || blk > cur.s.blockCnt
      || (blk === cur.s.blockCnt && (taunt > curTaunt || (taunt === curTaunt && u.id < cur.id)))) out[i] = u;
  }
  return out.filter(Boolean);
}

/** The nearest empty ground tile in the target's 3×3 (PRTS 械: "距离伤害目标最近的一处…可通行且没有障碍物的地面地块"). */
function summonTile(b, t) {
  const y = t.tileR ?? Math.round(t.y), x = t.tileC ?? Math.round(t.x);
  let best = null;
  let bd = Infinity;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = y + dr, c = x + dc;
      if (!b.grid.inRect(r, c) || !b.grid.groundPassable(r, c) || b.unitAt(r, c)) continue;
      const d = hypot(dr, dc);
      if (d < bd - 1e-9) { bd = d; best = [r, c]; }
    }
  }
  return best;
}

function spawnGear(b, boss, at, key) {
  if (!key || !at) return null;
  // PRTS 械: a summoned 量变之械 walks to the portal on its spawn side (left of the mech -> left portal, else
  // right), with its spawn tile as the first waypoint.
  const ends = b.grid.specialTiles('end') || [];
  const left = at.x < boss.x;
  const end = ends.find(([, c]) => (left ? c < boss.x : c >= boss.x)) ?? ends[0] ?? [Math.round(at.y), Math.round(at.x)];
  return b.spawnEnemy(key, partOpts(boss, [at.y, at.x], { motion: 'WALK', start: [at.y, at.x], end, checkpoints: [] }));
}

function spawnArmorPair(b, boss) {
  const out = [];
  for (let i = 0; i < 2; i++) {
    const dir = i === 0 ? -1 : 1;
    // PRTS 械: 左侧 2 格上方 1 格 / 右侧 2 格上方 1 格 (up = one row less).
    const y = boss.y - 1;
    const x = boss.x + dir * 2;
    const u = b.spawnEnemy(ARMOR, partOpts(boss, [y, x], waitAt(y, x, 'FLY')));
    if (!u) continue;
    u.mem.regDir = dir;
    u.mem.regPair = i;
    u.mem.regBossId = boss.id;
    out.push(u);
  }
  return out;
}

function killArmors(b, bossId) {
  const list = livingOf(b, ARMOR, bossId);
  for (let i = 0; i < list.length; i++) b.kill(list[i], null);
}

// ---------------------------------------------------------------------------------------------------------------
// 假想敌：械

function kitGear(ab) {
  const scale = tv(ab, 'FirstAtkDouble.damage_scale', 2);
  return [{
    hitOut(c, b, e, a) {
      if (a.used || !c.dmg || !c.dmg.isAttack) return;
      a.used = true;
      c.dmg.mul *= scale;
    },
  }];
}

function kitArmor(ab) {
  const speed = tv(ab, 'MoveSpeed.move_speed', 5);
  const thresh = tv(ab, 'Init.damage_threshold', 500);
  const step = tv(ab, 'Init.move_step', 0.05);
  const maxOff = tv(ab, 'Init.max_offset_per_second', 0.5);
  const stacks = tv(ab, 'Falldown.max_valid_stack_cnt', 5);
  const slamScale = bb(ab.sk.FalldownImpl, 'atk_scale', 1);
  const boundAspd = bb(ab.sk.Bound, 'attack_speed', -100);
  return [
    {
      spawn(b, e) {
        b.addBuff(e, { key: 'reg:hold', persist: true, flags: { untargetable: true, noMove: true } });
      },
      tick(b, e, a, dt) {
        if (e.mem.regLaunch && !a.flying) {
          a.flying = true;
          b.removeBuff(e, 'reg:hold');
          b.addBuff(e, { key: 'reg:flyhold', persist: true, flags: { noMove: true } });
        }
        if (!a.flying || a.stopped) {
          applyBound(b, e, boundAspd);
          return;
        }
        const dir = e.mem.regDir === -1 ? -1 : 1;
        let drift = 0;
        const pend = a.pending ?? 0;
        const cap = maxOff * dt;
        const take = Math.min(Math.abs(pend), cap);
        if (take > 0) {
          const sign = pend > 0 ? 1 : -1;
          a.pending = pend - sign * take;
          drift = sign * take;
        }
        e.x += dir * speed * dt + drift;
        const seen = a.seen || (a.seen = {});
        const passed = a.passed || (a.passed = {});
        for (const u of b.allies()) {
          const s = Math.sign(e.x - u.x);
          const prev = seen[u.id];
          if (prev == null) { seen[u.id] = s; continue; }
          if (s !== 0 && prev !== 0 && s !== prev && !passed[u.id]) {
            passed[u.id] = true;
            a.passN = (a.passN ?? 0) + 1;
          }
          if (s !== 0) seen[u.id] = s;
        }
        const edge = e.x < 0.2 || e.x > COLS - 1.2;
        if (!a.slammed && ((a.passN ?? 0) >= stacks || edge)) {
          a.slammed = true;
          a.stopped = true;
          for (const u of areaAllies(b, e, e.x, e.y, SLAM_RADIUS)) hurt(b, e, u, e.s.atk * slamScale, 'phys');
        }
        const boss = b.enemies.find((o) => o.alive && o.id === e.mem.regBossId && (o.defId === MECH || o.defId === MECH_2));
        if (boss && hypot(e.x - boss.x, e.y - boss.y) < ARMOR_HIT) killArmors(b, boss.id);
        applyBound(b, e, boundAspd);
      },
      taken(c, b, e, a) {
        if (!a.flying) return;
        const amt = num(c.amount, 0);
        if (!(amt > 0) || !(thresh > 0)) return;
        a.dmgAcc = (a.dmgAcc ?? 0) + amt;
        const room = stacks - (a.driftStacks ?? 0);
        const dir = e.mem.regDir === -1 ? -1 : 1;
        for (let n = 0; n < room && a.dmgAcc + 1e-9 >= thresh; n++) {
          a.dmgAcc -= thresh;
          a.driftStacks = (a.driftStacks ?? 0) + 1;
          a.pending = (a.pending ?? 0) - dir * step;
        }
      },
    },
    // Own 【威光冲击】 (SP 45). The mech's LaunchArmor sets the same flag. Bound's million-second cooldown is not a cast.
    spEvery(ab.sk.Launch, (b, e) => { e.mem.regLaunch = true; }),
  ];
}

function applyBound(b, e, aspd) {
  const bossId = e.mem.regBossId;
  if (bossId == null) return;
  const launched = [];
  for (const u of b.aliveEnemies()) {
    if (u.defId === ARMOR && u.mem.regBossId === bossId && u.mem.regLaunch) launched.push(u);
  }
  if (launched.length < 2) return;
  let low = launched[0];
  for (let i = 1; i < launched.length; i++) if (launched[i].id < low.id) low = launched[i];
  if (low !== e) return;
  // PRTS 减速力场: the line between the two 冲击之械, width 2.9 — allies inside the 1.45 half-width band lose 100 ASPD.
  const a0 = launched[0], a1 = launched[1];
  const vx = a1.x - a0.x, vy = a1.y - a0.y;
  const len2 = vx * vx + vy * vy;
  const HALF_WIDTH = 2.9 / 2;
  for (const ally of b.allies()) {
    let t = 0;
    if (len2 > 1e-12) t = Math.max(0, Math.min(1, ((ally.x - a0.x) * vx + (ally.y - a0.y) * vy) / len2));
    const px = a0.x + t * vx, py = a0.y + t * vy;
    if (hypot(ally.x - px, ally.y - py) <= HALF_WIDTH) {
      b.addBuff(ally, { key: 'reg:bound', duration: 0.35, refresh: 'replace', mods: { aspd } });
    }
  }
}

function kitMech(ab) {
  const half = ab.t['Armor.hp_ratio'];
  const halfRatio = typeof half === 'number' && half > 0 ? half : 0;
  const cut = tv(ab, 'Armor.damage_scale', 0.5);
  const gearKey = sv(ab.tS, 'Summon.enemy_key') || GEAR;
  const jumps = tv(ab, 'Summon.attack@hit_times', 0);
  const chainScale = tv(ab, 'Summon.attack@chain.atk_scale', 0.8);
  const squad = ab.sk.SommonSquad;
  const squadTiles = squad ? Math.max(1, Math.min(4, bb(squad, 'cnt', 4))) : 0;
  const SQUAD_DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];   // 上 / 右 / 下 / 左 (PRTS)
  return [
    {
      spawn(b, e) {
        // 普通攻击可以攻击全场范围内的我方单位 (PRTS 假想敌：械): the engine's swing only reaches a blocker at range 0,
        // so the normal attack is scripted in tick (100 % ATK physical, engine priority order)
        e.profile.noAttack = true;
        // 隐秘核心：登场时召唤冲击之械 (PRTS 假想敌：械 · 隐秘核心).
        if (e.defId === MECH_2) spawnArmorPair(b, e);
      },
      tick(b, e, a, dt) {
        a.atk = (a.atk ?? 0) - dt;
        if (a.atk <= 0) {
          const t = allTargets(b, e)[0];
          if (t) {
            a.atk = Math.max(0.5, e.s.interval);
            b.dealDamage(e, t, { amount: e.s.atk, type: e.s.dmgType || 'phys', isAttack: true, tags: ['enemyAbility'] });
          }
        }
        if (!halfRatio || a.armed || !(e.hpRatio < halfRatio)) return;
        a.armed = true;
        // PRTS: 首次低于 50% 时强制击倒场上所有冲击之械，随后在两侧上方各召唤一个，进入护甲形态.
        killArmors(b, e.id);
        spawnArmorPair(b, e);
      },
      hitIn(c, b, e, a) {
        if (!(cut > 0) || cut >= 1) return;
        // 护甲形态: sourceless damage and any source whose x differs from the mech's are cut to 50 % — while at
        // least one 冲击之械 is on the field (PRTS 械 "横坐标与自身不同" + 冲击之械 "在场时…对应方向").
        const armors = livingOf(b, ARMOR, e.id);
        if (!armors.length) return;
        if (!c.source) {
          if (a && a.armed) c.dmg.mul *= cut;
          return;
        }
        const side = Math.sign(c.source.x - e.x);
        if (side !== 0 && a && a.armed) c.dmg.mul *= cut;
      },
      dealt(c, b, e) {
        const t = c.target;
        if (t) {
          const spot = summonTile(b, t);
          if (spot) spawnGear(b, e, { y: spot[0], x: spot[1] }, gearKey);
        }
        if (!(jumps > 0) || !t) return;
        let from = t;
        const seen = new Set([t.id]);
        let mul = chainScale;
        for (let i = 0; i < jumps && i < 8; i++) {
          const n = nearestAlly(b, e, from, CHAIN_RANGE, seen);
          if (!n) break;
          seen.add(n.id);
          hurt(b, e, n, e.s.atk * mul, c.dmg && c.dmg.type === 'arts' ? 'arts' : 'phys');
          mul *= chainScale;
          from = n;
        }
      },
    },
    timed(ab.sk.LaunchArmor, (b, e) => {
      for (const a of livingOf(b, ARMOR, e.id)) a.mem.regLaunch = true;
    }),
    spEvery(ab.sk.SkSummonArmor, (b, e) => {
      killArmors(b, e.id);
      spawnArmorPair(b, e);
    }),
    timed(squad, (b, e) => {
      const key = sv(squad.bs, 'enemy_key') || gearKey;
      const sides = highestBlockPerSide(b);
      if (!sides.length) return;
      // "在每个所选单位上、右、下、左侧的四个地块上分别召唤1个量变之械（对应地块不可通行时取消该地块的召唤）"
      for (const ally of sides) {
        for (let i = 0; i < squadTiles; i++) {
          const [dr, dc] = SQUAD_DIRS[i];
          const r = ally.tileR + dr, c = ally.tileC + dc;
          if (!b.grid.inRect(r, c) || !b.grid.groundPassable(r, c) || b.unitAt(r, c)) continue;
          spawnGear(b, e, { y: r, x: c }, key);
        }
      }
    }, { cond: (b) => highestBlockPerSide(b).length > 0 }),
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// 假想敌：茧

function pickByHp(b, enemy, maxTarget, batch) {
  const by = new Map();
  // Official Attack / Net selectors keep _ignoreTargetFree and _forceIgnoreCamouflage at 0.
  // Filter before ranking so an ineligible high-HP unit neither gets hit nor consumes a target slot.
  for (const u of allTargets(b, enemy)) {
    // 3 期 maps are one 19×21 battlefield: the two "player fields" PRTS names are its left / right halves
    // (our sim gives each player their own battle, so ownerId would be one group here).
    const id = u.x < 10.5 ? 'L' : 'R';
    let list = by.get(id);
    if (!list) { list = []; by.set(id, list); }
    list.push(u);
  }
  const picked = [];
  const owners = [...by.keys()].sort();
  for (let i = 0; i < owners.length; i++) {
    const list = by.get(owners[i]);
    list.sort((a, c) => (c.hp - a.hp) || (a.id - c.id));
    const n = Math.min(list.length, maxTarget);
    for (let k = 0; k < n; k++) picked.push(list[k]);
  }
  if (picked.length > batch) {
    picked.sort((a, c) => (c.hp - a.hp) || (a.id - c.id));
    picked.length = batch;
  }
  return picked;
}

/**
 * 【淤困捕食】 (PRTS: "在左侧玩家场地和右侧玩家场地上，各随机选择2个我方单位"): `perSide` random units per half
 * (our 19×21 field is the two player halves), each side's picks from the eligible targets only, the total capped at
 * `batch` (the Hidden Core form raises both counts). The normal attack keeps pickByHp (PRTS: 每侧生命值最高的3个).
 */
function pickRandomBySide(b, enemy, perSide, batch) {
  const by = new Map();
  for (const u of allTargets(b, enemy)) {
    const id = u.x < 10.5 ? 'L' : 'R';
    let list = by.get(id);
    if (!list) { list = []; by.set(id, list); }
    list.push(u);
  }
  const picked = [];
  for (const id of [...by.keys()].sort()) {
    const list = b.rng.shuffle(by.get(id).slice());
    const n = Math.min(list.length, perSide);
    for (let k = 0; k < n; k++) picked.push(list[k]);
  }
  return picked.slice(0, Math.max(0, batch));
}

function refreshEvade(b, e, ab) {
  const ratio = tv(ab, 'Evade.hp_ratio', 0.25);
  const prob = tv(ab, 'Evade.prob', 0);
  const dur = tv(ab, 'Evade.duration', 15);
  if (!(ratio > 0) || !(prob > 0)) return;
  const steps = Math.floor((1 - e.hpRatio) / ratio + 1e-9);
  if (steps <= 0) return;
  b.addBuff(e, { key: 'reg:evade', duration: dur, refresh: 'replace', mods: { dodgePhys: prob, dodgeArts: prob } });
}

function kitSpider(ab) {
  const maxTarget = tv(ab, 'Passive.attack@max_target', 3);
  const batch = tv(ab, 'Passive.attack@batch_max_target', 6);
  const poison = tv(ab, 'Poison.attack@damage', 0);
  const poisonDur = tv(ab, 'Poison.attack@duration', 0);
  const P = { acc: Infinity };
  const net = ab.sk.Net;
  return [
    {
      spawn(b, e) { e.profile.noAttack = true; },
      tick(b, e, a, dt) {
        refreshEvade(b, e, ab);
        if (!canCast(e, false, b)) return;
        P.acc += dt;
        if (!(P.acc >= e.s.interval)) return;
        const targets = pickByHp(b, e, maxTarget, batch);
        if (!targets.length) return;
        P.acc = 0;
        for (let i = 0; i < targets.length; i++) {
          const u = targets[i];
          b.dealDamage(e, u, { amount: e.s.atk, type: 'phys', isAttack: true });
          if (poison > 0 && poisonDur > 0 && u.alive) {
            b.addBuff(u, {
              key: 'reg:poison', duration: poisonDur, refresh: 'replace', interval: 1, visible: true,
              onTick: ({ battle, unit }) => battle.dealDamage(e, unit, {
                // The poison line names no selector. It still ticks on a hidden host [ASSUMED].
                amount: poison, type: 'arts', canDodge: false, ignoreSelect: true, tags: ['enemyAbility', 'poison'],
              }),
            });
          }
        }
        e.lastAttackAt = b.time;
        if (e.stats) e.stats.attacks++;
      },
      taken(c, b, e) { refreshEvade(b, e, ab); },
    },
    timed(net, (b, e) => {
      const n = bb(net, 'max_target', 2);
      const cap = bb(net, 'batch_max_target', 4);
      const key = sv(net.bs, 'enemy_key') || WEB;
      // 【淤困捕食】 picks at random per side; the normal attack above stays highest-HP per side.
      const targets = pickRandomBySide(b, e, n, cap);
      for (let i = 0; i < targets.length; i++) {
        const u = targets[i];
        b.spawnEnemy(key, {
          pos: [u.y, u.x], route: waitAt(u.y, u.x, 'WALK'), countInTotal: false,
          ownerPlayerId: e.ownerId ?? null, sourcePlayerId: e.sourcePlayerId ?? null, mods: e.mods ?? null,
        });
      }
    }),
    timed(ab.sk.AcidRain, (b, e) => acidRain(b, e, ab.sk.AcidRain)),
  ];
}

function acidRain(b, e, sk) {
  const dur = bb(sk, 'duration', 25);
  const iv = Math.max(0.05, bb(sk, 'interval', 0.5));
  const dmg = bb(sk, 'damage', 75);
  const aspd = bb(sk, 'attack_speed', -50);
  // PRTS 悲惨之雨: a TILE effect on each player field (the count is "？"; one per side, the tile with the most
  // surrounding deployed allies), 25 s: allies AND enemies on the tile lose 50 ASPD and take 75 true per 0.5 s.
  for (const side of [0, 1]) {
    const own = b.allies().filter((u) => u.alive && (side === 0 ? u.x < 10.5 : u.x >= 10.5));
    if (!own.length) continue;
    let tile = null, bestN = -1;
    for (const u of own) {
      const n = own.filter((o) => Math.abs(o.tileR - u.tileR) <= 1 && Math.abs(o.tileC - u.tileC) <= 1).length;
      const key = u.tileR * COLS + u.tileC;
      if (n > bestN || (n === bestN && tile && key < tile.r * COLS + tile.c)) { bestN = n; tile = { r: u.tileR, c: u.tileC }; }
    }
    if (!tile) continue;
    zone(b, {
      x: tile.c, y: tile.r, r: 0.5, life: dur, iv, kind: 'acidRain', id: e.id,
      pick: () => {
        const out = [];
        for (const a of b.allies()) if (a.alive && a.tileR === tile.r && a.tileC === tile.c) out.push(a);
        for (const o of b.aliveEnemies()) if (o.alive && o.tileR === tile.r && o.tileC === tile.c) out.push(o);
        return out;
      },
      tick: (units) => {
        for (const u of units) {
          if (!u.alive) continue;
          b.addBuff(u, { key: 'reg:acid', duration: iv + 0.15, refresh: 'replace', mods: { aspd } });
          if (u.side === 'ally') hurt(b, e, u, dmg, 'true');
          else b.dealDamage(null, u, { amount: dmg, type: 'true', sourceless: true, canDodge: false, ignoreSelect: true, tags: ['acidRain'] });
        }
      },
    });
  }
}

function kitWeb(ab) {
  const dur = tv(ab, 'Bundling.duration', 25);
  const ratio = tv(ab, 'Bundling.hp_ratio', 0.04);
  const taunt = tv(ab, 'Bundling.taunt_level', 1);
  const keyOf = (e) => `reg:bind:${e.id}`;
  return [{
    spawn(b, e) {
      e.profile.noAttack = true;
      b.addBuff(e, { key: 'reg:web', persist: true, flags: { noMove: true, noDisplace: true }, mods: { taunt } });
    },
    tick(b, e, a, dt) {
      a.acc = (a.acc ?? 0) + dt;
      if (a.acc + 1e-9 >= 1) {
        a.acc -= 1;
        b.loseHp(e, e.s.maxHp * ratio, { tags: ['enemyAbility'] });
      }
      if (!e.alive) return;
      const bind = keyOf(e);
      for (const u of b.allies()) {
        if (Math.abs(u.x - e.x) < 0.5 && Math.abs(u.y - e.y) < 0.5) {
          b.addBuff(u, {
            key: bind, duration: dur, refresh: 'replace',
            flags: { disarm: true, silence: true }, mods: { blockCnt: -99 },
          });
        }
      }
    },
    death(c, b, e) {
      const bind = keyOf(e);
      for (const u of b.allies()) b.removeBuff(u, bind);
    },
  }];
}

// ---------------------------------------------------------------------------------------------------------------
// 假想敌：鳍

function kitEel(ab) {
  const ratio = tv(ab, 'Passive.attack@ep_damage_ratio', 0.4);
  const chainScale = tv(ab, 'Charge.attack@chain.atk_scale', 0);
  const hasChain = chainScale > 0;
  const shield = ab.sk.ShieldGen;
  const dr = bb(shield, 'damage_resistance', 0.4);
  const nextScale = bb(shield, 'damage_scale', 1.5);
  const weatherIv = tv(ab, 'Weather.interval', 0);
  return [
    {
      spawn(b, e2, a) { a.stacks = {}; },
      tick(b, e2, a, dt) {
        if (e2.blockedBy) {
          if (e2.findBuff('reg:shield')) {
            b.removeBuff(e2, 'reg:shield');
            a.boost = true;
          }
        } else if (!e2.findBuff('reg:shield')) {
          b.addBuff(e2, {
            key: 'reg:shield', persist: true,
            mods: { physTakenMul: Math.max(0, 1 - dr), artsTakenMul: Math.max(0, 1 - dr) },
          });
        }
        if (!(weatherIv > 0)) return;
        a.weather = (a.weather ?? 0) + dt;
        if (a.weather + 1e-9 < weatherIv) return;
        a.weather = 0;
        strikeCrowd(b, e2, ab);
      },
      hitOut(c, b, e2, a) {
        if (!c.dmg || !c.dmg.isAttack || !c.target) return;
        if (a.boost) { c.dmg.mul *= nextScale; a.boost = false; }
        if (!hasChain) return;
        const cap = tv(ab, 'Charge.max_stack_cnt', 5);
        const bonus = tv(ab, 'Charge.atk', 0.2);
        const id = c.target.id;
        const stacks = Math.min(cap, (a.stacks[id] ?? 0) + 1);
        a.stacks[id] = stacks;
        c.dmg.mul *= 1 + stacks * bonus;
        a.jump = { id, stacks };
      },
      dealt(c, b, e2, a) {
        if (!hasChain || !a.jump || !c.target || c.target.id !== a.jump.id) return;
        const stacks = a.jump.stacks;
        a.jump = null;
        const maxT = tv(ab, 'Charge.attack@chain.max_target', 2);
        const per = Math.max(1, tv(ab, 'Charge.attack@selector.stack_per_extra', 1));
        const extra = tv(ab, 'Charge.attack@selector.extra_per_stack', 1);
        const jumps = (maxT - 1) + Math.floor(stacks / per) * extra;
        const range = tv(ab, 'Passive.attack@projectile_range', 1.5);
        const charge = 1 + stacks * tv(ab, 'Charge.atk', 0.2);
        let from = c.target;
        const seen = new Set([from.id]);
        for (let i = 0; i < jumps && i < 8; i++) {
          const n = nearestAlly(b, e2, from, range, seen);
          if (!n) break;
          seen.add(n.id);
          hurt(b, e2, n, e2.s.atk * chainScale * charge, 'arts');
          // Jump arts scales with the charge stacks. The neural proc does not [ASSUMED].
          elem(b, e2, n, 'neural', e2.s.atk * ratio * chainScale);
          from = n;
        }
      },
    },
    ratio > 0 ? { dealt(c, b, e2) { elem(b, e2, c.target, 'neural', e2.s.atk * ratio); } } : null,
    timed(ab.sk.Discharge, (b, e2) => {
      const sk = ab.sk.Discharge;
      const r = bb(sk, 'range_radius', 1.5);
      const scale = bb(sk, 'atk_scale', 1.25);
      const ep = bb(sk, 'ep_damage_ratio', ratio);
      for (const u of areaAllies(b, e2, e2.x, e2.y, r)) {
        hurt(b, e2, u, e2.s.atk * scale, 'arts');
        if (ep > 0) elem(b, e2, u, 'neural', e2.s.atk * ep);
      }
    }, { sil: true }),
  ];
}

/**
 * PRTS 鳍（隐秘核心）雷暴: every 30 s one tile per player field — the one with the most surrounding deployed allies —
 * gets a cross-shaped 落雷 (the tile and its four orthogonal neighbours): 100 % ATK arts + 40 % ATK neural.
 */
function strikeCrowd(b, e, ab) {
  const scale = tv(ab, 'Weather.atk_scale', 1);
  const ep = tv(ab, 'Weather.ep_damage_ratio', 0.4);
  for (const side of [0, 1]) {
    const own = b.allies().filter((u) => u.alive && (side === 0 ? u.x < 10.5 : u.x >= 10.5));
    if (!own.length) continue;
    let tile = null, bestN = -1;
    for (const u of own) {
      const n = own.filter((o) => Math.abs(o.tileR - u.tileR) <= 1 && Math.abs(o.tileC - u.tileC) <= 1).length;
      const key = u.tileR * COLS + u.tileC;
      if (n > bestN || (n === bestN && tile && key < tile.r * COLS + tile.c)) { bestN = n; tile = { r: u.tileR, c: u.tileC }; }
    }
    if (!tile) continue;
    for (const u of alliesInTiles(b, tile.r, tile.c, 'plus', 1)) {
      hurt(b, e, u, e.s.atk * scale, 'arts');
      if (ep > 0) elem(b, e, u, 'neural', e.s.atk * ep);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 矩兽 / 后兽

function kitBeast(ab) {
  const low = tv(ab, 'Huge.enemy_dyjsfg_low_damage_resistance.damage_resistance', 0.35);
  const high = tv(ab, 'Huge.enemy_dyjsfg_high_damage_resistance.damage_resistance', 0.9);
  const tramR = tv(ab, 'Trample.range_radius', 1.6);
  const tramS = tv(ab, 'Trample.atk_scale', 1);
  const tramIv = tv(ab, 'Trample.interval', 2.5);
  const combat = ab.sk.CombatAoe;
  return [
    {
      spawn(b, e) {
        e.profile.noAttack = true;
        // PRTS 矩兽: 占用 3 个阻挡数 (the def normaliser starts at the record's blockCnt 1).
        e.blockWeight = 3;
        const v = -(tv(ab, 'Huge.one_minus_status_resistance', -0.8));
        b.applyStatus(e, 'resist', { source: e, value: v > 0 ? Math.min(1, v) : 0.5 });
        if (!b.aliveEnemies().some((o) => o !== e && o.defId === TAIL)) {
          const route = remainingRoute(e);
          route.start = [e.y, e.x + 1];
          b.spawnEnemy(TAIL, partOpts(e, [e.y, e.x + 1], route));
        }
      },
      tick(b, e, a, dt) {
        // No hp_ratio key on this record: overload once below half health [ASSUMED].
        if (!a.over && e.hpRatio < 0.5) {
          a.over = true;
          b.addBuff(e, {
            key: 'reg:overload', persist: true, visible: true,
            mods: { moveMul: tv(ab, 'Overload.move_speed', 2), atkPct: tv(ab, 'Overload.atk', 0.5) },
          });
          // 【非命】占用阻挡数 +1 (3 -> 4); Overload.block_volume is the increment, not the absolute weight.
          e.blockWeight = 3 + tv(ab, 'Overload.block_volume', 1);
          b.fx('phase', { x: e.x, y: e.y, id: e.id, kind: 'overload' });
        }
        a.tram = (a.tram ?? 0) + dt;
        if (a.tram + 1e-9 < tramIv) return;
        a.tram = 0;
        for (const u of areaAllies(b, e, e.x, e.y, tramR)) hurt(b, e, u, e.s.atk * tramS, 'phys');
      },
      hitIn(c, b, e) {
        // 物理 / 法术伤害降低 (PRTS 明力); true damage is not reduced
        if (!c.dmg || (c.dmg.type !== 'phys' && c.dmg.type !== 'arts')) return;
        const stopped = !!(e.blockedBy || e.s.flags.noMove || (e.route && e.route.waitLeft > 0));
        const dr = stopped ? low : high;
        c.dmg.mul *= Math.max(0, 1 - dr);
      },
      death(c, b, e) {
        const allies = b.allies().slice();
        for (let i = 0; i < allies.length; i++) {
          const u = allies[i];
          // 【兼爱】PRTS 矩兽: "对场上所有非无职业的我方干员/召唤物造成攻击力 200% 的预计算无来源无途径物理伤害".
          if (u.alive) b.dealDamage(e, u, { amount: e.s.atk * 2, type: 'phys', sourceless: true, canDodge: false, ignoreSelect: true, tags: ['enemyAbility'] });
        }
        const others = b.aliveEnemies().slice();
        for (let i = 0; i < others.length; i++) {
          const o = others[i];
          // PRTS: 不会对后兽、召唤物/装置生效.
          if (!o.alive || o === e || o.defId === TAIL || o.notCountInTotal || o.kind === 'device' || o.tag === 'trap') continue;
          o.counted = false;
          o.inTotal = false;
          b.kill(o, null);
        }
      },
    },
    // PRTS 尚同(被阻挡): 每次被阻挡时强制触发一次 200% 攻击力、半径 1.6 的物理伤害 (not a 2 s cooldown while blocked).
    {
      blocked(c, b, e) {
        const r = bb(combat, 'range_radius', 1.6);
        const scale = bb(combat, 'combat_atk_scale', 2);
        for (const u of areaAllies(b, e, e.x, e.y, r)) hurt(b, e, u, e.s.atk * scale, 'phys', { tags: ['splash'] });
      },
    },
  ];
}

function aimAt(unit, y, x) {
  const R = unit.route;
  if (!R || !Array.isArray(R.legs) || !R.legs.length) return;
  const i = Math.max(0, Math.min(R.legs.length - 1, R.legIdx || 0));
  const r = Math.round(y);
  const c = Math.round(x);
  const L = R.legs[i];
  if (L && L.t === 'move' && L.r === r && L.c === c) return;
  const legs = R.legs.slice();
  legs[i] = { t: 'move', r, c, final: i === legs.length - 1 };
  R.legs = legs;
  R.pts = null;
}

function enterForm2(b, e) {
  if (e.mem.regForm2) return;
  e.mem.regForm2 = true;
  b.removeBuff(e, 'reg:untarget');
  const others = b.aliveEnemies();
  for (let i = 0; i < others.length; i++) {
    const o = others[i];
    if (o !== e && o.defId !== TRAP_KEY) aimAt(o, e.y, e.x);   // devices (古雕伥) hold their tile
  }
  activateTraps(b);            // 【无为】 "…进入第二形态并激活场上所有的古雕伥"
  b.fx('phase', { x: e.x, y: e.y, id: e.id, kind: 'form2', form: 'form2' });
}

/**
 * 后兽 【返璞】 (PRTS 第二形态, "按预设路径召唤一批敌人"; the skill's blackboard names the branch `dyjsww_summon`,
 * cooldown 170 / initial 5). The branch's composition is the LEVEL's `branches[branch_id]` — the 后兽 is not in any
 * act3 stage, so this build carries no such branch: the skill spends its cooldown and spawns nothing. A stage that
 * supplies `branches[id]` as `[{ key, count?, pos?, route?, interval? }]` (or `{ spawns: [...] }`) is spawned here.
 */
function summonBranch(b, e, sk) {
  const id = sv(sk.bs, 'branch_id');
  if (!id) return;
  const branch = b.stage?.branches?.[id] ?? b.data?.stage?.branches?.[id] ?? null;
  const spawns = Array.isArray(branch) ? branch : Array.isArray(branch?.spawns) ? branch.spawns : null;
  if (!spawns) return;
  for (const s of spawns) {
    if (!s || typeof s.key !== 'string') continue;
    const pos = Array.isArray(s.pos) ? s.pos : [e.y, e.x];
    const route = s.route ?? toEnd(b, pos[0], pos[1]);
    b.spawnEnemy(s.key, { pos, route, count: s.count ?? 1, interval: s.interval ?? 0, ...partOpts(e, pos, s.route ?? null) });
  }
}

function kitTail(ab) {
  const radius = tv(ab, 'ReturnToDust.range_radius', 1.5);
  const atkStep = tv(ab, 'ReturnToDust.atk', 0.2);
  const maxStack = tv(ab, 'ReturnToDust.max_stack_cnt', 20);
  const artsScale = tv(ab, 'ReturnToDust.atk_scale', 0.5);
  const life = tv(ab, 'ReturnToDust.life_value', 1);
  const levelIv = tv(ab, 'LevelUp.interval', 500);
  const blink = ab.sk.Blink;
  const punish = ab.sk.Punishment;
  const doom = ab.sk.GlobalDoom;
  const branch = ab.sk.SummonBranchEnemy;
  return [
    {
      spawn(b, e) {
        e.profile.noAttack = true;
        // 自缚 (PRTS 后兽: "自缚；被阻挡时进行普通攻击…"): it holds its tile.
        b.addBuff(e, { key: 'reg:selfBound', persist: true, flags: { noMove: true } });
        b.addBuff(e, { key: 'reg:untarget', persist: true, flags: { untargetable: true } });
        watchDeaths(b, e);
      },
      tick(b, e, a, dt) {
        // PRTS 后兽: "自缚；被阻挡时进行普通攻击，造成攻击力 100% 的近战途径物理伤害".
        // (profile.noAttack stays on so the engine never fires its own ranged/skill attack.)
        if (e.blockedBy) {
          a.atk = (a.atk ?? 0) - dt;
          if (a.atk <= 0) {
            a.atk = Math.max(0.5, e.s.interval);
            b.dealDamage(e, e.blockedBy, { amount: e.s.atk, type: 'phys', isAttack: true, tags: ['enemyAbility'] });
          }
        }
        a.level = (a.level ?? 0) + dt;
        if (!e.mem.regForm2 && a.level + 1e-9 >= levelIv) enterForm2(b, e);
        const touched = a.touched || (a.touched = {});
        for (const o of b.enemiesInRadius(e.x, e.y, radius)) {
          if (!o.alive || o === e || o.defId === BEAST || touched[o.id]) continue;
          touched[o.id] = true;
          o.counted = false;
          o.inTotal = false;
          o.lpr = 0;
          b.leak(o);
          if (life > 0) lpLoss(b, life, 'returnToDust', e);
          const allies = b.allies().slice();
          for (let i = 0; i < allies.length; i++) {
            // 全场: every ally, hidden ones included. The line does not say 无视隐匿 [ASSUMED].
            if (allies[i].alive) hurt(b, e, allies[i], e.s.atk * artsScale, 'arts', { ignoreSelect: true });
          }
          a.stacks = Math.min(maxStack, (a.stacks ?? 0) + 1);
          b.addBuff(e, { key: 'reg:dust', persist: true, refresh: 'replace', mods: { atkPct: atkStep * a.stacks } });
        }
      },
      otherDeath(c, b, e) {
        if (c.unit && c.unit.defId === BEAST) enterForm2(b, e);
      },
    },
    timed(blink, (b, e) => tailBlink(b, e, blink)),
    timed(punish, (b, e) => tailPunish(b, e, punish)),
    timed(doom, (b, e) => {
      // 【不争】 "扣除50目标生命值，强制撤退全场干员（不判定其阵营和可选性）；技能结束0.2秒后强制击杀自身，
      // 期间无法攻击/被阻挡；技能期间持有无敌" (PRTS 后兽 技能4).
      b.addBuff(e, { key: 'reg:doom', persist: true, flags: { invulnerable: true } });
      const loss = Math.abs(bb(doom, 'value', -50));
      if (loss > 0) lpLoss(b, loss, 'globalDoom', e);
      for (const u of b.allies().slice()) if (u.alive) b.retreat(u, { reason: 'globalDoom' });
      b.after(0.2, () => {
        if (!e.alive) return;
        e.counted = false;
        e.inTotal = false;
        b.kill(e, null);
      }, { owner: e });
    }),
    // 【返璞】 only in the second form (PRTS "第一形态 / 第二形态" tables).
    timed(branch, (b, e) => summonBranch(b, e, branch), { cond: (b, e) => !!e.mem.regForm2 }),
  ];
}

function tailBlink(b, e, sk) {
  const from = blinkForward(b, e, BLINK_DIST);
  if (!from) return;
  // PRTS 时移: overwrite the direction with this blink's movement (initial 上 = row -1); horizontal and vertical.
  let dx = e.x - from.x, dy = e.y - from.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    const prev = e.mem.regShift ?? { x: 0, y: -1 };
    dx = prev.x; dy = prev.y;
  } else {
    e.mem.regShift = { x: dx, y: dy };
  }
  const allyDur = bb(sk, 'enemy_dyjsww_blink_buff[ally].duration', 30);
  const enemyDur = bb(sk, 'enemy_dyjsww_blink_buff[enemy].duration', 30);
  const allyAspd = bb(sk, 'enemy_dyjsww_blink_buff[ally].attack_speed', -50);
  const enemyMove = bb(sk, 'enemy_dyjsww_blink_buff[enemy].move_speed', 2);
  for (const u of b.allies()) {
    const f = FACING[u.dir];
    if (f && f[0] * dx + f[1] * dy < 0) {
      b.addBuff(u, { key: 'enemy_dyjsww_blink_buff[ally]', duration: allyDur, mods: { aspd: allyAspd } });
    }
  }
  for (const o of b.aliveEnemies()) {
    if (o === e || o.defId === BEAST) continue;
    const R = o.route;
    const L = R && R.legs && R.legs[R.legIdx];
    if (!L) continue;
    const mx = L.c != null ? L.c - o.x : 0, my = L.r != null ? L.r - o.y : 0;
    if (mx * dx + my * dy > 0) {
      // PRTS 时移 "使场上所有其他移动方向与时移方向相同的敌方单位在30秒内移动速度+200%": ×3, not ×2.
      b.addBuff(o, { key: 'enemy_dyjsww_blink_buff[enemy]', duration: enemyDur, mods: { moveMul: 1 + enemyMove } });
    }
  }
}

function tailPunish(b, e, sk) {
  // 【并济】 "仅自身占据的3行中存在我方单位时可触发…选择距离自身最近的1名我方单位…对目标及目标半径1.5范围内的
  // 所有其他我方单位…造成攻击力100%的远程途径法术普通伤害" (PRTS 后兽 技能2). The 古雕伥 it would deploy is not
  // in the act3 data (ISW-DF unit), so only the damage is dealt.
  let best = null;
  let bd = Infinity;
  for (const u of b.allies()) {
    if (!u.alive || Math.abs(u.y - e.y) > 1.5) continue;
    const d = Math.abs(u.x - e.x);
    if (!best || d < bd || (d === bd && u.id < best.id)) { best = u; bd = d; }
  }
  if (!best) return;
  const scale = bb(sk, 'atk_scale', 1);
  const amount = e.s.atk * scale;
  const hit = areaAllies(b, e, best.x, best.y, PUNISH_RADIUS);
  const list = best.alive ? [best, ...hit.filter((u) => u !== best)] : hit;
  for (let i = 0; i < list.length; i++) hurt(b, e, list[i], amount, 'arts');
  // "…且若自身依旧处于第一形态，则在目标周围8格内的1个随机可通行地块上部署1个1级的古雕伥"
  if (!e.mem.regForm2) {
    const spot = trapSpot(b, best);
    if (spot) spawnTrap(b, e, spot);
  }
}

export const REGULATION_BOSS_KITS = Object.freeze({
  [MECH]: kitMech,
  [MECH_2]: kitMech,
  [GEAR]: kitGear,
  [ARMOR]: kitArmor,
  [SPIDER]: kitSpider,
  [SPIDER_2]: kitSpider,
  [WEB]: kitWeb,
  [EEL]: kitEel,
  [EEL_2]: kitEel,
  [BEAST]: kitBeast,
  [TAIL]: kitTail,
});
