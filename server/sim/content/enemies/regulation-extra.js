// server/sim/content/enemies/regulation.js — hand-written kits for the act3 enemies that the generic handlers cannot cover
// (server/sim/content/enemies/procedural.js OFFICIAL list). Keys are enemy records of another official version; numbers
// come from the flattened talent book (ab.t). The archetype helpers (reborn / deathBoom / unbalanced / enemyAura /
// nthAttackPower) are the same ones the default enemies use.
import { hypot } from '../../detmath.js';
import { T, hurt, auraBuff, remainingRoute, alliesInTiles } from './helpers.js';
import { deathBoom, unbalanced, reborn, enemyAura, allyAura, nthAttackPower, stealth, pollution, noAirTargets } from './archetypes.js';
import { reviveNow } from '../items/battle.js';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const buffOf = (u, key) => u?.findBuff?.(key) ?? null;

/**
 * 锋盔骑士团学徒 / _3: reborn after 5 s and 【削弱斗志】 — PRTS: cooldown 25 / initial 25 (学徒) or 10 / 10 (泰特斯),
 * only when an ally not already carrying 【锋盔削弱】 exists; the highest ATK (taunt, then id as tie-breaks) takes
 * ATK → 50 % for 25 s (same name does not stack).
 */
function kitLfkght(ab) {
  const dur = T(ab, 'reborn.duration') ?? 5;
  const sk = ab.sk && ab.sk.AtkDesWeaken;
  const cd = Math.max(0.5, num(sk && sk.cd, 25));
  const first = sk && sk.icd > 0 ? sk.icd : cd;
  const buffDur = num(sk && sk.bb && sk.bb.duration, 25);
  const atk = num(sk && sk.bb && sk.bb.atk, -0.5);
  const ready = (u) => u.findBuff && u.findBuff('ab:lfkght_weak');
  return [
    reborn({ dur, hpRatio: 1 }),
    {
      spawn(b, e, a) { a.left = first; },
      tick(b, e, a, dt) {
        a.left = Math.max(0, num(a.left, first) - dt);
        if (a.left > 1e-9) return;
        let t = null;
        for (const u of b.allies()) {
          if (!u.alive || u.hidden || ready(u)) continue;
          if (!t || u.s.atk > t.s.atk || (u.s.atk === t.s.atk && (u.s.taunt || 0) > (t.s.taunt || 0))
            || (u.s.atk === t.s.atk && (u.s.taunt || 0) === (t.s.taunt || 0) && u.id < t.id)) t = u;
        }
        if (!t) return;
        a.left = cd;
        b.addBuff(t, { key: 'ab:lfkght_weak', duration: buffDur, visible: true, source: e, mods: { atkPct: atk } });
      },
    },
  ];
}

/** 冰原卫法 / _2: death explosion (arts + cold) and HP loss while unbalanced (pushed/pulled). */
function kitKrgrg(ab, _e) {
  const freeze = T(ab, 'boom.freeze') ?? T(ab, 'boom.cold') ?? 5;
  const dmg = T(ab, 'unbalanced_bleed.damage') ?? 80, iv = Math.max(0.05, T(ab, 'unbalanced_bleed.interval') ?? 0.066);
  return [
    deathBoom({ scale: T(ab, 'boom.atk_scale') ?? 1.3, type: 'arts', status: { key: 'cold', dur: freeze } }),
    unbalanced((b, e2, a, tiles) => {
      const ticks = Math.max(1, Math.floor(tiles / 0.1));
      b.loseHp(e2, dmg * ticks * iv, { source: null, tags: ['unbalanced'] });
    }),
  ];
}

/**
 * 寻路者狙击手 / 阵地破坏者 / 信使 — PRTS ammo mode:
 *   · 狙击手: 1 round, the shot is ×2 ATK; then melee only.
 *   · 阵地破坏者: 2 rounds, each shot is 100 % ATK physical to the target AND all allies in the 8 tiles around it
 *     (splash may hit air, ignores camouflage); then melee only.
 *   · 信使: 1 round, the shot is ×1.5 ATK, consumes ammo and applies 【无法攻击或治疗】 = 缴械 + 沉默 for 15 s
 *     (it prefers targets that do not carry it); then melee only. `headshot_sp` is the ammo counter, not an SP drain.
 * None of them attacks air (PRTS "不会攻击飞行单位").
 */
