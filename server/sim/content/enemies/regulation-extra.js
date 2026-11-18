// server/sim/content/enemies/regulation.js — hand-written kits for the act3 enemies that the generic handlers cannot cover
// (server/sim/content/enemies/procedural.js OFFICIAL list). Keys are enemy records of another official version; numbers
// come from the flattened talent book (ab.t). The archetype helpers (reborn / deathBoom / unbalanced / enemyAura /
// nthAttackPower) are the same ones the default enemies use.
import { hypot } from '../../detmath.js';
import { T, hurt } from './helpers.js';
import { deathBoom, unbalanced, reborn, enemyAura, allyAura, nthAttackPower, stealth, pollution } from './archetypes.js';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const buffOf = (u, key) => u?.findBuff?.(key) ?? null;

/** 锋盔骑士团学徒 / _3: reborn after 5 s and a periodic ATK debuff on the strongest ally. */
function kitLfkght(ab) {
  const dur = T(ab, 'reborn.duration') ?? 5;
  return [
    reborn({ dur, hpRatio: 1 }),
    {
      tick(b, e, a, dt) {
        a.acc = num(a.acc) + dt;
        if (a.acc < 10) return;
        a.acc = 0;
        const t = b.allies().filter((u) => u.alive).sort((x, y) => y.s.atk - x.s.atk)[0];
        if (t) b.addBuff(t, { key: 'ab:lfkght_weak', duration: 10, visible: true, source: e, mods: { atkPct: -0.5 } });
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

/** 寻路者狙击手 / 阵地破坏者 / 信使: ammo attack scale; the messenger disarms, the breaker splashes. */
function kitShotbuff(ab, e) {
  const scale = T(ab, 'shotbuff.attack@headshot_atk_scale') ?? 1;
  const disarm = T(ab, 'shotbuff.attack@headshot_disarmed_duration');
  const splash = T(ab, 'shotbuff.attack@headshot_trapdamage');
  const parts = [e.defId.includes('cansld') ? nthAttackPower(1, scale) : { dealt(c) { if (c.dmg?.isAttack && c.dmg) c.dmg.mul *= scale; } }];
  if (disarm > 0) parts.push({ dealt(c, b) { if (c.dmg?.isAttack && c.target) b.addBuff(c.target, { key: 'ab:disarm', duration: disarm, visible: true, source: e, flags: { noAttack: true, noHeal: true } }); } });
  if (splash > 0) parts.push({ dealt(c, b) { if (!c.dmg?.isAttack || !c.target) return; for (const u of b.allies()) if (u.alive && u !== c.target && hypot(u.x - c.target.x, u.y - c.target.y) <= 1.4) b.dealDamage(e, u, { amount: splash, type: 'arts', tags: ['enemyAbility'] }); } });
  return parts;
}

/** 萨卡兹子裔补给车: nearby enemies +10 % ATK (5 stacks) and their attacks add apoptosis damage. */
function kitDsuply(ab, _e) {
  const atk = T(ab, 'aura.enemy_dsuply_t[attr_buff].atk') ?? 0.1;
  const max = Math.max(1, Math.floor(T(ab, 'aura.enemy_dsuply_t[attr_buff].max_valid_stack_cnt') ?? 5));
  const ep = T(ab, 'aura.ep_damage_ratio') ?? 0.1;
  return [
    { tick(b, e2, a, dt) {
      a.acc = num(a.acc) + dt;
      if (a.acc < 1) return;
      a.acc = 0;
      for (const x of b.enemies) {
        if (!x.alive || x === e2 || hypot(x.x - e2.x, x.y - e2.y) > 4) continue;
        const n = (x.mem.dsuplyStacks ?? 0) + 1;
        if (n > max) continue;
        x.mem.dsuplyStacks = n;
        b.addBuff(x, { key: 'ab:dsuply', duration: 1.6, refresh: 'replace', visible: true, source: e2, mods: { atkPct: atk * n } });
      }
    } },
    { dealt(c, b) {
      if (!c.dmg?.isAttack || !c.target || !buffOf(c.source, 'ab:dsuply')) return;
      b.dealDamage(c.source, c.target, { amount: c.source.s.atk * ep, type: 'element', element: 'apoptosis', tags: ['enemyAbility'] });
    } },
  ];
}

/** 残党乐团圆号手 / 鼓手: two stances alternate every 3rd attack (激昂 / 消沉). */
function kitSwitchMode(ab, e) {
  const P = { n: 0, mode: 'enthu' };
  const apply = (b2, x) => {
    const pre = `switchMode.enemy_act29side[buff_${x === 'enthu' ? 'enthu' : 'depressed'}].`;
    b2.addBuff(e, {
      key: 'ab:switchmode', refresh: 'replace', visible: true,
      mods: {
        aspd: T(ab, pre + 'attack_speed') ?? 0,
        atkPct: T(ab, pre + 'atk') ?? 0,
        defPct: T(ab, pre + 'def') ?? 0,
        moveMul: 1 + (T(ab, pre + 'move_speed') ?? 0),
      },
    });
  };
  return [{
    spawn(b2) { apply(b2, P.mode); },
    attack(_c, b2) {
      P.n += 1;
      if (P.n % 3 !== 0) return;
      P.mode = P.mode === 'enthu' ? 'depressed' : 'enthu';
      apply(b2, P.mode);
    },
  }];
}

/** “投石机”: the first attack is ×first_atk_scale. */
function kitWingnt(ab) {
  return [nthAttackPower(1, T(ab, 'FirstAttack.attack@first_atk_scale') ?? 1.5)];
}

/** 无畏掷弹兵: the first unblocked damage hit fires four bombs, then it is lighter and faster. */
function kitBoomer(ab, e) {
  const P = { fired: false };
  const ms = T(ab, 'Light.move_speed') ?? 0.7, mass = T(ab, 'Light.mass_level') ?? -2;
  return [{
    spawn(b) {
      b.on('damaged', (c) => {
        if (c.target !== e || P.fired || e.blocking?.length) return;
        P.fired = true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          for (const u of b.allies()) {
            if (u.alive && hypot(u.x - (e.x + dx), u.y - (e.y + dy)) <= 1) b.dealDamage(e, u, { amount: e.s.atk, type: 'arts', tags: ['enemyAbility'] });
          }
        }
        b.addBuff(e, { key: 'ab:boomer_light', persist: true, visible: true, mods: { moveMul: 1 + ms, massFlat: mass } });
        b.fx('explode', { x: e.x, y: e.y, r: 1.5, kind: 'boomer' });
      }, { owner: e });
    },
  }];
}

/** 战线推进者: after being blocked, the first attack is ×sheltr_atk_scale. */
function kitChghmr(ab, _e) {
  const scale = T(ab, 'DmgUp.sheltr_atk_scale') ?? 2.5;
  const P = { blocked: false, charged: false };
  return [{
    tick(b, e2) {
      const blocked = e2.blocking?.length > 0;
      if (blocked && !P.blocked) P.charged = true;
      P.blocked = blocked;
    },
    dealt(c) {
      if (!c.dmg?.isAttack || !P.charged) return;
      P.charged = false;
      c.dmg.mul *= scale;
    },
  }];
}

/** 纤核漂游蟹: attacks add neural damage (the `0.` group). */
function kitDsflys(ab, e) {
  const ep = T(ab, '0.attack@ep_damage_ratio') ?? 0.15;
  return [{ dealt(c, b) { if (c.dmg?.isAttack && c.target) b.dealDamage(e, c.target, { amount: e.s.atk * ep, type: 'element', element: 'neural', tags: ['enemyAbility'] }); } }];
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

/** 假想敌：丛生: the first hit on each target is ×2 and blocks healing for 5 s. */
function kitAccrit(ab, e) {
  const scale = T(ab, 'CriticalHit.damage_scale') ?? 2, dur = T(ab, 'CriticalHit.duration') ?? 5;
  return [{ dealt(c, b) {
    if (!c.dmg?.isAttack || !c.target?.alive) return;
    const seen = e.mem.accrit ??= new Set();
    if (seen.has(c.target.id)) return;
    seen.add(c.target.id);
    c.dmg.mul *= scale;
    b.addBuff(c.target, { key: 'ab:accrit_noheal', duration: dur, visible: true, source: e, flags: { noHeal: true } });
  } }];
}

/** 暴走食人花 / _2: twice per fight it stuns the nearest ally and digests (both unable to act for 5 s). */
function kitTrwlpl(ab, _e) {
  const cnt = Math.max(0, Math.floor(T(ab, 'InitEat.cnt') ?? 2));
  const P = { left: cnt, acc: 0 };
  return [{ tick(b, e2, a, dt) {
    if (P.left <= 0) return;
    P.acc += dt;
    if (P.acc < 12) return;
    P.acc = 0;
    const t = b.allies().filter((u) => u.alive && hypot(u.x - e2.x, u.y - e2.y) <= 2).sort((x, y) => x.hp - y.hp)[0];
    if (!t) return;
    P.left--;
    b.applyStatus(t, 'stun', { duration: 5, source: e2 });
    b.applyStatus(e2, 'stun', { duration: 5, source: e2 });
    b.fx('explode', { x: t.x, y: t.y, r: 0.5, kind: 'eat' });
  } }];
}

/** 神勇的帕拉杜利斯 / _2: charges an ally in front for ×2 physical damage. */
function kitMnctur(ab, _e) {
  const scale = T(ab, 'CollideChar.atk_scale_collide') ?? 2;
  const P = { acc: 0 };
  return [{ tick(b, e2, a, dt) {
    P.acc += dt;
    if (P.acc < 5) return;
    P.acc = 0;
    const front = b.allies().filter((u) => u.alive && Math.abs(u.y - e2.y) < 1 && u.x > e2.x && u.x - e2.x <= 3).sort((x, y) => x.x - y.x)[0];
    if (!front) return;
    b.dealDamage(e2, front, { amount: e2.s.atk * scale, type: 'phys', isAttack: true, tags: ['enemyAbility'] });
    b.fx('charge', { x: front.x, y: front.y, id: e2.id });
  } }];
}

/** 搏命养家者: +0.5 move speed on warning; nearby enemies take 25 % less physical/arts damage. */
function kitUbba(ab, e) {
  const ms = T(ab, 'WarningTalent.move_speed') ?? 0.5, res = T(ab, 'Talent1.damage_resistance') ?? 0.25;
  return [
    { spawn(b) {
      b.on('damaged', (c) => { if (c.target === e && e.hpRatio < 0.5) b.addBuff(e, { key: 'ab:ubba_warn', persist: true, visible: true, mods: { moveMul: 1 + ms } }); }, { owner: e });
    } },
    enemyAura(2.5, 'ab:ubba_guard', { physTakenMul: 1 - res, artsTakenMul: 1 - res }, true, 0.5),
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
    spawn(b) {
      b.on('death', (c) => {
        const u = c.unit;
        if (!u || u === e || u.side !== 'enemy' || u.defId === key) return;
        if (hypot(u.x - e.x, u.y - e.y) > r + 1e-9) return;
        b.spawnEnemy(key, { pos: [u.tileR, u.tileC], countInTotal: false });
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
  const loss = T(ab, 'Passive.fixed_value_damage') ?? 120;
  return [{ tick(b, e, a, dt) {
    a.t = (a.t ?? 0) + dt;
    if (a.t + 1e-9 < iv) return;
    a.t = 0;
    a.n = (a.n ?? 0) + 1;
    b.loseHp(e, loss, { tags: ['enemyAbility'] });
    if (a.n * iv <= maxT) b.addBuff(e, { key: 'reg:nscola_speed', persist: true, refresh: 'replace', visible: true, mods: { moveMul: 1 + step * a.n } });
  } }];
}

/** 遮天面包机 (PRTS: 【飞行单位】未被阻挡时持续对周围我方单位造成溅射伤害). */
function kitNsbomb(ab) {
  const iv = Math.max(0.2, T(ab, 'Passive.interval') ?? 2.5);
  const r = T(ab, 'Passive.range_radius') ?? 1;
  const scale = T(ab, 'Passive.atk_scale') ?? 2;
  return [{ tick(b, e, a, dt) {
    if (e.blocking?.length) return;
    a.t = (a.t ?? 0) + dt;
    if (a.t + 1e-9 < iv) return;
    a.t = 0;
    for (const u of b.alliesInRadius(e.x, e.y, r)) {
      if (u.alive) b.dealDamage(e, u, { amount: e.s.atk * scale, type: 'phys', tags: ['enemyAbility'] });
    }
    b.fx('explode', { x: e.x, y: e.y, id: e.id, r, kind: 'nsbomb' });
  } }];
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
