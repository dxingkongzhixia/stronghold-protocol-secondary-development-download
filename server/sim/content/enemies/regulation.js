// server/sim/content/enemies/regulation.js — 规程·序列Ⅰ special enemies (CRITIC / REBORN and the new draws).
//
// Kept off KITS: test/content/enemies_bosses.test.js requires every KITS key in the default enemies.json.
// enemies.js onSpawn falls back to REGULATION_KITS. This module does not import enemies.js.
//
// Official numbers are read from the enemy record. Points with no blackboard are marked [ASSUMED].

import { hypot, sin, cos } from '../../detmath.js';
import {
  hurt, elem, areaAllies, auraAllies, remainingRoute, stayRoute, spawnChildren, nthOf, canCast, BOOM_RADIUS, auraBuff, watchDeaths,
  unbalancedNow, alliesInTiles,
} from './helpers.js';
import { skill, stealth, ep, refraction, reborn } from './archetypes.js';

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
      fire(b, e, a);
    },
  };
}

function timed(sk, fire, extra = {}) {
  if (!sk || !fire) return null;
  if (sk.sp > 0 && !(sk.cd > 0)) return spEvery(sk, fire, !!extra.sil);
  if (sk.cd > 0) return skill(sk, fire, extra);
  return null;
}

function replaceLater(b, e, key, delay, n = 1) {
  if (!key || !(n > 0)) return;
  const pos = [e.y, e.x];
  const route = remainingRoute(e);
  const spawn = () => spawnChildren(b, e, key, n, { countInTotal: false, pos, route });
  if (!(delay > 0)) { spawn(); return; }
  // Keep an otherwise empty field alive until its replacement arrives; ordinary visual timers must not do so.
  b.after(delay, spawn, { holdsBattle: true });
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

// --- CRITIC ----------------------------------------------------------------------------------------------

/**
 * 战线推进者 — PRTS 天赋: "入场后/每次解除阻挡时获得强击标记（不可叠加）"; 强击: attack +80 %, the marker is cleared
 * before a successful attack. (The 250 % `DmgUp.sheltr_atk_scale` is against 封阻物/掩体 only; this mode has none.)
 */
function kitChghmr(ab) {
  const atk = bb(ab.sk.PowerHit, 'atk', 0.8);
  return [{
    spawn(b, e, a) { a.mark = true; },
    tick(b, e, a) { if (!e.blockedBy) a.mark = true; },
    hitOut(c, b, e, a) {
      if (!a.mark || !c.dmg || !c.dmg.isAttack) return;
      a.mark = false;
      c.dmg.amount *= 1 + atk; // 攻击力提升至 atk, before DEF (PRTS 战线推进者)
    },
  }];
}

/** 管乐家: +atk per second while unblocked; the next attack spends the stacks and stuns.
 *  switchMode (沉郁 / 热情) has no field-wide variation signal — left unused. */
function kitLtnclr(ab) {
  const flat = tv(ab, 'atkboostCore.atk', 30);
  const cap = tv(ab, 'atkboostCore.max_stack_count', 30);
  const stun = tv(ab, 'atkboostCore.attack@stun_duration', 10);
  return [{
    tick(b, e, a, dt) {
      // PRTS: 每 0.5 秒检测一次 — 未被阻挡则 +1 层（每层攻击力最终 +30，最多 30 层），普通攻击结束后清空.
      if (e.blockedBy) return;
      a.acc = (a.acc ?? 0) + dt;
      if (a.acc + 1e-9 < 0.5) return;
      let up = false;
      while (a.acc + 1e-9 >= 0.5) {
        a.acc -= 0.5;
        a.stacks = Math.min(cap, (a.stacks ?? 0) + 1);
        up = true;
      }
      if (up) b.addBuff(e, { key: 'reg:boost', persist: true, refresh: 'replace', mods: { atkFlat: flat * a.stacks } });
    },
    dealt(c, b, e, a) {
      if (!(a.stacks > 0)) return;
      if (stun > 0 && c.target && c.target.alive) b.applyStatus(c.target, 'stun', { duration: stun, source: e });
      a.stacks = 0;
      b.removeBuff(e, 'reg:boost');
    },
  }];
}

/**
 * “投石机” — PRTS: "首次攻击对目标及其周围 4 格造成攻击力 150% 的法术伤害，此后仅进行近战攻击，造成物理伤害."
 */
function kitWingnt(ab) {
  const scale = tv(ab, 'FirstAttack.attack@first_atk_scale', 1.5);
  return [{
    hitOut(c, b, e, a) {
      if (a.used || !c.dmg || !c.dmg.isAttack) return;
      a.used = true;
      c.dmg.type = 'arts';
      c.dmg.mul *= scale;
      e.profile.melee = true;
      e.profile.dmgType = 'phys';
    },
    dealt(c, b, e, a) {
      if (a.splash || !a.used || !c.dmg || !c.dmg.isAttack || !c.target) return;
      a.splash = true;
      for (const u of alliesInTiles(b, c.target.tileR, c.target.tileC, 'plus', 1)) {
        if (u === c.target || !u.alive) continue;
        b.dealDamage(e, u, { amount: e.s.atk * scale, type: 'arts', tags: ['enemyAbility'] });
      }
      b.fx('explode', { x: c.target.x, y: c.target.y, r: 1.1, kind: 'wingnt' });
    },
  }];
}

/** 冰原卫法者: silenced death boom (cold and freeze); unbalanced self HP loss is not silenced. */
function kitKrgrg(ab) {
  const scale = tv(ab, 'boom.atk_scale', 1);
  const cold = tv(ab, 'boom.cold', 0);
  const freeze = tv(ab, 'boom.freeze', 0);
  const bleed = tv(ab, 'unbalanced_bleed.damage', 0);
  const iv = tv(ab, 'unbalanced_bleed.interval', 0.066);
  return [
    {
      sil: true,
      death(c, b, e) {
        if (c.reason !== 'killed') return;
        for (const u of areaAllies(b, e, e.x, e.y, BOOM_RADIUS)) {
          if (scale > 0) hurt(b, e, u, e.s.atk * scale, 'arts');
          if (!u.alive) continue;
          if (cold > 0) b.applyStatus(u, 'cold', { duration: cold, source: e });
          if (freeze > 0 && u.alive) b.applyStatus(u, 'freeze', { duration: freeze, source: e });
        }
      },
    },
    {
      tick(b, e, a, dt) {
        if (!(bleed > 0) || !(iv > 0) || !unbalancedNow(b, e)) return;
        a.acc = (a.acc ?? 0) + dt;
        for (let n = 0; n < 4 && a.acc + 1e-9 >= iv && e.alive; n++) {
          a.acc -= iv;
          b.loseHp(e, bleed, { tags: ['enemyAbility'] });
        }
      },
    },
  ];
}

/**
 * 寻路者信使 — PRTS: ammo 1; while it holds ammo the shot is ×1.5 ARTS (the record's own type) and applies
 * 【无法攻击或治疗】 = 缴械 + 沉默 for 15 s, preferring an ally that does not carry it; then melee only. `headshot_sp`
 * is the ammo counter, not an SP drain. (`headshot_trapdamage` — the extra damage to a 冰淇淋机 — has no device in
 * this mode; the data value 5000 differs from PRTS 7500, so it is kept in the data only.)
 */
function kitMtrbty(ab) {
  const scale = tv(ab, 'shotbuff.attack@headshot_atk_scale', 1.5);
  const disarm = tv(ab, 'shotbuff.attack@headshot_disarmed_duration', 15);
  return [{
    spawn(b, e) { e.profile.sortTargets = (u) => (u.s.flags.disarm ? 1 : 0); },
    hitOut(c, b, e, a) {
      if (a.spent || !c.dmg || !c.dmg.isAttack) return;
      a.spent = true;
      c.dmg.mul *= scale;
      e.profile.melee = true;
    },
    attack(c, b, e, a) {
      if (a.paid) return;
      a.paid = true;
      for (const u of c.targets || []) {
        if (!u || !u.alive) continue;
        if (disarm > 0) {
          b.applyStatus(u, 'disarm', { duration: disarm, source: e });
          b.applyStatus(u, 'silence', { duration: disarm, source: e });
        }
      }
    },
  }];
}

/** 马特奥的近卫: two phys shots down a shared row or column. Unblocked damage resistance. */
function kitBdguad(ab) {
  const sk = ab.sk.CrossBomb;
  const dr = tv(ab, 'DmgResist.damage_resistance', 0.4);
  return [
    sk && skill(sk, (b, e) => {
      const range = bb(sk, 'projectile_range', 1.1);
      const times = Math.max(1, Math.min(4, bb(sk, 'times', 2)));
      const scale = bb(sk, 'atk_scale', 0.5);
      let best = null;
      let bd = Infinity;
      for (const u of b.allies()) {
        if (!u.alive) continue;
        const line = Math.abs(u.y - e.y) < 0.5 || Math.abs(u.x - e.x) < 0.5;
        if (!line) continue;
        const d = hypot(u.x - e.x, u.y - e.y);
        if (d > range + 1e-9) continue;
        if (!best || d < bd || (d === bd && u.id < best.id)) { best = u; bd = d; }
      }
      if (!best) return;
      const shot = () => { if (best.alive) hurt(b, e, best, e.s.atk * scale, 'phys'); };
      shot();
      for (let i = 1; i < times; i++) b.after(0.3 * i, shot);
    }, {
      sil: true,
      cond: (b, e) => {
        const range = bb(sk, 'projectile_range', 1.1);
        for (const u of b.allies()) {
          if (!u.alive) continue;
          const line = Math.abs(u.y - e.y) < 0.5 || Math.abs(u.x - e.x) < 0.5;
          if (line && hypot(u.x - e.x, u.y - e.y) <= range + 1e-9) return true;
        }
        return false;
      },
    }),
    {
      hitIn(c, b, e) {
        if (e.blockedBy) return;
        const ty = c.dmg && c.dmg.type;
        if (ty !== 'phys' && ty !== 'arts') return;
        c.dmg.mul *= Math.max(0, 1 - dr);
      },
    },
  ];
}

/**
 * 魂灵法骸: the cooldown stands in for one 魂灵涡流 charge (no stage-prop pickup). [ASSUMED] The orb itself follows PRTS
 * 巫术旋流: 0.9 orbit, 50°/s counter-clockwise, collision radius 0.45, 100 % ATK arts.
 */
function kitLrmzrd(ab) {
  const sk = ab.sk.summonFireball;
  const scale = bb(sk, 'atk_scale', 1);
  const maxN = bb(sk, 'max_projectile_count', 3);
  const ORBIT = 0.9, ANG = (50 * Math.PI) / 180, HIT = 0.45;
  return [
    {
      tick(b, e, a, dt) {
        const list = e.mem.regFrags;
        if (!list || !list.length) return;
        const next = [];
        for (let i = 0; i < list.length; i++) {
          const f = list[i];
          f.ang += ANG * dt;
          const x = e.x + cos(f.ang) * ORBIT;
          const y = e.y + sin(f.ang) * ORBIT;
          let spent = false;
          for (const u of areaAllies(b, e, x, y, HIT)) {
            hurt(b, e, u, e.s.atk * f.scale, 'arts');
            spent = true;
            break;
          }
          if (!spent) next.push(f);
        }
        e.mem.regFrags = next;
      },
    },
    timed(sk, (b, e) => {
      const list = e.mem.regFrags || (e.mem.regFrags = []);
      if (list.length >= maxN) return;
      list.push({ ang: list.length * 2.094, scale });
    }),
  ];
}

/** 假想敌：丛生: the first damage to each target is doubled, then that target cannot be healed. */
function kitAccrit(ab) {
  const scale = tv(ab, 'CriticalHit.damage_scale', 2);
  const dur = tv(ab, 'CriticalHit.duration', 5);
  return [{
    spawn(b, e, a) { a.seen = {}; },
    hitOut(c, b, e, a) {
      const t = c.target;
      if (!t || !c.dmg || a.seen[t.id]) return;
      a.seen[t.id] = true;
      c.dmg.mul *= scale;
      if (dur > 0) b.addBuff(t, { key: 'reg:crit', duration: dur, flags: { healFree: true, noHeal: true } });
    },
  }];
}

// --- REBORN (death replacement — not the reborn() archetype, except 1104_3) ----------------------------

/** Child soldiers / mechanics: their unsilenceable deathrattle uses the pinned key and delay. */
function kitDeathrattle(ab) {
  const key = sv(ab.tS, 'deathrattle.enemy_key');
  const delay = tv(ab, 'deathrattle.delay', 1);
  return [{ death(c, b, e) { if (c.reason === 'killed') replaceLater(b, e, key, delay); } }];
}

/**
 * 萨卡兹子裔轰击者: PRTS "攻击发射高爆弹，抵达目标位置后延迟 4 s 引爆，对半径 1.1 范围内的我方单位造成物理伤害";
 * the immediate attack is replaced by that delayed blast. Attack's child key/delay is the death replacement.
 */
function kitDthrowDeath(ab) {
  const key = sv(ab.tS, 'Attack.enemy_key');
  const delay = tv(ab, 'Attack.delay', 1);
  const fuse = tv(ab, 'Attack.attack@projectile_delay_time', 4);
  const r = tv(ab, 'Attack.attack@projectile_radius', 1.1);
  return [
    {
      hitOut(c, b, e) {
        if (!c.dmg || !c.dmg.isAttack || !c.target) return;
        const x = c.target.x, y = c.target.y;
        c.dmg.cancel = true;
        b.fx('telegraph', { x, y, r, dur: fuse, kind: 'dthrow' });
        b.after(fuse, (bb) => {
          for (const u of bb.alliesInRadius(x, y, r)) {
            if (u.alive) bb.dealDamage(e, u, { amount: e.s.atk, type: 'phys', tags: ['enemyAbility'] });
          }
          bb.fx('explode', { x, y, r, kind: 'dthrow' });
        }, { owner: e });
      },
    },
    { death(c, b, e) { if (c.reason === 'killed') replaceLater(b, e, key, delay); } },
  ];
}

/**
 * 萨卡兹骸骨卫士长: PRTS "受到我方默认类单位造成的伤害后令伤害来源在 5 s 内攻击速度-40（重复时不叠加，不重置持续
 * 时间）"; on death it leaves `Summon.cnt` blood ambers (the bomb-binding line has no 反巫术变位炸弹 in this mode).
 */
function kitSpnshdDeath(ab) {
  const key = sv(ab.tS, 'Summon.enemy_key');
  const count = tv(ab, 'Summon.cnt', 0);
  const aspd = tv(ab, 'Summon.attack_speed', -40);
  const dur = tv(ab, 'Summon.duration', 5);
  return [
    {
      taken(c, b, e) {
        const s = c.source;
        if (!s || s.side !== 'ally' || s.kind !== 'op' || !(dur > 0)) return;
        b.addBuff(s, { key: 'reg:spnshd_slow', duration: dur, refresh: 'keep', mods: { aspd } });
      },
    },
    {
      death(c, b, e) {
        if (c.reason !== 'killed' || !key || !(count > 0)) return;
        spawnChildren(b, e, key, count, { route: stayRoute(e), countInTotal: false, mods: null });
      },
    },
  ];
}

/** 重生造物 (PRTS 大君之触 / 大君之赐 and their variants); 集恨者 counts every one on the field. */
const REBORN_CREATURES = new Set(['enemy_1220_dzoms', 'enemy_1220_dzoms_2', 'enemy_1221_dzomg', 'enemy_1221_dzomg_2']);

function auraOf(b, e, ab) {
  const step = tv(ab, 'aura.atk', 0);
  const cap = tv(ab, 'aura.max_valid_stack_cnt', 6);
  if (!(step > 0)) return;
  let n = 0;
  for (const o of b.aliveEnemies()) if (REBORN_CREATURES.has(o.defId)) n++;
  n = Math.min(cap, n);
  if (n > 0) b.addBuff(e, { key: 'reg:lord', duration: 0.35, refresh: 'replace', mods: { atkPct: step * n } });
  else b.removeBuff(e, 'reg:lord');
}

function kitDklord(ab) {
  const key = sv(ab.tS, 'deathrattle.enemy_key');
  const delay = tv(ab, 'deathrattle.delay', 1);
  return [{
    tick(b, e) { auraOf(b, e, ab); },
    death(c, b, e) { if (c.reason === 'killed') replaceLater(b, e, key, delay, 1); },
  }];
}

/**
 * 责罚者: spCost 3 reads as the 4th attack (nthOf). PRTS 责罚: "对半径 1.0 范围内的我方单位造成 4 s 晕眩与攻击力
 * 100% 的物理伤害"; Attack.enemy_key replaces it on death (PRTS: no delay).
 */
function kitDfat(ab) {
  const sk = ab.sk.StunAttack;
  const n = nthOf(sk);
  const dur = bb(sk, 'stun', 4);
  const key = sv(ab.tS, 'Attack.enemy_key');
  return [
    {
      sil: true,
      attack(c, b, e, a) {
        a.n = (a.n ?? 0) + 1;
        if (a.n % n) return;
        for (const u of areaAllies(b, e, e.x, e.y, 1.0)) {
          if (!u.alive) continue;
          if (dur > 0) b.applyStatus(u, 'stun', { duration: dur, source: e });
          hurt(b, e, u, e.s.atk, 'phys');
        }
      },
    },
    { death(c, b, e) { if (c.reason === 'killed') replaceLater(b, e, key, 0, 1); } },
  ];
}

function kitDkmage(ab) {
  const ratio = tv(ab, 'epdamage.attack@ep_damage_ratio', 0);
  const jumps = Math.max(0, tv(ab, 'epdamage.attack@max_target', 4) - 1);
  const scale = tv(ab, 'epdamage.attack@chain.atk_scale', 0.85);
  const range = tv(ab, 'epdamage.attack@projectile_range', 1.6);
  const key = sv(ab.tS, 'deathrattle.enemy_key');
  const delay = tv(ab, 'deathrattle.delay', 1);
  return [
    ratio > 0 ? ep('apoptosis', ratio) : null,
    {
      dealt(c, b, e) {
        if (!(jumps > 0) || !c.target) return;
        let from = c.target;
        const seen = new Set([from.id]);
        let mul = scale;
        for (let i = 0; i < jumps && i < 8; i++) {
          const nxt = nearestAlly(b, e, from, range, seen);
          if (!nxt) break;
          seen.add(nxt.id);
          hurt(b, e, nxt, e.s.atk * mul, 'arts');
          if (ratio > 0) elem(b, e, nxt, 'apoptosis', e.s.atk * ratio * mul);
          mul *= scale;
          from = nxt;
        }
      },
    },
    { death(c, b, e) { if (c.reason === 'killed') replaceLater(b, e, key, delay, 1); } },
  ];
}

/** 饲育者: weighted death spawn. move_speed 2 is a move multiplier [ASSUMED]. */
function kitDsfull(ab) {
  const p1 = tv(ab, '0.prob1', 0.2);
  const p2 = tv(ab, '0.prob2', 0.5);
  const mul = tv(ab, '0.move_speed', 2);
  const cnt = tv(ab, '0.cnt', 1);
  return [{
    death(c, b, e) {
      if (c.reason !== 'killed') return;
      const r = b.rng();
      let key = sv(ab.tS, '0.enemy_3');
      if (r < p1) key = sv(ab.tS, '0.enemy_1');
      else if (r < p1 + p2) key = sv(ab.tS, '0.enemy_2');
      if (!key) return;
      const pos = [e.y, e.x];
      const route = remainingRoute(e);
      const kids = spawnChildren(b, e, key, cnt, { countInTotal: false, pos, route });
      for (let i = 0; i < kids.length; i++) {
        b.addBuff(kids[i], { key: 'reg:fast', persist: true, mods: { moveMul: mul } });
      }
    },
  }];
}

/**
 * “左手”泰特斯: reborn() plus 削弱斗志 — PRTS: only when an ally not already affected exists; ATK highest, then taunt,
 * then id; ATK → 50 % for 25 s.
 */
function kitLfkght(ab) {
  const sk = ab.sk.AtkDesWeaken;
  return [
    reborn({ dur: tv(ab, 'reborn.duration', 5) }),
    timed(sk, (b) => {
      let best = null;
      for (const u of b.allies()) {
        if (!u.alive || u.findBuff('reg:weaken')) continue;
        if (!best || u.s.atk > best.s.atk
          || (u.s.atk === best.s.atk && (u.s.taunt || 0) > (best.s.taunt || 0))
          || (u.s.atk === best.s.atk && (u.s.taunt || 0) === (best.s.taunt || 0) && u.id < best.id)) best = u;
      }
      if (!best) return;
      b.addBuff(best, { key: 'reg:weaken', duration: bb(sk, 'duration', 25), mods: { atkPct: bb(sk, 'atk', -0.5) } });
    }, { sil: true }),
  ];
}

function kitHarchn(ab) {
  const key = sv(ab.tS, 'deathrattle.enemy_key');
  const cnt = tv(ab, 'deathrattle.cnt', 4);
  const delay = tv(ab, 'deathrattle.delay', 0.2);
  const sk = ab.sk.SummonToken;
  return [
    {
      sil: true,
      death(c, b, e) { if (c.reason === 'killed') replaceLater(b, e, key, delay, cnt); },
    },
    timed(sk, (b, e) => {
      const k = sv(sk.bs, 'enemy_key') || key;
      const n = bb(sk, 'cnt', 1);
      const pos = [e.y, e.x];
      const route = remainingRoute(e);
      spawnChildren(b, e, k, n, { countInTotal: false, pos, route });
    }, { sil: true }),
  ];
}

/** 寄生者: a nearby enemy's knock-down summons 大君之赐. Not its own death.
 *  被击倒 is reason 'killed' (a leak is not a knock-down). The summoned gift's own
 *  knock-down does not count: each parasite in range would replace one dead gift
 *  with another, and two of them grow without bound [ASSUMED]. */
function kitAcpara(ab) {
  const key = sv(ab.tS, 'Aura.enemy_key');
  const radius = tv(ab, 'Aura.range_radius', 1.5);
  return [{
    sil: true,
    spawn(b, e) { watchDeaths(b, e); },
    otherDeath(c, b, e) {
      const v = c.unit;
      if (c.reason !== 'killed' || !v || v === e || v.side !== 'enemy' || !key) return;
      if (v.defId === key) return;
      if (hypot(v.x - e.x, v.y - e.y) > radius + 1e-9) return;
      spawnChildren(b, e, key, 1, { countInTotal: false, pos: [v.y, v.x], route: remainingRoute(v) });
    },
  }];
}

// --- the other new draws --------------------------------------------------------------------------------

/** 假想敌：影役: stealth, and block count −1 on allies in range (one shared buff, so it does not stack). */
function kitAcblk(ab) {
  const radius = tv(ab, 'Aura.range_radius', 1.8);
  const block = tv(ab, 'Aura.block_cnt', -1);
  return [
    stealth(),
    {
      tick(b, e) {
        for (const u of auraAllies(b, e, e.x, e.y, radius)) {
          if (u.kind !== 'op') continue;
          auraBuff(b, u, 'reg:blockdown', 0.25, { blockCnt: block }, null, true);
        }
      },
    },
  ];
}

/** 假想敌：镜眼: refraction; while it HOLDS (PRTS "拥有折射时"), arts damage cuts the source's ASPD by 50 for 3 s. */
function kitAcrefm(ab) {
  const res = tv(ab, 'refracting.magic_resistance', 70);
  const aspd = tv(ab, 'refracting.attack_speed', -50);
  const dur = tv(ab, 'refracting.duration', 3);
  return [
    refraction(res),
    {
      sil: true,
      taken(c, b, e) {
        if (!c.dmg || c.dmg.type !== 'arts' || !c.source || !c.source.alive) return;
        if (!(dur > 0) || !e.findBuff('ab:refraction')) return;
        b.addBuff(c.source, { key: 'reg:refslow', duration: dur, refresh: 'replace', mods: { aspd } });
      },
    },
  ];
}

/**
 * 假想敌：镜波: refraction; on death while it holds, one enemy within 1.2 gains +10 RES for ever (PRTS "优先选择法术抗性
 * 更低＞距离自身最近的单位"; same name stacks without limit).
 */
function kitAcrefd(ab) {
  const res = tv(ab, 'refracting.magic_resistance', 70);
  const radius = tv(ab, 'refracting.range_radius', 1.2);
  const bonus = tv(ab, 'refracting.acrefd[magic-resistance].magic_resistance', 10);
  return [
    refraction(res),
    {
      sil: true,
      death(c, b, e) {
        if (c.reason !== 'killed' || !(bonus > 0) || !e.findBuff('ab:refraction')) return;
        let best = null, bd = Infinity;
        for (const o of b.enemiesInRadius(e.x, e.y, radius)) {
          if (!o.alive || o === e) continue;
          const d = hypot(o.x - e.x, o.y - e.y);
          if (!best || o.s.res < best.s.res || (o.s.res === best.s.res && (d < bd || (d === bd && o.id < best.id)))) { best = o; bd = d; }
        }
        if (best) {
          const n = (best.mem.acrefd = (best.mem.acrefd ?? 0) + 1);
          b.addBuff(best, { key: `reg:res${n}`, persist: true, mods: { resFlat: bonus } });
        }
      },
    },
  ];
}

/** “模拟宝藏”: a hostage when the enemy record itself is spawned. It does not attack (applyWay NONE)
 *  and does not move. The command deploys an ally device instead (content/bands/commands.js): enemy
 *  contact and the survival coin live there, so this kit is not the payoff. */
function kitAchest() {
  return [{
    spawn(b, e) {
      e.profile.noAttack = true;
      b.addBuff(e, { key: 'reg:hostage', persist: true, flags: { noMove: true } });
    },
  }];
}

const same = (kit) => kit;

export const REGULATION_KITS = Object.freeze({
  enemy_1406_chghmr: kitChghmr,
  enemy_1375_ltnclr: kitLtnclr,
  enemy_1375_ltnclr_2: same(kitLtnclr),
  enemy_1388_wingnt: kitWingnt,
  enemy_1388_wingnt_2: same(kitWingnt),
  enemy_1191_krgrg: kitKrgrg,
  enemy_1191_krgrg_2: same(kitKrgrg),
  enemy_1219_mtrbty: kitMtrbty,
  enemy_1409_bdguad_2: kitBdguad,
  enemy_1431_lrmzrd: kitLrmzrd,
  enemy_1431_lrmzrd_2: same(kitLrmzrd),
  enemy_9040_accrit: kitAccrit,
  enemy_1222_dpvt: kitDeathrattle,
  enemy_1222_dpvt_2: same(kitDeathrattle),
  enemy_1223_dmech: kitDeathrattle,
  enemy_1223_dmech_2: same(kitDeathrattle),
  enemy_1361_dthrow: kitDthrowDeath,
  enemy_1361_dthrow_2: same(kitDthrowDeath),
  enemy_1363_spnshd_2: kitSpnshdDeath,
  enemy_1226_dklord: kitDklord,
  enemy_1226_dklord_2: same(kitDklord),
  enemy_1362_dfat: kitDfat,
  enemy_1362_dfat_2: same(kitDfat),
  enemy_1225_dkmage: kitDkmage,
  enemy_1225_dkmage_2: same(kitDkmage),
  enemy_1437_dsfull: kitDsfull,
  enemy_1437_dsfull_2: same(kitDsfull),
  enemy_1104_lfkght_3: kitLfkght,
  enemy_1133_harchn: kitHarchn,
  enemy_1133_harchn_2: same(kitHarchn),
  enemy_9030_acpara: kitAcpara,
  enemy_9034_acblk: kitAcblk,
  enemy_9039_acrefm: kitAcrefm,
  enemy_9031_acrefd: kitAcrefd,
  enemy_9038_achest: kitAchest,
});