function kitShotbuff(ab, e) {
  const scale = T(ab, 'shotbuff.attack@headshot_atk_scale') ?? 1;
  const disarm = T(ab, 'shotbuff.attack@headshot_disarmed_duration') ?? 0;
  const breaker = e.defId.includes('cansld');
  const ammo = breaker ? 2 : 1;
  const parts = [noAirTargets()];
  if (disarm > 0) {
    // 优先攻击未持有【无法攻击或治疗】的我方单位 (PRTS 信使).
    parts.push({ spawn(b, e2) { e2.profile.sortTargets = (u) => (u.s.flags.disarm ? 1 : 0); } });
  }
  parts.push({
    spawn(b, e2, a) { a.left = ammo; },
    hitOut(c, b, e2, a) {
      if (!(a.left > 0) || !c.dmg || !c.dmg.isAttack) return;
      c.dmg.mul *= scale;
    },
    attack(c, b, e2, a) {
      if (!(a.left > 0)) return;
      a.left--;
      const ts = (c.targets || []).filter((t) => t && t.alive && (!c.targetDeployments || c.targetDeployments.get(t) === t.deploySeq));
      for (const t of ts) {
        if (disarm > 0) {
          b.applyStatus(t, 'disarm', { duration: disarm, source: e2 });
          b.applyStatus(t, 'silence', { duration: disarm, source: e2 });
        }
        if (breaker) {
          for (const u of alliesInTiles(b, t.tileR, t.tileC, 'box', 1)) {
            if (u === t || !u.alive) continue;
            b.dealDamage(e2, u, { amount: e2.s.atk, type: 'phys', ignoreSelect: true, tags: ['enemyAbility'] });
          }
        }
      }
      if (!(a.left > 0)) { e2.profile.melee = true; e2.profile.maxTargets = 1; }
    },
  });
  return parts;
}

/** 重生造物 (the 大君 summons; PRTS 萨卡兹子裔补给车 / 集恨者 count these). */
const REBORN_CREATURES = new Set(['enemy_1220_dzoms', 'enemy_1220_dzoms_2', 'enemy_1221_dzomg', 'enemy_1221_dzomg_2']);

/**
 * 萨卡兹子裔补给车 — PRTS: "在场时，场上所有重生造物攻击力提升 10%（最多叠加 5 层），且攻击时附加各自攻击力
 * 10% 的凋亡损伤（可被沉默）".  The stacks are one per supply truck on the field (not per second); there is no radius.
 * It does not attack air.
 */
function kitDsuply(ab, e) {
  const atk = T(ab, 'aura.enemy_dsuply_t[attr_buff].atk') ?? 0.1;
  const max = Math.max(1, Math.floor(T(ab, 'aura.enemy_dsuply_t[attr_buff].max_valid_stack_cnt') ?? 5));
  const ep = T(ab, 'aura.ep_damage_ratio') ?? 0.1;
  const TRUCK = new Set(['enemy_1224_dsuply', 'enemy_1224_dsuply_2']);
  return [
    noAirTargets(),
    {
      tick(b, e2) {
        let n = 0;
        for (const o of b.aliveEnemies()) if (TRUCK.has(o.defId)) n++;
        n = Math.min(max, n);
        for (const o of b.aliveEnemies()) if (REBORN_CREATURES.has(o.defId)) auraBuff(b, o, 'ab:dsuply', 0.6, { atkPct: atk * n }, null, true);
      },
    },
    {
      // The apoptosis line only: an attack of a 重生造物 carrying the aura adds 10 % of its ATK (silence turns it off).
      dealt(c, b) {
        if (!c.dmg?.isAttack || !c.target || c.source.s.flags.silence) return;
        if (!REBORN_CREATURES.has(c.source.defId) || !buffOf(c.source, 'ab:dsuply')) return;
        b.dealDamage(c.source, c.target, { amount: c.source.s.atk * ep, type: 'element', element: 'apoptosis', tags: ['enemyAbility'] });
      },
    },
  ];
}

/**
 * 残党乐团圆号手 / 鼓手 — PRTS 崔林特尔梅之金.  Stances (the fork alternates them every 3rd attack [ASSUMED]; the
 * client data only carries the two sets of numbers):
 *   沉郁: ATK +20 %, ASPD −50, move speed FINAL 50 %;  激昂: ASPD +50, move speed FINAL 200 %, DEF −50 %.
 *   · 圆号手: 每次普通攻击回复 1 SP (0/2); the next attack (the 3rd) also hits ONE other ally within 1.5 of the
 *     target for 100 % ATK — physical, or arts while 激昂; its normal attack is arts while 激昂.
 *   · 鼓手: 0/2 attack recovery; the 3rd attack splashes every ally within 2.0 (3.0 while 激昂) for 100 % ATK arts.
 */
function kitSwitchMode(ab, e) {
  const P = { n: 0, mode: 'enthu' };
  const horn = e.defId.includes('ltnhor');
  const pre = (x) => `switchMode.enemy_act29side[buff_${x === 'enthu' ? 'enthu' : 'depressed'}].`;
  const apply = (b2, x) => {
    const p = pre(x);
    b2.addBuff(e, {
      key: 'ab:switchmode', refresh: 'replace', visible: true,
      mods: {
        aspd: T(ab, p + 'attack_speed') ?? 0,
        atkPct: T(ab, p + 'atk') ?? 0,
        defPct: T(ab, p + 'def') ?? 0,
        // PRTS says "移动速度最终降低至 50%" / "最终提升至 200%": the blackboard value is the final multiplier.
        moveMul: T(ab, p + 'move_speed') ?? 1,
      },
    });
    if (horn) e.profile.dmgType = x === 'enthu' ? 'arts' : 'phys';
  };
  return [{
    spawn(b2) { apply(b2, P.mode); },
    attack(c, b2) {
      P.n += 1;
      if (P.n % 3 !== 0) return;
      const ent = P.mode === 'enthu';
      const type = horn ? (ent ? 'arts' : 'phys') : 'arts';
      const ts = (c.targets || []).filter((t) => t && t.alive);
      if (horn) {
        for (const t of ts) {
          // "对目标及目标半径1.5范围内的1名其他我方单位造成攻击力100%的…伤害"
          let pick = null;
          for (const u of b2.allies()) {
            if (!u.alive || u === t || u.hidden || hypot(u.x - t.x, u.y - t.y) > 1.5) continue;
            if (!pick || u.id < pick.id) pick = u;
          }
          if (pick) b2.dealDamage(e, pick, { amount: e.s.atk, type, isAttack: true, tags: ['enemyAbility'] });
        }
      } else {
        const r = ent ? 3 : 2;
        for (const u of b2.allies()) {
          if (!u.alive || u.hidden || hypot(u.x - e.x, u.y - e.y) > r) continue;
          b2.dealDamage(e, u, { amount: e.s.atk, type: 'arts', tags: ['enemyAbility'] });
        }
      }
      P.mode = P.mode === 'enthu' ? 'depressed' : 'enthu';
      apply(b2, P.mode);
    },
  }];
}

/**
 * “投石机” — PRTS: "首次攻击对目标及其周围4格造成攻击力150%的法术伤害，此后仅进行近战攻击，造成物理伤害."
 * (The first shot is ARTS for the target and its four orthogonal neighbours; the enemy then fights in melee, physical.)
 */
function kitWingnt(ab, e) {
  const scale = T(ab, 'FirstAttack.attack@first_atk_scale') ?? 1.5;
  return [{
    hitOut(c, b, e2, a) {
      if (a.used || !c.dmg || !c.dmg.isAttack) return;
      a.used = true;
      c.dmg.type = 'arts';
      c.dmg.mul *= scale;
      e2.profile.melee = true;
      e2.profile.dmgType = 'phys';
    },
    dealt(c, b, e2, a) {
      if (a.splash || !a.used || !c.dmg || !c.dmg.isAttack || !c.target) return;
      a.splash = true;
      for (const u of alliesInTiles(b, c.target.tileR, c.target.tileC, 'plus', 1)) {
        if (u === c.target || !u.alive) continue;
        b.dealDamage(e2, u, { amount: e2.s.atk * scale, type: 'arts', tags: ['enemyAbility'] });
      }
      b.fx('explode', { x: c.target.x, y: c.target.y, r: 1.1, kind: 'wingnt' });
    },
  }];
}

/**
 * 无畏掷弹兵 — PRTS 投弹: once, while not silenced and not blocked, taking damage fires a bomb in each of the four
 * directions; each bomb is a direct projectile that explodes on the first ally it meets (radius 1.1) for 200 % ATK
 * PHYSICAL damage. Afterwards: move speed +0.7, weight −2.
 */
function kitBoomer(ab, e) {
  const P = { fired: false };
  const ms = T(ab, 'Light.move_speed') ?? 0.7, mass = T(ab, 'Light.mass_level') ?? -2;
  const scale = T(ab, 'Bomb.atk_scale') ?? 2;
  return [{
    spawn(b) {
      b.on('damaged', (c) => {
        if (c.target !== e || P.fired || e.blockedBy || e.s.flags.silence) return;
        P.fired = true;
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          // The first ally in this direction (small corridor) is where the bomb goes off; otherwise it flies on.
          let impact = null, bd = Infinity;
          for (const u of b.allies()) {
            if (!u.alive || u.hidden) continue;
            const rx = u.x - e.x, ry = u.y - e.y;
            const along = rx * dx + ry * dy;
            if (along <= 0) continue;
            if (Math.abs(rx * dy - ry * dx) > 0.5) continue;
            if (along < bd) { bd = along; impact = u; }
          }
          const ix = impact ? impact.x : e.x + dx * 2, iy = impact ? impact.y : e.y + dy * 2;
          for (const u of b.allies()) {
            if (u.alive && hypot(u.x - ix, u.y - iy) <= 1.1) {
              b.dealDamage(e, u, { amount: e.s.atk * scale, type: 'phys', ignoreSelect: true, tags: ['enemyAbility'] });
            }
          }
          b.fx('explode', { x: ix, y: iy, r: 1.1, kind: 'boomer' });
        }
        b.addBuff(e, { key: 'ab:boomer_light', persist: true, visible: true, mods: { moveMul: 1 + ms, massFlat: mass } });
      }, { owner: e });
    },
  }];
}

/**
 * 战线推进者 — PRTS 天赋: "入场后/每次解除阻挡时获得强击标记（不可叠加）"; 强击: "技能期间攻击力+80%，对目标造成攻击力
 * 100% 的物理伤害，技能成功进行攻击前清除强击标记" — so the next attack after spawn / after being unblocked is ×1.8
 * (the 250 % `DmgUp.sheltr_atk_scale` is only against 封阻物/掩体, which this mode has no unit for).
 */
function kitChghmr(ab, _e) {
  const atk = (ab.sk && ab.sk.PowerHit && ab.sk.PowerHit.bb && ab.sk.PowerHit.bb.atk) ?? 0.8;
  const P = { mark: true };
  return [{
    tick(b, e2) { if (!e2.blockedBy) P.mark = true; },
    hitOut(c) {
      if (!P.mark || !c.dmg?.isAttack) return;
      P.mark = false;
      c.dmg.mul *= 1 + atk;
    },
  }];
}

/**
 * 纤核漂游者 — PRTS: 失衡免疫, "普通攻击优先攻击部署于高台上的我方单位", 每次攻击附加 15 % ATK 神经损伤.
 * The high-ground preference is the opt-in `profile.sortTargets` hook (server/sim/targeting.js sortAllyTargets).
 */
function kitDsflys(ab, e) {
  const ep = T(ab, '0.attack@ep_damage_ratio') ?? 0.15;
  return [
    {
      spawn(b, e2) {
        b.addBuff(e2, { key: 'ab:dsflys_anchor', persist: true, flags: { noDisplace: true } });
        e2.profile.sortTargets = (u) => (u.tileR != null && !b.grid.isLow(u.tileR, u.tileC) ? 0 : 1);
      },
    },
    { dealt(c, b) { if (c.dmg?.isAttack && c.target) b.dealDamage(e, c.target, { amount: e.s.atk * ep, type: 'element', element: 'neural', tags: ['enemyAbility'] }); } },
  ];
}

/** “不眠雪山”: two stances, 3 blocks, frozen targets take ×FrozenBreak.atk_scale. */
function kitAcsgnt(ab, e) {
  const P = { sit: false, acc: 0 };
  const atk0 = T(ab, 'BondBuff.base_atk') ?? 0.5, per = T(ab, 'BondBuff.attack_per_stack') ?? 0.01;
  const step = Math.max(1, Math.floor(T(ab, 'BondBuff.stackStep') ?? 3));
  const frozenScale = T(ab, 'FrozenBreak.atk_scale') ?? 3.5;
  const interval = T(ab, 'SwitchMode.interval') ?? 5;
  return [{
    spawn(b) {
      b.addBuff(e, { key: 'ab:acsgnt_bond', persist: true, visible: true, mods: { atkPct: atk0, hpPct: per * step } });
      b.addBuff(e, { key: 'ab:acsgnt_sit', persist: true, visible: true, flags: { noMove: true }, mods: { blockCnt: T(ab, 'BlockEnemy.block_cnt') ?? 3 } });
    },
    tick(b, e2, a, dt) {
      P.acc += dt;
      if (P.acc < interval) return;
      P.acc = 0;
      P.sit = !P.sit;
      if (P.sit) b.addBuff(e2, { key: 'ab:acsgnt_sit', persist: true, visible: true, flags: { noMove: true }, mods: { blockCnt: T(ab, 'BlockEnemy.block_cnt') ?? 3 } });
      else b.removeBuff(e2, 'ab:acsgnt_sit');
    },
    dealt(c, b) {
      if (!c.dmg?.isAttack || !c.target) return;
      if (c.target.s?.flags?.freeze) {
        c.dmg.mul *= frozenScale;
        b.removeBuff(c.target, 'freeze');
      }
    },
  }];
}

/** 量变之械: the first attack is ×2 (FirstAtkDouble.damage_scale). */
function kitAcfncb(ab) {
  return [nthAttackPower(1, T(ab, 'FirstAtkDouble.damage_scale') ?? 2)];
}

/** 假想敌：影役: hidden; 周围 1.8 内所有干员阻挡数 -1（光环，不可叠加）. */
function kitAcblk(ab) {
  return [stealth(), allyAura(T(ab, 'Aura.range_radius') ?? 1.8, 'ab:acblk', { blockCnt: -1 }, true, 0.5)];
}

/**
 * 假想敌：丛生 — PRTS: "输出伤害时，若目标不持有来源于自己的【丛生标记】，本次伤害提升至 200%，并额外施加 5 秒禁疗
 * 效果和持续时间无限的【丛生标记】".  Any damage (not only a normal attack), hence `hitOut`.
 */
function kitAccrit(ab, e) {
  const scale = T(ab, 'CriticalHit.damage_scale') ?? 2, dur = T(ab, 'CriticalHit.duration') ?? 5;
  return [{
    hitOut(c, b, e2) {
      const t = c.target;
      if (!t?.alive || !c.dmg || c.dmg.cancel) return;
      const seen = e2.mem.accrit ??= new Set();
      if (seen.has(t.id)) return;
      seen.add(t.id);
      c.dmg.mul *= scale;
      b.addBuff(t, { key: 'ab:accrit_noheal', duration: dur, visible: true, source: e2, flags: { noHeal: true } });
    },
  }];
}

/**
 * 暴走食人花 / _2 — PRTS: 普通攻击索敌不受阻挡影响, 可吞食半径 1.0 内一个我方单位 (不造成伤害而是强制击倒); 命中后进入
 * 消化模式 for 20 s (自缚 + 失衡/晕眩/冻结/浮空/恐惧/沉睡免疫); 被击倒于消化期间时吐出被吞的干员 (不进入再部署).
 * The client's `InitEat.cnt` (2) limits the number of swallows; the initial 登场消化 (40 s) has no data marker here.
 */
function kitTrwlpl(ab, _e) {
  const cnt = Math.max(0, Math.floor(T(ab, 'InitEat.cnt') ?? 2));
  const EAT_SECONDS = 20;
  return [{
    spawn(b, e2, a) { a.left = cnt; a.eat = null; a.digest = 0; a.acc = 6; },
    tick(b, e2, a, dt) {
      if (a.digest > 0) {
        a.digest -= dt;
        if (a.digest <= 0) { a.digest = 0; a.eat = null; }
        return;
      }
      if (!(a.left > 0)) return;
      a.acc += dt;
      if (a.acc < 10) return;
      a.acc = 0;
      const t = b.allies()
        .filter((u) => u.alive && u.kind === 'op' && !u.hidden && !u.s.flags.swallowImmune && hypot(u.x - e2.x, u.y - e2.y) <= 1.0)
        .sort((x, y) => x.id - y.id)[0];
      if (!t) return;
      a.left--;
      a.eat = t;
      a.digest = EAT_SECONDS;
      b.addBuff(e2, { key: 'ab:trwlpl_eat', duration: EAT_SECONDS, visible: true, flags: { noMove: true, selfBound: true } });
      b.fx('explode', { x: t.x, y: t.y, r: 0.5, kind: 'eat' });
      b.kill(t, e2);
    },
    death(c, b, e2, a) {
      if (c.reason !== 'killed' || !a.eat || a.eat.alive) return;
      // Spat out: back on the field at once, no redeploy time.
      if (reviveNow(b, { unit: a.eat, reason: 'killed' }, 'trwlpl')) b.fx('revive', { x: e2.x, y: e2.y, id: e2.id, form: 'eat' });
      a.eat = null;
      a.digest = 0;
    },
  }];
}

/**
 * 神勇的帕拉杜利斯 / _2 — PRTS 冲锋: 仅未被阻挡、且移动方向同一行/列的前方存在非飞行我方单位时可触发; 冲锋模式无法
 * 攻击/被阻挡, 对进入半径 0.45 的我方单位造成 200 % ATK 物理伤害 (一次). 入戏状态的撞墙分支 is not implemented here
 * (no act3 source applies 入戏 [ASSUMED]).  A dash is modelled as one hit on the nearest ally ahead.
 */
function kitMnctur(ab, _e) {
  const scale = T(ab, 'CollideChar.atk_scale_collide') ?? 2;
  const sk = ab.sk && ab.sk.rush;
  const cd = Math.max(0.5, num(sk && sk.cd, 10));
  const first = sk && sk.icd > 0 ? sk.icd : cd;
  return [{
    spawn(b, e2, a) { a.left = first; },
    tick(b, e2, a, dt) {
      a.left = Math.max(0, num(a.left, first) - dt);
      if (a.left > 1e-9 || e2.blockedBy) return;
      // The current leg's direction (the way it is walking).
      const R = e2.route;
      const L = R && R.legs && R.legs[R.legIdx];
      let dx = 0, dy = 0;
      if (L && L.c != null) { dx = Math.sign(L.c - e2.x); dy = Math.sign(L.r - e2.y); }
      if (!dx && !dy) return;
      let front = null, bd = Infinity;
      for (const u of b.allies()) {
        if (!u.alive || u.isFlying || u.hidden) continue;
        const rx = u.x - e2.x, ry = u.y - e2.y;
        const along = rx * dx + ry * dy;
        const perp = Math.abs(rx * dy - ry * dx);
        if (along <= 0 || along > 4 || perp > 0.6) continue;
        if (along < bd) { bd = along; front = u; }
      }
      if (!front) return;
      a.left = cd;
      // 入戏(敌方): the charge passes allies, runs into the terrain, then 1000 % ATK true damage on itself + 15 s stun;
      // 20 s before it may charge again. No act3 table grants 入戏, so this branch is dormant (future content).
      if (e2.s.flags.inPlay) {
        let x = e2.x, y = e2.y;
        for (let i = 0; i < 80; i++) {
          const nx = x + dx * 0.25, ny = y + dy * 0.25;
          if (!b.grid.groundPassable(Math.round(ny), Math.round(nx))) break;
          x = nx; y = ny;
        }
        e2.x = x; e2.y = y;
        b.dealDamage(null, e2, { amount: e2.s.atk * 10, type: 'true', sourceless: true, tags: ['enemyAbility'] });
        b.applyStatus(e2, 'stun', { duration: 15, source: e2 });
        a.left = cd + 20;
        b.fx('charge', { x, y, id: e2.id });
        return;
      }
      b.dealDamage(e2, front, { amount: e2.s.atk * scale, type: 'phys', isAttack: true, tags: ['enemyAbility'] });
      b.fx('charge', { x: front.x, y: front.y, id: e2.id });
    },
  }];
}

/** 搏命养家者: +0.5 move speed on warning; nearby enemies take 25 % less physical/arts damage. */
function kitUbba(ab, e) {
  const ms = T(ab, 'WarningTalent.move_speed') ?? 0.5, res = T(ab, 'Talent1.damage_resistance') ?? 0.25;
  return [
    { spawn(b) {
      b.on('damaged', (c) => { if (c.target === e && e.hpRatio < 0.5) b.addBuff(e, { key: 'ab:ubba_warn', persist: true, visible: true, mods: { moveMul: 1 + ms } }); }, { owner: e });
    } },
    // PRTS: 半径 1.7 范围内的所有敌方单位受到的物理/法术伤害降低至 75%（可乘算叠加）.
    enemyAura(1.7, 'ab:ubba_guard', { physTakenMul: 1 - res, artsTakenMul: 1 - res }, true, 0.5),
  ];
}

/**
 * 萨卡兹子裔寄生者: an enemy killed within `Aura.range_radius` leaves a 大君之赐 at its tile (PRTS: "周围一定范围内的敌人被
 * 击倒时，召唤一个<大君之赐>"; a 大君之赐 killed does not trigger this again). The record's `summons` alone would make the
 * generic Summon handler spawn it on the parasite's own death, which is not the rule.
 */
function kitApara(ab, e) {
  const r = T(ab, 'Aura.range_radius') ?? 1.5;
  const key = (ab.tS && ab.tS['Aura.enemy_key']) || 'enemy_1221_dzomg';
  return [{
    sil: true,
    spawn(b) {
      // PRTS: 半径 1.5 内的敌方单位被【击倒】时（一个漏怪不是击倒），在其位置上沿其路径召唤一个大君之赐; 被沉默时失效.
      b.on('death', (c) => {
        const u = c.unit;
        if (c.reason !== 'killed' || e.s.flags.silence || !u || u === e || u.side !== 'enemy' || u.defId === key) return;
        if (hypot(u.x - e.x, u.y - e.y) > r + 1e-9) return;
        b.spawnEnemy(key, { pos: [u.tileR, u.tileC], route: remainingRoute(u), countInTotal: false });
      }, { owner: e });
    },
  }];
}

/**
 * A periodic summon whose skill names it: 枯朽萃聚使徒's BornBugs (its `summons`) and 内测版自助出餐终端's Spawn
 * (`bbStr.enemy_key`). First summon at the skill's initial cooldown, then its cooldown — not the generic Summon handler's
 * spawn on the carrier's own death.
 */
function kitPeriodicSummon(ab, e) {
  const skills = Object.values(ab.sk || {}).filter(Boolean);
  const sk = skills.find((s) => s.bs && s.bs.enemy_key) || skills[0] || null;
  const key = (sk && sk.bs && sk.bs.enemy_key) || (Array.isArray(e.def?.raw?.summons) ? e.def.raw.summons[0] : null);
  const cd = Math.max(0.5, num(sk && sk.cd, 10));
  const first = sk && sk.icd > 0 ? sk.icd : cd;
  if (!key) return [];
  return [{
    spawn(b, _e, a) { a.left = first; },
    tick(b, e2, a, dt) {
      if (!e2.alive) return;
      a.left = Math.max(0, num(a.left, first) - dt);
      if (a.left > 1e-9) return;
      a.left = cd;
      b.spawnEnemy(key, { pos: [e2.tileR, e2.tileC], countInTotal: false });
    },
  }];
}

/**
 * 开天汽水瓶 (PRTS: 【飞行单位】逐渐流失生命并加速) — `Passive.enemy_nscola[speed]` (interval 0.5 s, +0.3 move speed,
 * max 25 s) and a fixed HP loss per interval.
 */
function kitNscola(ab) {
  const iv = Math.max(0.1, T(ab, 'Passive.enemy_nscola[speed].interval') ?? 0.5);
  const step = T(ab, 'Passive.enemy_nscola[speed].move_speed') ?? 0.3;
  const maxT = Math.max(1, T(ab, 'Passive.enemy_nscola[speed].max_time') ?? 25);
  const perSec = T(ab, 'Passive.fixed_value_damage') ?? 120;
  const DPS_IV = 0.1;
  return [{ tick(b, e, a, dt) {
    // PRTS: 每 0.1 s 受到 12 无来源真实伤害 (120/s).
    a.dmg = (a.dmg ?? 0) + dt;
    while (a.dmg + 1e-9 >= DPS_IV && e.alive) {
      a.dmg -= DPS_IV;
      b.loseHp(e, perSec * DPS_IV, { tags: ['enemyAbility'] });
    }
    // PRTS: 每 0.5 s — 未受晕眩/束缚且未被阻挡则 +1 层（最高 25），否则层数归零; 移动速度 +(30%×层数).
    a.spd = (a.spd ?? 0) + dt;
    if (a.spd + 1e-9 < iv) return;
    a.spd = 0;
    const bound = e.s.flags.stun || e.s.flags.bind || e.findBuff('bind') || e.blockedBy;
    if (bound) { a.n = 0; b.removeBuff(e, 'reg:nscola_speed'); return; }
    a.n = Math.min(25, (a.n ?? 0) + 1);
    if (a.n * iv <= maxT) b.addBuff(e, { key: 'reg:nscola_speed', persist: true, refresh: 'replace', visible: true, mods: { moveMul: 1 + step * a.n } });
  } }];
}

/**
 * 遮天面包机 — PRTS: 静态刚体; 每 2.5 s 若未被阻挡，发射面包弹道，0.5 s 后到达，对半径 1.0 的我方单位造成 200 % ATK
 * 物理溅射伤害（不可对空，无视迷彩）.
 */
function kitNsbomb(ab) {
  const iv = Math.max(0.2, T(ab, 'Passive.interval') ?? 2.5);
  const r = T(ab, 'Passive.range_radius') ?? 1;
  const scale = T(ab, 'Passive.atk_scale') ?? 2;
  return [{
    spawn(b, e) { b.addBuff(e, { key: 'ab:nsbomb_static', persist: true, flags: { noDisplace: true } }); },
    tick(b, e, a, dt) {
      if (e.blockedBy) return;
      a.t = (a.t ?? 0) + dt;
      if (a.t + 1e-9 < iv) return;
      a.t = 0;
      const x = e.x, y = e.y;
      b.fx('telegraph', { x, y, r, dur: 0.5, kind: 'nsbomb' });
      b.after(0.5, (bb) => {
        for (const u of bb.alliesInRadius(x, y, r)) {
          if (!u.alive || u.isFlying) continue;
          bb.dealDamage(e, u, { amount: e.s.atk * scale, type: 'phys', ignoreSelect: true, tags: ['enemyAbility'] });
        }
        bb.fx('explode', { x, y, id: e.id, r, kind: 'nsbomb' });
      }, { owner: e });
    },
  }];
}

/**
 * 狂暴凶豕兽 (`enemy_1309_mhboar_2`; PRTS "落叶逐火" 精英):
 *   占用 2 阻挡数 (`blockWeight` 2 — a blocker with blockCnt 1 can never take it);
 *   冲撞: 每 0.1 s 检测 — 晕眩/冻结/浮空/束缚 → 停止；否则未被阻挡且未冲撞 → 开始冲撞；
 *   碰撞光环半径 0.5，只选低地我方单位，每次冲撞每个单位只受一次 当前移速×800 途径物理伤害；
 *   加速: 开始 3 s 后每 0.333 s +33.3% 移速，最多 35 层，停止时解除；
 *   第一次普通攻击追加 当前移速×600 途径物理伤害，造成后停止冲撞。
 * The generic procedure would read `FirstAttack.atk_scale` 600 as a ×600 damage multiplier — hence this kit.
 */
function kitMhboar(ab) {
  const R = 0.5;
  const CRASH = T(ab, 'Crash.atk_scale') ?? 800;
  const FIRST = T(ab, 'FirstAttack.atk_scale') ?? 600;
  const STEP = T(ab, 'Rush.mhboar_t[trigger].interval') ?? 0.333;
  const PER = T(ab, 'Rush.mhboar_t[trigger].move_speed') ?? 0.333;
  const MAX = T(ab, 'Rush.mhboar_t[trigger].trig_cnt') ?? 35;
  const DELAY = T(ab, 'Rush.mhboar_t_predelay.predelay') ?? 3;
  const KEY = 'reg:mhboar_rush';
  const stop = (b, e) => {
    const r = e.mem.mhboar;
    if (!r?.rush) return;
    r.rush = false;
    r.t = 0;
    r.next = DELAY;
    r.stacks = 0;
    r.hit = null;
    b.removeBuff(e, KEY);
  };
  return [{
    spawn(b, e) {
      e.blockWeight = 2;
      e.mem.mhboar = { rush: false, t: 0, next: DELAY, stacks: 0, hit: null };
      b.on('attack', (c) => {
        if (c.attacker !== e || !e.mem.mhboar?.rush) return;
        const amount = e.s.moveSpeed * FIRST;
        for (const t of c.targets || []) if (t?.alive) hurt(b, e, t, amount, 'phys', { tags: ['crash'] });
        stop(b, e);
      }, { owner: e });
    },
    tick(b, e, a, dt) {
      const r = e.mem.mhboar;
      if (!r) return;
      a.check = (a.check ?? 0) + dt;
      if (a.check + 1e-9 < 0.1) return;
      a.check = 0;
      // PRTS: 受晕眩/冻结/浮空/束缚 → 停止冲撞 (the acceleration resets with it)
      if (e.s.flags.stun || e.s.flags.bind || e.findBuff('bind')) { stop(b, e); return; }
      if (!r.rush) {
        if (e.blockedBy) return;
        r.rush = true;
        r.t = 0;
        r.next = DELAY;
        r.stacks = 0;
        r.hit = new Set();
        return;
      }
      r.t += 0.1;
      for (const u of b.allies()) {
        if (!u.alive || !u.ground || r.hit.has(u.id)) continue;
        if (hypot(u.x - e.x, u.y - e.y) > R) continue;
        r.hit.add(u.id);
        hurt(b, e, u, e.s.moveSpeed * CRASH, 'phys', { tags: ['crash'] });
      }
      while (r.rush && r.t + 1e-9 >= r.next && r.stacks < MAX) {
        r.stacks++;
        r.next += STEP;
        b.addBuff(e, { key: KEY, persist: true, visible: true, refresh: 'replace', mods: { moveMul: 1 + PER * r.stacks } });
      }
    },
  }];
}

/** The active originium storm of chapter 14 (a device/unit of another season; act3 carries none). */
function findStorm(b, e) {
  for (const u of b.units) {
    if (!u || u === e || !u.alive) continue;
    if (u.mem?.storm) return u;
    const id = String(u.defId || u.alias || '');
    if (/storm/i.test(id) || String(u.def?.raw?.name ?? '').includes('活性源石风暴')) return u;
  }
  return null;
}

/**
 * 恶尘源石虫 (`enemy_1424_lrboom`; PRTS 14章):
 *   死亡爆炸: 半径 1.3, 延迟 1 s, 攻击力 350% 物理溅射, 来源无效 (sourceless);
 *   与活性源石风暴距离 ≤ 其影响半径 + 0.3 → 立刻死亡，并使风暴 +1 层增幅 (可沉默);
 *   其他情况死亡时生成源石污染区 (可沉默). The zone's damage comes from the chapter's hidden controller (50/100/200
 *   true/s at level 1/2/3) — act3 has no such controller, so the zone is a marker here (0 damage) [ASSUMED].
 */
function kitLrboom(ab) {
  const R = 1.3;
  const SCALE = T(ab, 'Boom.atk_scale') ?? 3.5;
  const STORM = T(ab, 'DetectStorm.range_radius') ?? 0.3;
  return [{
    tick(b, e) {
      const storm = findStorm(b, e);
      if (!storm) return;
      const rad = Math.max(0, storm.mem.stormRadius ?? 0.8);
      if (hypot(storm.x - e.x, storm.y - e.y) > rad + STORM) return;
      e.mem.stormKill = true;
      if (!e.s.flags.silence) storm.mem.stormAmp = (storm.mem.stormAmp ?? 0) + 1;
      b.kill(e, null);
    },
    death(c, b, e) {
      if (c.reason !== 'killed') return;
      const x = e.x, y = e.y, atk = e.s.atk;
      b.fx('telegraph', { x, y, r: R, dur: 1, kind: 'lrboom' });
      b.after(1, (bb) => {
        for (const u of bb.allies()) {
          if (!u.alive || hypot(u.x - x, u.y - y) > R) continue;
          bb.dealDamage(e, u, { amount: atk * SCALE, type: 'phys', sourceless: true, canDodge: false, tags: ['enemyAbility', 'lrboom'] });
        }
        bb.fx('explode', { x, y, r: R, kind: 'lrboom' });
      }, { owner: e });
      if (!e.s.flags.silence && !e.mem.stormKill) pollution(b, e, x, y, R, 30, 0, 0);
    },
  }];
}

export const REGULATION_EXTRA_KITS = Object.freeze({
  enemy_10146_nscola: kitNscola, // 开天汽水瓶
  enemy_10147_nsbomb: kitNsbomb, // 遮天面包机
  enemy_1309_mhboar_2: kitMhboar, // 狂暴凶豕兽
  enemy_1424_lrboom: kitLrboom, // 恶尘源石虫
  enemy_1104_lfkght: kitLfkght,
  enemy_1213_mtrsnp: kitShotbuff, enemy_1216_cansld: kitShotbuff,
  enemy_1224_dsuply: kitDsuply, enemy_1224_dsuply_2: kitDsuply,
  enemy_1373_ltnhor: kitSwitchMode, enemy_1373_ltnhor_2: kitSwitchMode,
  enemy_1376_ltndru: kitSwitchMode, enemy_1376_ltndru_2: kitSwitchMode,
  enemy_1405_boomer_2: kitBoomer,
  enemy_1435_dsflys: kitDsflys,
  enemy_9024_acsgnt: kitAcsgnt,
  enemy_9040_accrit: kitAccrit,
  enemy_9028_acfncb: kitAcfncb,
  enemy_10003_trwlpl_2: kitTrwlpl,
  enemy_10077_mpbarr: kitPeriodicSummon,
  enemy_10163_mnctur_2: kitMnctur,
  enemy_10196_ubba: kitUbba, enemy_10196_ubba_2: kitUbba,
});
