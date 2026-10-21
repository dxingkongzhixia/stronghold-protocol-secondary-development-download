// server/sim/content/enemies/leaders.js — bounty (悬赏) leader kits — the single-form ones (kitLeaderMisc) and the
// multi-form ones (reborn second forms, 转译基底·α, 乌顶巨角卢鲁) — and their part of KITS (split from content/enemies.js).

import { TICK, COLS } from '../../constants.js';
import { aggroCmp, areaSelectable } from '../../targeting.js';
import { periodicDamage } from '../../damage.js';
import {
  nthOf, T, hurt, alliesInTiles, targetsNear, allTargets, areaAllies, areaAlliesInTiles, auraAllies, targetAndArea,
  byPriority, setForm, auraBuff, watchDeaths, unbalancedNow, spawnChildren,
} from './helpers.js';
import {
  unblockable, maxTargets, onHitStatus, splashAttack, pathKeysAhead, noAirTargets, resist, nthAttackStatus, lowHpBuff,
  freeAllPrisoners, reborn, frontGuard, faceCrowd, unbalanced, artsBarrier, skill, blinkForward,
} from './archetypes.js';
import { hypot, powi } from '../../detmath.js';
import { bbCap } from '../../../../shared/plugins/officialBounds.js';

// ---------------------------------------------------------------------------------------------------------------
// constants (numbers that exist nowhere in the data)

/** 转译基底·α: "变化过程持续2s" (PRTS 天赋; the model's A_Die_B / _C / _D change clips last 2 s); the original form's
 *  immunities ("免疫晕眩/沉睡/寒冷/冻结/浮空/恐惧", plus 失衡免疫). */
export const TRANSLATOR_CHANGE = 2;

const TRANSLATOR_IMMUNE = Object.freeze(['stun', 'sleep', 'cold', 'freeze', 'levitate', 'fear']);

/** 碎骨's grenade (PRTS 碎骨 天赋 "未被阻挡时发射榴弹对目标及其周围八格的我方单位造成相当于攻击力26%的物理伤害，并令其在5秒内
 *  防御力下降50%"; the blackboard has only defdown.def −0.5): share of ATK on every unit hit, DEF-down duration (s).
 *  Until 0.1.3: the full attack on the target, 100 % on the 4 neighbours, 3 s [ASSUMED]. */
const SKULSR_GRENADE_SCALE = 0.26, SKULSR_DEFDOWN_DUR = 5;

/** “庞贝”'s self-blast while blocked (PRTS 天赋 "对<固定半径>半径1.4范围内的所有我方单位造成1000预计算的无途径法术溅射伤害（不可
 *  对空）"; the blackboard has only the damage and the 10 s; until 0.1.3: radius 1 [ASSUMED]). */
const POMPEII_BLAST_RADIUS = 1.4;

/** “巨大的丑东西” first form: its unblocked ranged attack (PRTS 天赋 "未被阻挡时，可对半径2.5范围内的1名非飞行的我方单位进行远程攻击，
 *  对目标及其周围8格内的所有我方单位造成攻击力100%的物理伤害" — the data's attack radius is 0, so it had no ranged attack until
 *  0.1.3) and its self-destruct ("首次被击倒后进行持续10s的重生…：重生开始的2.17s后进行自爆，对半径3.0范围内所有我方单位造成攻击力
 *  150%的物理伤害和16s晕眩"; until 0.1.3: radius 2.5 at once [ASSUMED]). */
const MCM_RANGE = 2.5, MCM_BOMB_DELAY = 2.17;

/** “复仇者” 【冲锋】 (PRTS 技能 "仅自身未被阻挡且存在符合条件的可选目标时可触发：选择3.0半径内位于自身下个检查点前的后续路径上(包含
 *  自身当前所在地块)的距离自身最近的我方单位…"): the search radius. The blackboard's range_radius is 1.5; PRTS's figure is the
 *  one used. Until 0.1.3: any unit within 1.5, 隐匿 / 迷彩 ones included. */
const RUSH_RADIUS = 3;

/** W's C4 fuse and blast radius [ASSUMED]. */
const C4_FUSE = 1, C4_RADIUS = 1;

/** 鼠王 【唱沙】 cross reach and 【沙狱】 "及其周围" radius [ASSUMED]. */
const DRIFT_REACH = 1, SANDSTORM_RADIUS = 1;

/** “巨大的丑东西” self-destruct radius (PRTS 天赋 "对半径3.0范围内所有我方单位…"; 2.5 [ASSUMED] until 0.1.3). */
const MCM_BOMB_RADIUS = 3;

/** 自在 【纬地经天】: tiles covered along the row and the column of the centre ("十字型") [ASSUMED]. */
const XI_CROSS_REACH = 2;

/** 扎罗 (PRTS 扎罗，“狼之主” 天赋; no numbers in the data): form-2 attack radius ("进行远程攻击，普通攻击为2连击，攻击范围半径1.25"),
 *  【远古威慑】 aura radius / ASPD ("自身1.5半径范围内的我方单位攻击速度-50(指定状况下生效)" — during the 重生 and in the second form).
 *  Until 0.1.3: 2.5 / 2.5 / −30, the aura only during the 重生 [ASSUMED]. */
const WOLF_RANGE = 1.25, WOLF_AWE_RADIUS = 1.5, WOLF_AWE_ASPD = -50;


/** 乌顶巨角卢鲁 【角力对决】: the operator cannot be pushed (fixed tiles) ⇒ "更多伤害" multiplier [ASSUMED]. */
const ELK_FAIL_SCALE = 2;

// ---------------------------------------------------------------------------------------------------------------
// kits

function kitDekght(ab) {
  const rage = { atkPct: T(ab, 'triggerrage.atk') ?? 0, aspd: T(ab, 'triggerrage.attack_speed') ?? 0, moveMul: 1 + (T(ab, 'triggerrage.move_speed') ?? 0) };
  const partnerRage = {
    otherDeath(c, b, e, a) {
      const u = c.unit;
      if (a.raged || !u || u === e || !/enemy_1513_dekght/.test(u.defId || '')) return;
      a.raged = true;
      b.addBuff(e, { key: 'ab:rage', mods: rage, persist: true, visible: true });
    },
    spawn(b, e) { watchDeaths(b, e); },
  };
  return partnerRage;
}

function kitLeaderMisc(key, ab, e) {
  switch (key) {
    case 'enemy_1050_lslime': {
      const dot = { dmg: T(ab, 'dot.damage') ?? 0, iv: T(ab, 'dot.interval') ?? 1, dur: T(ab, 'dot.duration') ?? 0 };
      return [maxTargets(4), lowHpBuff(T(ab, 'selfbuff.hp_ratio') ?? 0.5, { aspd: T(ab, 'selfbuff.attack_speed') ?? 0 }), {
        dealt(c, b, e2) {
          if (!(dot.dur > 0)) return;
          b.addBuff(c.target, { key: 'ab:burnDot', duration: dot.dur, refresh: 'replace', interval: dot.iv, visible: true,
            onTick: ({ battle, unit }) => battle.dealDamage(e2, unit, { amount: dot.dmg, type: 'arts', canDodge: false, ignoreSelect: true, tags: ['enemyAbility'] }) });
        },
      }, {
        // 被阻挡时会进行自爆 — PRTS “庞贝” 天赋: "被阻挡时，每10秒（受晕眩/无法行动/沉睡/冻结/浮空影响时暂停计时，解除阻挡时重置计时）对
        // 半径1.4范围内的所有我方单位造成1000预计算的无途径法术溅射伤害（不可对空）": the clock runs only while it is blocked and can
        // act, and restarts at 0 on every new block (until 0.1.3: a fixed 10 s clock from its spawn, radius 1, flyers hit)
        iv: 0,
        tick(b, e2, a, dt) {
          if (!e2.blockedBy) { a.held = 0; return; }
          if (!e2.canAct) return;
          a.held = (a.held || 0) + dt;
          if (a.held + 1e-9 < (T(ab, 'rangedamage.interval') ?? 10)) return;
          a.held = 0;
          b.fx('explode', { x: e2.x, y: e2.y, r: POMPEII_BLAST_RADIUS, kind: 'selfBlast' });
          for (const u of areaAllies(b, e2, e2.x, e2.y, POMPEII_BLAST_RADIUS)) if (!u.isFlying) hurt(b, e2, u, T(ab, 'rangedamage.attack@damage') ?? 0, 'arts', { tags: ['splash'] });
        },
      }];
    }
    case 'enemy_1500_skulsr': {
      // PRTS 碎骨 天赋: "不会攻击飞行单位"; below half HP ATK +50 %; "未被阻挡时发射榴弹对目标及其周围八格的我方单位造成相当于攻击力
      // 26%的物理伤害，并令其在5秒内防御力下降50%" ("榴弹对主目标造成物理普通伤害，对溅射目标造成物理溅射伤害，可溅射飞行单位") — the
      // 26 % / 5 s / 3×3 are PRTS's, the −50 % is the blackboard's defdown.def. A blocked attack is its plain melee hit. The
      // splash is an area selection: a 隐匿 operator is spared, the one blocking this enemy included (GitHub #97; #32
      // item 6, DESIGN §22.12). Community report #14 (0.1.2): the grenade used to be a full attack + 100 % on 4 neighbours.
      const dd = -(T(ab, 'defdown.def') ?? 0);
      return [lowHpBuff(T(ab, 'atkup.hp_ratio') ?? 0.5, { atkPct: T(ab, 'atkup.atk') ?? 0 }), noAirTargets(),
        splashAttack({ scale: SKULSR_GRENADE_SCALE, tiles: 1, fxKind: 'grenade',
          onEach: (b, e2, u) => { if (dd) b.applyStatus(u, 'defDown', { duration: SKULSR_DEFDOWN_DUR, source: e2, value: dd }); } })];
    }
    case 'enemy_1502_crowns': {
      const s = ab.sk.blink;
      return [skill(s, (b, e2) => blinkForward(b, e2, s.bb.dist ?? 1.5), { sil: true, cond: (b, e2) => !!e2.blockedBy })];
    }
    case 'enemy_1504_cqbw': {
      const s = ab.sk.C4;
      return [skill(s, (b, e2) => {
        const l = byPriority(e2, targetsNear(b, e2, s.bb.range_radius ?? e2.base.rangeRadius));
        const n = e2.hpRatio < 0.5 ? 2 : 1; // 生命值降至一半以下时炸药包的使用数量增加
        for (const t of l.slice(0, n)) {
          const x = t.x, y = t.y;
          b.fx('telegraph', { x, y, r: C4_RADIUS, dur: C4_FUSE, kind: 'c4' });
          // the C4 sits on its target (PRTS "在…1个非飞行的我方单位身上安装C4"): it is hit; the blast around it is an area
          b.after(C4_FUSE, () => { b.fx('explode', { x, y, r: C4_RADIUS, kind: 'c4' }); for (const u of targetAndArea(t, areaAllies(b, e2, x, y, C4_RADIUS))) hurt(b, e2, u, e2.s.atk * (s.bb.atk_scale ?? 1), 'phys'); });
        }
      }, { cond: (b, e2) => targetsNear(b, e2, s.bb.range_radius ?? e2.base.rangeRadius).length > 0 })];
    }
    case 'enemy_1509_mousek': {
      // 出场时拥有能够吸收大量法术伤害的屏障，屏障存在时防御力大幅增加 (arts-only barrier + DEF while it holds)
      const bar = artsBarrier(T(ab, 'shield.dynamic') ?? 0, { key: 'ab:sandDef', whileUp: { defFlat: T(ab, 'defup.def') ?? 0 } });
      const ds = ab.sk.DriftSand, ss = ab.sk.SandStorm;
      return [bar, lowHpBuff(T(ab, 'enrage.hp_ratio') ?? 0.5, { dmgDealtMul: T(ab, 'enrage.damage_scale') ?? 1 }),
        // 【唱沙】 the highest-max-HP unit on the field and everything in its cross: physical `damage`
        skill(ds, (b, e2) => {
          const t = allTargets(b, e2).sort((p, q) => q.s.maxHp - p.s.maxHp || aggroCmp(p, q))[0];
          if (!t) return;
          b.fx('telegraph', { x: t.tileC, y: t.tileR, r: DRIFT_REACH, kind: 'driftSand', tiles: 'plus', id: e2.id });
          // the cross ("伤害无视迷彩", no 无视无法选择): an area selection
          for (const u of areaAlliesInTiles(b, e2, t.tileR, t.tileC, 'plus', DRIFT_REACH)) hurt(b, e2, u, ds.bb.damage ?? 0, 'phys');
        }, { cond: (b, e2) => allTargets(b, e2).length > 0 }),
        // 【沙狱】 the lowest-max-HP unit and those around it: ATK −`atk` and `damage` arts per second for `duration` s
        skill(ss, (b, e2) => {
          const t = allTargets(b, e2).sort((p, q) => p.s.maxHp - q.s.maxHp || aggroCmp(p, q))[0];
          if (!t) return;
          const dur = ss.bb.duration ?? 0, x = t.x, y = t.y;
          b.fx('zone', { x, y, r: SANDSTORM_RADIUS, dur, kind: 'sandStorm', id: e2.id });
          // the 沙狱弹道 "击中…范围内的所有我方单位（弹道可对空）" selects: an airborne 起飞 ally and an unblocking 隐匿 one
          // are skipped (no 无视无法选择 — areaAllies)
          for (const u of areaAllies(b, e2, x, y, SANDSTORM_RADIUS)) {
            b.addBuff(u, { key: 'ab:sandStorm', duration: dur, refresh: 'replace', interval: 1, visible: true, mods: { atkPct: ss.bb.atk ?? 0 },
              onTick: ({ battle, unit }) => battle.dealDamage(e2, unit, { amount: ss.bb.damage ?? 0, type: 'arts', canDodge: false, ignoreSelect: true, tags: ['enemyAbility', 'sandStorm'] }) });
          }
        }, { cond: (b, e2) => allTargets(b, e2).length > 0 }),
      ];
    }
    case 'enemy_1511_mdrock': {
      // 拥有屏障吸收法术伤害，屏障存在时大幅提升生命上限与攻击速度; 周期性刷新屏障
      const s = ab.sk.RefreshShield;
      const bar = artsBarrier(s ? s.bb.dynamic ?? 0 : T(ab, 'shield.dynamic') ?? 0, { key: 'ab:rockPower',
        whileUp: { hpPct: (s ? s.bb.max_hp : null) ?? T(ab, 'shield.max_hp') ?? 0, aspd: (s ? s.bb.attack_speed : null) ?? T(ab, 'shield.attack_speed') ?? 0 } });
      return [bar, {
        // 攻击时攻击力永久提升，最多六层 (the blackboard ATK is the 6-stack total [ASSUMED split])
        attack(c, b, e2) { b.addBuff(e2, { key: 'ab:rockCharge', refresh: 'stack', stacks: 1, maxStacks: 6, persist: true, mods: { atkPct: (T(ab, 'charge.attack@enemy_mdrock_s_1[charge].atk') ?? 0) / 6 } }); },
      }, skill(s, (b, e2) => bar.refresh(b, e2, bar))];
    }
    case 'enemy_1513_dekght': {
      // 攻击时使目标与周围四格的单位受到物理伤害; 【蓄力攻击】 charge `duration` s, then ATK×atk_scale on the target's cross
      const s = ab.sk.ChargeAttack;
      // the 周围四格 of every attack (PRTS "对溅射目标造成物理溅射伤害") and 【蓄力锤】's cross: area selections
      return [kitDekght(ab), { before(c, b, e2) { const t = c.targets[0]; if (t) for (const u of areaAlliesInTiles(b, e2, t.tileR, t.tileC, 'plus', 1)) if (!c.targets.includes(u)) c.targets.push(u); } },
        skill(s, (b, e2) => {
          const t = e2.blockedBy;
          const dur = s.bb.duration ?? 0, r = t.tileR, cc = t.tileC;
          b.addBuff(e2, { key: 'ab:charging', duration: dur, visible: true, flags: { disarm: true } });
          b.fx('telegraph', { x: cc, y: r, r: 1, dur, kind: 'chargeAttack', tiles: 'plus', id: e2.id });
          b.after(dur, () => {
            if (!e2.alive || e2.s.flags.stun) return;
            b.fx('explode', { x: cc, y: r, r: 1, kind: 'chargeAttack', tiles: 'plus' });
            for (const u of areaAlliesInTiles(b, e2, r, cc, 'plus', 1)) hurt(b, e2, u, e2.s.atk * (s.bb['dekght[aoe].atk_scale'] ?? s.bb.atk_scale ?? 1), 'phys');
          }, { owner: e2 });
        }, { cond: (b, e2) => !!(e2.blockedBy && e2.blockedBy.alive) })];
    }
    case 'enemy_1513_dekght_2': {
      // 同时攻击两名目标; 爆炸箭: three targets, after `interval` s ATK×atk_scale arts on each target's cross
      const s = ab.sk.TripleAttack;
      const cands = (b, e2) => byPriority(e2, targetsNear(b, e2, e2.base.rangeRadius || 2.5));
      return [kitDekght(ab), maxTargets(2), skill(s, (b, e2) => {
        const delay = s.bb['dekght_2[aoe].interval'] ?? 0, scale = s.bb['dekght_2[aoe].atk_scale'] ?? 1;
        for (const t of cands(b, e2).slice(0, 3)) {
          const r = t.tileR, cc = t.tileC;
          b.fx('telegraph', { x: cc, y: r, r: 1, dur: delay, kind: 'blastArrow', tiles: 'plus', id: e2.id });
          b.after(delay, () => {
            if (!e2.alive) return;
            b.fx('explode', { x: cc, y: r, r: 1, kind: 'blastArrow', tiles: 'plus' });
            // "对主目标造成法术普通伤害，对溅射目标造成法术溅射伤害": the arrow's target + the 周围四格 (an area)
            for (const u of targetAndArea(t, areaAlliesInTiles(b, e2, r, cc, 'plus', 1))) hurt(b, e2, u, e2.s.atk * scale, 'arts');
          }, { owner: e2 });
        }
      }, { cond: (b, e2) => cands(b, e2).length > 0 })];
    }
    case 'enemy_1539_reid': {
      // 生命值降至一半以下时攻击力大幅度提升; 首次被击倒后重生 (Reborn.duration s), 恢复一半生命值;
      // 【冲锋】 (PRTS 技能 "仅自身未被阻挡且存在符合条件的可选目标时可触发：选择3.0半径内位于自身下个检查点前的后续路径上(包含自身当前
      // 所在地块)的距离自身最近的我方单位，将其所在地块中心设置为自身下一检查点；技能使用成功后，自身移动速度+200%，持续4.5s"): a target
      // it may select (targetsNear: no 隐匿 / 迷彩 / 起飞 / untargetable operator) within RUSH_RADIUS standing on its own path to
      // the next checkpoint (its tile included) ⇒ move speed ×(1+move_speed) for `duration` s. It walks that path anyway, so
      // the re-aim at the target's tile is not a separate move. Until 0.1.3: any unit within the blackboard's 1.5, 隐匿 / 迷彩
      // ones included, off its path too.
      const rush = ab.sk.Rush;
      const prey = (b, e2) => {
        const keys = pathKeysAhead(e2);
        return targetsNear(b, e2, RUSH_RADIUS).filter((u) => u.ground && keys.has(u.tileR * COLS + u.tileC));
      };
      return [lowHpBuff(T(ab, 'atkup.hp_ratio') ?? 0.5, { atkPct: T(ab, 'AtkUp.atk', 'atkup.atk') ?? 0 }),
        reborn({ dur: T(ab, 'Reborn.duration') ?? 0, hpRatio: T(ab, 'Reborn.hp_ratio') ?? 0.5, invincible: T(ab, 'Reborn.invincible') ?? 0 }),
        skill(rush, (b, e2) => {
          b.addBuff(e2, { key: 'ab:rush', duration: rush.bb.duration ?? 0, refresh: 'replace', visible: true, mods: { moveMul: 1 + (rush.bb.move_speed ?? 0) } });
          b.fx('charge', { x: e2.x, y: e2.y, id: e2.id, kind: 'avengerRush' });
        }, { cond: (b, e2) => !e2.blockedBy && prey(b, e2).length > 0 })];
    }
    case 'enemy_2003_rockman': {
      const s = ab.sk.StunAttack;
      const cands = (b, e2) => targetsNear(b, e2, (e2.def.raw.stats && e2.def.raw.stats.rawRangeRadius) || 2.5).filter((u) => !u.s.flags.stun);
      return [skill(s, (b, e2) => {
        const t = byPriority(e2, cands(b, e2))[0];
        if (!t) return;
        b.addProjectile({ from: e2, target: t, speed: 8, visual: 'lob', source: e2, onHit: (c) => {
          if (!c.target || !c.target.alive) return;
          hurt(b, e2, c.target, e2.s.atk * (s.bb.atk_scale ?? 1), 'phys');
          if (c.target.alive) b.applyStatus(c.target, 'stun', { duration: s.bb.stun ?? 0, source: e2 });
        } });
      }, { cond: (b, e2) => cands(b, e2).length > 0 })];
    }
    case 'enemy_2004_balloon': {
      // 喷气人 · 升空 when blocked → 飞行模式 for `duration` s: PRTS 喷气人 "近地悬浮，不可阻挡，失衡免疫，移动速度+50%，不进行
      // 攻击" — an air unit meanwhile (flag `float`: melee cannot hit it; it keeps the ground path, as setFloat), never
      // displaced; "切换为飞行模式后，1.5秒内移动速度最终降低90% … 结束后，1.333秒内不可阻挡，移动速度最终降低90%" (PRTS numbers:
      // the blackboard has only the duration and the +50 %).
      const s = ab.sk.TakeOff;
      const BRAKE = { moveMul: 0.1 }, BRAKE_UP = 1.5, LANDING = 1.333;
      return [skill(s, (b, e2) => {
        b.addBuff(e2, {
          key: 'ab:takeoff', duration: s.bb.duration ?? 0, flags: { unblockable: true, float: true, noDisplace: true }, mods: { moveMul: 1 + (s.bb['balloon_s[fly].move_speed'] ?? 0) }, visible: true,
          onExpire: ({ battle }) => { if (e2.alive) battle.addBuff(e2, { key: 'ab:landing', duration: LANDING, flags: { unblockable: true }, mods: BRAKE }); },
        });
        b.addBuff(e2, { key: 'ab:takeoffBrake', duration: BRAKE_UP, mods: BRAKE });
        b.fx('telegraph', { x: e2.x, y: e2.y, r: 0.5, kind: 'takeoff', id: e2.id });
      }, { cond: (b, e2) => !!e2.blockedBy })];
    }
    case 'enemy_2005_axetro':
      return [{
        attack(c, b, e2, a) {
          a.last = b.time;
          b.addBuff(e2, { key: 'ab:axeStack', refresh: 'stack', stacks: 1, maxStacks: T(ab, 'atkup.max_stack_cnt') ?? 1, persist: true, mods: { atkPct: T(ab, 'atkup.atk') ?? 0, aspd: T(ab, 'atkup.attack_speed') ?? 0 } });
        },
        iv: 0.5,
        tick(b, e2, a) { if (a.last != null && b.time - a.last >= (T(ab, 'checker.delay') ?? 4)) { a.last = null; b.removeBuff(e2, 'ab:axeStack'); } },
      }];
    case 'enemy_2008_flking': {
      // 使全战场我方所有单位攻击力、防御力减半 (text; the blackboard's atkdown.atk_scale is not the halving),
      // 部署费用回复速度减半，再部署时间加倍; 周期性地添加正比于自身最大生命值的伤害防护屏障. The halving is a map effect
      // (PRTS “墓碑” "※文字描述中的削弱实际属于地图效果，不属于敌人本身的能力"): every ally, 隐匿 / airborne ones included
      const s = ab.sk.refreshshield;
      // its attack — PRTS “墓碑” 天赋: "自身造成的远程途径伤害的攻击倍率降低至40%" (the blackboard's atkdown.atk_scale), "未被阻挡时会
      // 进行远程攻击，对目标及其周围八格内的所有我方单位造成物理伤害，不会攻击飞行单位" ("可溅射飞行单位"); blocked, a melee hit at
      // 100 %. Until 0.1.3: a single-target hit at 100 % either way.
      return [noAirTargets(), splashAttack({ scale: T(ab, 'atkdown.atk_scale') ?? 1, tiles: 1 }), {
        iv: 0.5,
        tick(b) {
          for (const u of b.allies()) {
            auraBuff(b, u, 'ab:tombstone', 0.5, { atkMul: 0.5, defMul: 0.5 }, null, true);
            // persistent so it still counts when the unit falls (the redeploy timer is set at death)
            b.addBuff(u, { key: 'ab:tombRedeploy', duration: 0.6, refresh: 'replace', persist: true, mods: { redeployMul: 2 } });
          }
        },
      }, {
        tick(b, e2, a, dt) { for (const p of b.players) b.addDp(p.playerId, -0.5 * b.flags.dpPerSec * dt); },
      }, skill(s, (b, e2) => b.addBuff(e2, { key: 'ab:tombShield', shield: e2.s.maxHp * (s.bb.hp_ratio ?? 0), persist: true }))];
    }
    case 'enemy_2048_smgrd':
      // 持续在自身周围8格生成【国度】 (the 3×3 around its tile), 大幅降低其中我方单位的攻击速度; 对【国度】中的我方单位造成高额物理伤害.
      // 【国度】 is a tile effect ("将该地块及其周围8格范围内的可部署位生成【国度】"): every ally on it, 隐匿 ones too [ASSUMED]
      return [{
        iv: 0.5,
        tick(b, e2) { for (const u of alliesInTiles(b, Math.round(e2.y), Math.round(e2.x), 'box', 1)) auraBuff(b, u, 'ab:blackFog', 0.5, { aspd: T(ab, 'BlackFog.attack_speed') ?? 0 }, null, true); },
        hitOut(c, b, e2) {
          const t = c.target;
          if (c.dmg.isAttack && t.side === 'ally' && Math.max(Math.abs(t.tileR - Math.round(e2.y)), Math.abs(t.tileC - Math.round(e2.x))) <= 1) c.dmg.amount *= T(ab, 'DamageUp.atk_scale') ?? 1;
        },
      }];
    case 'enemy_2050_smsha': {
      const cold = T(ab, 'Attack.attack@freeze') ?? 0, n = T(ab, 'Attack.attack@chain.max_target') ?? 1, fall = T(ab, 'Attack.attack@chain.atk_scale') ?? 1;
      const jr = T(ab, 'Attack.attack@projectile_range') ?? 1.6;
      const cb = ab.sk.ChainBuff;
      return [onHitStatus('cold', cold), {
        dealt(c, b, e2) {
          let prev = c.target;
          const hit = new Set([prev]);
          for (let k = 1; k < n; k++) {
            // a jump selects within jr of the last target (中点判定): no unblocking 隐匿 or airborne 起飞 ally (areaAllies)
            const nx = areaAllies(b, e2, prev.x, prev.y, jr).find((u) => !hit.has(u));
            if (!nx) break;
            hit.add(nx);
            hurt(b, e2, nx, e2.s.atk * powi(fall, k), 'arts');
            if (nx.alive && cold > 0) b.applyStatus(nx, 'cold', { duration: cold, source: e2 });
            prev = nx;
          }
        },
      },
      // 【反自然馈赠】 (SILENCE): "attacks" another enemy in range and jumps between up to chain.max_target enemies
      // (projectile_range per jump), raising their move speed and ASPD for `duration` s
      skill(cb, (b, e2) => {
        const bb = cb.bb, jump = bb.projectile_range ?? jr, max = bb['chain.max_target'] ?? 3;
        const near = (x, y, r, seen) => b.enemiesInRadius(x, y, r).filter((o) => o !== e2 && !seen.has(o))
          .sort((p, q) => hypot(p.x - x, p.y - y) - hypot(q.x - x, q.y - y) || p.spawnSeq - q.spawnSeq)[0];
        const seen = new Set();
        let prev = e2, cur = near(e2.x, e2.y, e2.base.rangeRadius || 3.5, seen);
        while (cur && seen.size < max) {
          seen.add(cur);
          b.fx('beam', { x: prev.x, y: prev.y, from: prev.id, to: cur.id, kind: 'chainBuff' });
          b.addBuff(cur, { key: 'ab:chainBuff', duration: bb.duration ?? 0, refresh: 'replace', visible: true, mods: { moveMul: 1 + (bb.move_speed ?? 0), aspd: bb.attack_speed ?? 0 } });
          prev = cur;
          cur = near(cur.x, cur.y, jump, seen);
        }
      }, { sil: true, cond: (b, e2) => b.enemiesInRadius(e2.x, e2.y, e2.base.rangeRadius || 3.5).some((o) => o !== e2) })];
    }
    case 'enemy_2052_smgia': {
      // 数次攻击后晕眩; 受到来自自然环境的伤害时 (terrain damage), 自身在短时间内获得高额脆弱 (damage taken ×damage_scale)
      const lim = T(ab, 'Weak.weak[limit]') ?? 0, scale = T(ab, 'Weak.damage_scale') ?? 1;
      return [nthAttackStatus(nthOf(ab.sk.StunAttack), 'stun', (ab.sk.StunAttack && ab.sk.StunAttack.bb.stun) || 0, false), {
        taken(c, b, e2) {
          if (!(lim > 0) || !(c.amount > 0) || !(c.dmg.tags && c.dmg.tags.includes('terrain'))) return;
          b.addBuff(e2, { key: 'ab:natureWeak', duration: lim, refresh: 'replace', visible: true, mods: { dmgTakenMul: scale } });
        },
      }];
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------------------------------------------
// multi-form leaders (悬赏 bounty targets): the first knock-out switches them to their second form (reborn helper)

/** Distance from point p to segment a–b. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** A second normal hit on the same target ("二连击"): same damage type, no further on-hit procs. */
const doubleHit = (on = () => true, extra = null) => ({
  dealt(c, b, e, a) {
    if (!on(b, e, a) || !c.target.alive) return;
    b.dealDamage(e, c.target, { amount: e.s.atk, type: c.dmg.type, canDodge: true, tags: ['enemyAbility', 'secondHit'], ...(extra ? extra(c, b, e) : {}) });
  },
});

/** 巨大的丑东西 · melee ×rage; KO ⇒ self-destruct (big stun) and the 大祭司 pilot ejects: no attack, unblockable, own DEF/RES,
 *  faster, loses bird_run.damage true HP per second. (巨蕈/木桩 tiles and its ranged splash attack have no counterpart here:
 *  its data radius is 0.) */
function kitUglyThing(ab) {
  const rage = T(ab, 'combat.attack@mcmstr_rage_attack.atk_scale') ?? 1;
  const bomb = ab.sk['bomb[reborning]'] ? ab.sk['bomb[reborning]'].bb : {};
  const run = { spd: T(ab, 'bird_run.move_speed') ?? 0, def: T(ab, 'bird_run.def'), res: T(ab, 'bird_run.magic_resistance'), dmg: T(ab, 'bird_run.damage') ?? 0 };
  const P = { pilot: false };
  return [
    // 远程攻击造成溅射伤害，近战攻击造成更高伤害 — PRTS 天赋: unblocked, a ranged attack on 1 non-flying unit within 2.5 hitting it
    // and its 8 surrounding tiles for 100 % ATK ("可溅射飞行单位"); blocked, a melee hit at mcmstr_rage_attack.atk_scale
    { spawn(b, e) { e.base.rangeRadius = Math.max(e.base.rangeRadius || 0, MCM_RANGE); e.profile.canTarget = (u) => !u.isFlying; } },
    splashAttack({ scale: 1, meleeScale: rage, tiles: 1 }),
    reborn({
      dur: T(ab, 'reborn.duration') ?? 0,
      onKo(b, e) {                                  // 生命值降至0后自爆，造成大范围晕眩 (an area selection), 2.17 s into the 重生
        const x = e.x, y = e.y;
        b.fx('telegraph', { x, y, r: MCM_BOMB_RADIUS, dur: MCM_BOMB_DELAY, kind: 'mechBomb', id: e.id });
        b.after(MCM_BOMB_DELAY, () => {
          if (!e.alive || e.removed) return;
          b.fx('explode', { x, y, r: MCM_BOMB_RADIUS, kind: 'mechBomb', id: e.id });
          for (const u of areaAllies(b, e, x, y, MCM_BOMB_RADIUS)) {
            hurt(b, e, u, e.s.atk * (bomb.atk_scale ?? 0), 'phys');
            if (u.alive && bomb.stun > 0) b.applyStatus(u, 'stun', { duration: bomb.stun, source: e });
          }
        }, { owner: e });
      },
      onReborn(b, e) {                              // 大祭司形态: 不进行攻击，无法被阻挡，每秒受到真实伤害
        P.pilot = true;
        e.profile.noAttack = true;
        b.addBuff(e, {
          key: 'ab:pilot', persist: true, visible: true, flags: { unblockable: true }, interval: 1,
          mods: { moveMul: 1 + run.spd, defFlat: run.def != null ? run.def - e.base.def : 0, resFlat: run.res != null ? run.res - e.base.res : 0 },
          onTick: ({ battle, unit }) => { if (run.dmg > 0) battle.dealDamage(null, unit, { amount: run.dmg, type: 'true', canDodge: false, tags: ['enemyAbility', 'pilotBurn'] }); },
        });
      },
    }),
  ];
}

/** 杰斯顿·威廉姆斯 · 狱警: RES +enhance, ranged arts, every (sp+1)th attack stuns max_target units; KO ⇒ (reborn.duration s)
 *  杀手: frees every prisoner, DEF/ATK/ASPD/speed up, melee physical, every (sp+1)th attack hits `times` × ignoring def_penetrate. */
function kitWarden(ab) {
  const en = (k) => T(ab, `enhance.${k}`) ?? 0;
  const iron = ab.sk.ironsandstorm, pierce = ab.sk.armorpiercing;
  const P = { killer: false, n: 0, power: false };
  const pen = () => (pierce && pierce.bb.def_penetrate) || 0;
  return [{
    spawn(b, e, a, ab2) {
      ab2.atkType = 'arts';                                    // 攻击造成远程法术伤害
      e.profile.melee = false;
      b.addBuff(e, { key: 'ab:warden', persist: true, visible: true, mods: { resFlat: en('magic_resistance') } });  // 法术抗性大幅提升
    },
    before(c, b) { const s = P.killer ? pierce : iron; P.power = !!s && (P.n + 1) % nthOf(s) === 0; },
    hitOut(c) { if (P.killer && P.power && c.dmg.isAttack) c.dmg.defIgnorePct = Math.min(1, (c.dmg.defIgnorePct || 0) + pen()); },
    dealt(c, b, e) {
      if (!P.killer || !P.power || !pierce) return;
      // [ASSUMED] DESIGN §32.5: extra pierce hits share the `times` cap. Official values stay at or below 12.
      const pierceTimes = Math.min(bbCap('times'), typeof pierce.bb.times === 'number' && Number.isFinite(pierce.bb.times) ? pierce.bb.times : 1);
      for (let i = 1; i < pierceTimes && c.target.alive; i++) b.dealDamage(e, c.target, { amount: e.s.atk, type: 'phys', defIgnorePct: pen(), canDodge: true, isSkill: true, tags: ['enemyAbility', 'armorPiercing'] });
    },
    attack(c, b, e) {
      P.n++;
      if (!P.power || P.killer || !iron) return;
      // 能使多名单位晕眩: the skill attack stuns up to max_target units in its range (its target first)
      const l = byPriority(e, targetsNear(b, e, e.base.rangeRadius || 2));
      for (const t of c.targets) if (!l.includes(t)) l.unshift(t);
      for (const u of l.slice(0, iron.bb.max_target ?? 1)) if (u.alive) b.applyStatus(u, 'stun', { duration: iron.bb.stun ?? 0, source: e });
    },
  }, reborn({
    dur: T(ab, 'reborn.duration') ?? 0,
    onKo(b) { freeAllPrisoners(b); },                         // 进入杀手形态时解放全场敌人
    onReborn(b, e) {
      P.killer = true; P.n = 0;
      e.mem.ab.atkType = null;                                 // 攻击造成近战物理伤害
      e.profile.melee = true;
      b.removeBuff(e, 'ab:warden');
      b.addBuff(e, { key: 'ab:killer', persist: true, visible: true,
        mods: { defFlat: en('def'), atkFlat: en('atk'), batPct: en('base_attack_time') / (e.base.bat || 1), moveFlat: en('move_speed') } });
    },
  })];
}

/** “自在” · 【纬地经天】 arts cross on the nearest unit (form 2: + the farthest); 【破桎而出】 barrier — unbroken after its
 *  duration ⇒ ATK×atk_scale arts around; KO ⇒ second form (ATK up, double hits, stronger 破桎而出). 晦明 attributes n/a. */
function kitXi(ab) {
  const cross = ab.sk.CrossAttack, sb = ab.sk.ShieldBurst, sb2 = ab.sk.ShieldBurstReborn;
  const P = { form2: false };
  const byDist = (b, e) => allTargets(b, e).sort((p, q) => hypot(p.x - e.x, p.y - e.y) - hypot(q.x - e.x, q.y - e.y) || aggroCmp(p, q));
  const crossAt = (b, e, t) => {
    const r0 = t.tileR, c0 = t.tileC;
    b.fx('telegraph', { x: c0, y: r0, r: XI_CROSS_REACH, kind: 'xiCross', tiles: 'plus', id: e.id });
    // "伤害无视迷彩", no 无视无法选择: the cross is an area selection
    for (const u of areaAlliesInTiles(b, e, r0, c0, 'plus', XI_CROSS_REACH)) if (u.tileR === r0 || u.tileC === c0) hurt(b, e, u, e.s.atk * ((cross && cross.bb.atk_scale) ?? 1), 'arts');
  };
  const burst = (s) => (b, e) => {
    const dur = s.bb.duration ?? 0, r = s.bb.range_radius ?? 0;
    b.fx('telegraph', { x: e.x, y: e.y, r, dur, kind: 'breakFree', id: e.id });
    b.addBuff(e, { key: 'ab:xiShield', duration: dur, shield: s.bb.dynamic ?? 0, visible: true,
      // expiry (not breaking: a broken barrier is removed without onExpire) = the barrier held
      onExpire: ({ battle }) => {
        if (!e.alive) return;
        battle.fx('explode', { x: e.x, y: e.y, r, kind: 'breakFree', id: e.id });
        for (const u of areaAllies(battle, e, e.x, e.y, r)) hurt(battle, e, u, e.s.atk * (s.bb.atk_scale ?? 0), 'arts');
      } });
  };
  const re = reborn({
    dur: T(ab, 'reborn.duration') ?? 0, invincible: T(ab, 'reborn.invincible') ?? 0,
    // #510: Xi's post-rebirth 无敌 also prevents hostile selection (PRTS “自在” / 无敌).
    // Explicit opt-in: the engine's general invulnerable flag remains damage protection only.
    invincibleUntargetable: true,
    onKo(b, e) { b.removeBuff(e, 'ab:xiShield'); },
    onReborn(b, e) {
      P.form2 = true;
      b.addBuff(e, { key: 'ab:xiReborn', persist: true, visible: true, mods: { atkPct: T(ab, 'reborn.atk') ?? 0 } });   // 攻击力提升
      if (s2) s2.left = s2.icd;
    },
  });
  const s1 = skill(sb, burst(sb), { cond: () => !P.form2 });
  const s2 = skill(sb2, sb2 ? burst(sb2) : null, { cond: () => P.form2 });
  return [re, s1, s2, doubleHit(() => P.form2),                   // 普通攻击进行两次
    skill(cross, (b, e) => {
      const l = byDist(b, e);
      if (!l.length) return;
      crossAt(b, e, l[0]);
      if (P.form2 && l.length > 1) crossAt(b, e, l[l.length - 1]);   // 额外对最远目标释放
    }, { cond: (b, e) => allTargets(b, e).length > 0 })];
}

/** 锏 · 抵抗; DEF penetration against its blocker; 【速杀】 passes through its blocker hitting those on the way; 【肆虐风雪】
 *  AoE; KO ⇒ second form: stealth, more penetration, double hits, 【瞬息杀机】 at every 25 % HP lost (SP cleared + no attacks
 *  / heals around it). <降雪> absent. */
function kitMace(ab) {
  const pen1 = T(ab, 'DefPenetrate.enemy_blkswb_t_2.def_penetrate') ?? 0, pen2 = T(ab, 'DefPenetrate.enemy_blkswb_t_2[reborn].def_penetrate') ?? pen1;
  const cs = { ratio: T(ab, 'ClearSp.hp_ratio') ?? 0, dur: T(ab, 'ClearSp.duration') ?? 0, r: T(ab, 'ClearSp.range_radius') ?? 0 };
  const P = { form2: false, next: 1 };
  const penOn = (c, e) => (c.target === e.blockedBy ? (P.form2 ? pen2 : pen1) : 0);
  // its blocker is hit (PRTS 技能 "对之前阻挡自身的单位造成…"); the others on the way are an area selection (areaSelectable)
  const blink = (s) => (b, e) => {
    const bl = e.blockedBy;
    const from = blinkForward(b, e, s.bb.dist ?? 1.5);
    if (!from) return;
    for (const u of b.allies()) {
      if (u !== bl && (segDist(u.x, u.y, from.x, from.y, e.x, e.y) > 0.5 || !areaSelectable(e, u))) continue;
      hurt(b, e, u, e.s.atk * (s.bb.atk_scale ?? 1), 'phys');
    }
  };
  const circle = (s) => (b, e) => {
    const r = s.bb.range_radius ?? 0;
    b.fx('explode', { x: e.x, y: e.y, r, kind: 'blizzard', id: e.id });
    for (const u of areaAllies(b, e, e.x, e.y, r)) hurt(b, e, u, e.s.atk * (s.bb.atk_scale ?? 1), 'phys');
  };
  // cast with a target in the circle — the trigger selection (targetsNear: PRTS 选择器 "所有触发选择器通常不无视迷彩"): no
  // airborne (起飞) operator for a ground enemy (§21.22), no unblocking 隐匿 or 迷彩 one
  const inR = (b, e, s) => targetsNear(b, e, (s && s.bb.range_radius) || 0).length > 0;
  return [resist(), {
    hitOut(c, b, e) { const p = penOn(c, e); if (c.dmg.isAttack && p > 0) c.dmg.defIgnorePct = Math.min(1, (c.dmg.defIgnorePct || 0) + p); },
    taken(c, b, e) {                                             // 【瞬息杀机】 every hp_ratio of max HP lost (second form)
      if (!P.form2 || !(cs.ratio > 0)) return;
      while (e.alive && e.hpRatio <= P.next - cs.ratio + 1e-9 && P.next - cs.ratio > 1e-9) {
        P.next -= cs.ratio;
        b.fx('explode', { x: e.x, y: e.y, r: cs.r, kind: 'clearSp', id: e.id });
        for (const u of areaAllies(b, e, e.x, e.y, cs.r)) {
          const sk = u.skill;
          if (sk && !sk.noSkill && sk.kind !== 'passive' && !sk.active && sk.spCost > 0) { sk.sp = 0; sk.charges = 0; }   // 清空技力 (stored charges too)
          if (cs.dur > 0) b.applyStatus(u, 'disarm', { duration: cs.dur, source: e });
        }
      }
    },
  }, doubleHit(() => P.form2, (c, b, e) => ({ defIgnorePct: penOn(c, e) })),
  skill(ab.sk.Blink, blink(ab.sk.Blink || { bb: {} }), { id: 'blink', cond: (b, e) => !P.form2 && !!e.blockedBy }),
  skill(ab.sk.Blink2, blink(ab.sk.Blink2 || { bb: {} }), { id: 'blink2', cond: (b, e) => P.form2 && !!e.blockedBy }),
  skill(ab.sk.CircleAttack, circle(ab.sk.CircleAttack || { bb: {} }), { id: 'circle', cond: (b, e) => !P.form2 && inR(b, e, ab.sk.CircleAttack) }),
  skill(ab.sk.CircleAttack2, circle(ab.sk.CircleAttack2 || { bb: {} }), { id: 'circle2', cond: (b, e) => P.form2 && inR(b, e, ab.sk.CircleAttack2) }),
  reborn({
    dur: T(ab, 'Reborn.duration') ?? 0, invincible: T(ab, 'Reborn.invincible') ?? 0,
    onReborn(b, e) { P.form2 = true; P.next = 1; b.addBuff(e, { key: 'ab:stealth', flags: { stealth: true }, persist: true }); },
  })];
}

/** 扎罗，“狼之主” · first form: damage taken −30 %, not stunnable, 【溶血骇惧】; KO ⇒ a Reborn.duration s 重生 (its HP refills,
 *  【远古威慑】 slows the units around it) ⇒ second form: ranged double hits within WOLF_RANGE, ATK/ASPD up, invincible at first,
 *  【远古威慑】 still on. 【溶血骇惧】 (PRTS 技能 "使场上最多3名我方单位攻击速度-70，获得无法撤退，逐渐流失生命（从0/秒开始线性递增，在
 *  40秒后达到最大流失速度30%最大生命值/秒），持续时间无限 … 场上存在被此技能影响的单位时狼之主获得静默 … 释放此技能时狼之主记录自身当前
 *  生命值，累计损失20%生命值后解除场上全部我方单位的技能效果"): the FearCage blackboard's attack_speed, hp_ratio (the loss rate
 *  reached at duration_bleed s), hp_ratio_offset (the cure); its SP (the cast's cooldown, spCost s at +1/s [ASSUMED]) stands
 *  still while a unit is caught (静默), each ended effect gives back sp, and the last one starts duration_wait s more of 静默
 *  ("每结束1个技能效果狼之主回复5SP，场上技能效果全部结束时狼之主获得7s静默"). Until 0.1.3 the loss peaked at 5 % [ASSUMED], the buff
 *  ended after 40 s, hp_ratio (30 %) was read as the cure and the cast came every spCost s whatever was caught. Not modelled:
 *  血债账款 / 【狂暴怒嗥】. */
function kitWolfLord(ab) {
  const fc = ab.sk.FearCage;
  const P = { form2: false, caught: 0, waitUntil: -Infinity, cast: null };
  const caught = (b) => b.allies().some((u) => u.findBuff('ab:fearCage'));
  const cure = (b) => { for (const u of b.allies()) { const d = u.findBuff('ab:fearCage'); if (d) b.removeBuff(u, d); } };
  // 【远古威慑】 (a buff aura, auraAllies): no 隐匿 operator, the blocker included, an airborne 起飞 one still — as 深池伙友卫队's
  const awe = (b, e) => { for (const u of auraAllies(b, e, e.x, e.y, WOLF_AWE_RADIUS)) auraBuff(b, u, 'ab:ancientAwe', 0.2, { aspd: WOLF_AWE_ASPD }, null, true); };
  return [{
    spawn(b, e, a, ab2) {
      ab2.immune = new Set([...(ab2.immune || []), 'stun']);   // 第一形态: 不可被晕眩
      b.addBuff(e, { key: 'ab:wolfGuard', persist: true, visible: true, mods: { dmgTakenMul: 1 - (T(ab, 'Passive.damage_resistance') ?? 0) } });
    },
    iv: 0.1,
    tick(b, e, a, dt) {
      if (P.form2) { awe(b, e); return; }                      // 第二形态: 【远古威慑】生效
      if (!fc) return;
      // afflicted units recover once 扎罗 lost hp_ratio_offset of its HP since the cast
      const cut = Math.abs(fc.bb.hp_ratio_offset ?? 0.2);
      let n = 0;
      for (const u of b.allies()) {
        const d = u.findBuff('ab:fearCage');
        if (!d || d.data.src !== e) continue;
        if (e.hpRatio <= d.data.hp0 - cut + 1e-9) b.removeBuff(u, d); else n++;
      }
      if (P.cast) {
        if (n < P.caught) {                                      // ended effects (cured, knocked out): +sp each
          P.cast.left -= (fc.bb.sp ?? 0) * (P.caught - n);
          if (n === 0) P.waitUntil = b.time + (fc.bb.duration_wait ?? 0);
        }
        if (n > 0 || b.time < P.waitUntil) P.cast.left += dt;    // 静默: its SP stands still
      }
      P.caught = n;
    },
  },
  // 【溶血骇惧】 every spCost s (enemy SP +1/s [ASSUMED]), first form only, never during its 静默
  P.cast = skill(fc, (b, e) => {
    const l = b.rng.shuffle(allTargets(b, e).filter((u) => u.kind === 'op' && !u.findBuff('ab:fearCage'))).slice(0, fc.bb.max_target ?? 3);
    const ramp = Math.max(1, fc.bb.duration_bleed ?? 40), peak = fc.bb.hp_ratio ?? 0;
    for (const u of l) {
      b.fx('beam', { x: e.x, y: e.y, from: e.id, to: u.id, kind: 'fearCage' });
      b.addBuff(u, { key: 'ab:fearCage', refresh: 'replace', visible: true, interval: 1, data: { src: e, hp0: e.hpRatio, t0: b.time },
        mods: { aspd: fc.bb.attack_speed ?? 0 },
        onTick: ({ battle, unit, buff }) => {
          // its 扎罗 gone from the field without a 重生 (leaked, removed): the effect ends, no loss this tick [ASSUMED — no
          // official text; the 重生's onKo cure covers its knock-out]. Until 0.1.3 a leak left it draining for good.
          const src = buff.data.src;
          if (!src || !src.alive || src.removed) { battle.removeBuff(unit, buff); return; }
          const k = Math.min(1, (battle.time - buff.data.t0) / ramp);
          battle.loseHp(unit, unit.s.maxHp * peak * k, { source: e });
        } });
    }
  }, { cd: fc ? fc.sp || fc.cd : null, icd: fc ? fc.sp || fc.icd : null, cond: (b, e) => !P.form2 && !caught(b) && b.time >= P.waitUntil && allTargets(b, e).some((u) => u.kind === 'op') }),
  doubleHit(() => P.form2),                                     // 攻击变为远程二连击
  reborn({
    dur: T(ab, 'Reborn.duration') ?? 0, invincible: T(ab, 'Passive2.invincible_time') ?? 0,
    onKo(b, e) {
      cure(b);
      b.removeBuff(e, 'ab:wolfGuard');
      if (e.mem.ab.immune) e.mem.ab.immune.delete('stun');
    },
    during(b, e, a, t) {                                         // 重生期间【远古威慑】生效; its HP refills slowly
      const dur = T(ab, 'Reborn.duration') ?? 1;
      e.hp = Math.max(1, e.s.maxHp * Math.min(1, t / Math.max(TICK, dur)));
      awe(b, e);
    },
    onReborn(b, e) {
      P.form2 = true;
      e.profile.melee = false;
      e.base.rangeRadius = Math.max(e.base.rangeRadius || 0, WOLF_RANGE);
      b.addBuff(e, { key: 'ab:wolfRage', persist: true, visible: true, mods: { atkPct: T(ab, 'Passive2.atk') ?? 0, batPct: (T(ab, 'Passive2.base_attack_time') ?? 0) / (e.base.bat || 1) } });
    },
  })];
}

/**
 * 转译基底·α (PRTS 转译基底·α 天赋; enemy_database talents Passive / Mode_*_Passive / Mode_Fuchou_Anger; skills ChangeToB/C/D):
 * 原始形态 — no attack, every damage instance is cancelled ("受到伤害时取消此伤害"), 失衡免疫, immune to 晕眩/沉睡/寒冷/冻结/浮空/
 * 恐惧. The 4th physical damage instance taken ⇒ 寻仇者, the 4th arts one ⇒ 特战术师, being blocked ⇒ 幽灵 — once ("仅可变化一次");
 * the change takes TRANSLATOR_CHANGE (2) s, standing still and still in the original form [ASSUMED: immobile, damage
 * still cancelled]; then the form's flat stat changes apply (move speed relative to the data's 1.0, attack interval
 * +N s, 重量等级 +N):
 *   寻仇者 (form B): melee only, physical; ATK +100 % while HP < 50 % (Mode_Fuchou_Anger.atk);
 *   特战术师 (form D): ranged only (the data's 2.4 radius), arts, 2 targets at once — flyers included [ASSUMED: the
 *     translator's text "仅进行远程攻击，同时攻击2个目标，造成法术伤害" names no exception; the standalone PRTS 特战术师's talent
 *     "不会攻击飞行单位" may carry over — then `canTarget: (u) => !u.isFlying` in finish()];
 *   幽灵 (form C): no stat change, unblockable, no attack (PRTS 转译基底·α "幽灵形态 无属性变化；无法被阻挡" — no attack line,
 *     unlike the armed forms — and the linked PRTS 幽灵 天赋 "不进行普通攻击，无法被阻挡", 攻击方式 不攻击).
 * The armed forms attack through the engine's enemy attack (ai.js enemyAttack, `profile.dmgType`), so attack clips,
 * projectiles and the attack hooks are the normal ones. Before its change ends it cannot be killed at all (damage is
 * cancelled; an HP loss stops at 1 HP) — user report after 0.1.0 (#5): its model never changed (no FORMS clip set), so
 * it died on the manifest's die clip, the 寻仇者's B_Die, from its first-form look; and the v2.5 kit let damage through,
 * so some lineups killed it before either counter reached 4. fx 'phase' {id, kind: translator_fuchou | _shushi | _youling} starts the model's 2 s
 * change clip (render/units.js FORMS). Form letters: B / C / D follow the talents' order Fuchou / Youling / Shushi — C,
 * the only clip set without an attack, is the non-attacking 幽灵 (skills ChangeToB / C / D).
 */
function kitTranslator(ab, e) {
  const t = (k) => T(ab, k) ?? 0;
  const P = { phys: 0, arts: 0, form: null, done: false, anger: false };
  const PRE = { fuchou: 'Mode_Fuchou_Passive', shushi: 'Mode_Shushi_Passive', youling: 'Mode_Youling_Passive' };
  const mods = (pre) => ({
    hpFlat: t(`${pre}.max_hp`), atkFlat: t(`${pre}.atk`), defFlat: t(`${pre}.def`), resFlat: t(`${pre}.magic_resistance`),
    moveMul: Math.max(0, 1 + t(`${pre}.move_speed`) / (e.def.moveSpeed || 1)), batPct: t(`${pre}.base_attack_time`) / (e.base.bat || 1),
    massFlat: t(`${pre}.mass_level`),
  });
  const finish = (b, e2) => {
    if (!e2.alive || P.done) return;
    P.done = true;
    b.removeBuff(e2, 'ab:origin');
    ab.immune = null;
    b.addBuff(e2, { key: 'ab:form', persist: true, visible: true, mods: mods(PRE[P.form]), flags: P.form === 'youling' ? { unblockable: true } : null });
    if (P.form !== 'youling') {
      const melee = P.form === 'fuchou';
      Object.assign(e2.profile, { noAttack: false, melee, dmgType: melee ? 'phys' : 'arts', maxTargets: melee ? 1 : 2 });
      e2.atkCd = 0;
    }
    if (e2.route) e2.route.pts = null;
  };
  const change = (b, e2, form) => {
    if (P.form || !e2.alive) return;
    P.form = form;
    b.addBuff(e2, { key: 'ab:change', duration: TRANSLATOR_CHANGE, persist: true, flags: { noMove: true }, onExpire: ({ battle }) => finish(battle, e2) });
    setForm(b, e2, `translator_${form}`, 'phase', { dur: TRANSLATOR_CHANGE });
  };
  return [{
    spawn(b, e2) {
      b.addBuff(e2, { key: 'ab:origin', persist: true, flags: { noDisplace: true } });
      ab.immune = new Set(TRANSLATOR_IMMUNE);
    },
    hitIn(c, b, e2) {
      if (P.done) return;
      const s = c.source || c.credit, ty = c.dmg.type;
      if (!P.form && s && s.side === 'ally') {
        if (ty === 'phys' && ++P.phys >= (t('Passive.phy_max_count') || 4)) change(b, e2, 'fuchou');
        else if (ty === 'arts' && ++P.arts >= (t('Passive.magic_max_count') || 4)) change(b, e2, 'shushi');
      }
      c.dmg.cancel = true;
    },
    // an HP loss (流失 — no 伤害 instance, so not cancelled: 隐德来希's 心烛 hand-over …) cannot knock it out before its
    // change ends: its original form has no death clip of its own (A_Die_B / _C / _D are the changes) [ASSUMED floor 1 HP]
    killed(c, b, e2) {
      if (P.done) return false;
      e2.hp = Math.max(1, e2.hp);
      return true;
    },
    blocked(c, b, e2) { change(b, e2, 'youling'); },
    tick(b, e2) {
      // 寻仇者: "生命值低于50%时，攻击力+100%"
      if (P.form !== 'fuchou' || !P.done) return;
      const on = e2.hpRatio < 0.5;
      if (on === P.anger) return;
      P.anger = on;
      if (on) b.addBuff(e2, { key: 'ab:anger', persist: true, visible: true, mods: { atkPct: t('Mode_Fuchou_Anger.atk') } });
      else b.removeBuff(e2, 'ab:anger');
    },
  }];
}

/** 乌顶巨角卢鲁 · 【角力对决】 when blocked: charges `duration` s (no normal attacks; a stun or 失衡 interrupts), then hits its
 *  blocker; operators hold fixed tiles, so the push always fails ⇒ extra damage and a fail_duration stun. */
function kitElk(ab) {
  const s = ab.sk.skill;
  const P = { ch: null };
  const stop = (b, e) => { P.ch = null; b.removeBuff(e, 'ab:elkCharge'); };
  return [{
    tick(b, e) {
      const ch = P.ch;
      if (!ch) return;
      if (e.s.flags.stun || !ch.t.alive || e.blockedBy !== ch.t) { stop(b, e); b.fx('phase', { x: e.x, y: e.y, id: e.id, kind: 'chargeBroken' }); return; }
      if (b.time + 1e-9 < ch.until || unbalancedNow(b, e)) return;   // a 失衡 that did not move it holds the clash (no skill meanwhile)
      stop(b, e);
      b.fx('explode', { x: ch.t.x, y: ch.t.y, r: 0.5, kind: 'elkClash' });
      hurt(b, e, ch.t, e.s.atk * ((s && s.bb.atk_scale_s) ?? 1) * ELK_FAIL_SCALE, 'phys');
      const st = T(ab, 'data.attack@fail_duration') ?? 0;
      if (ch.t.alive && st > 0) b.applyStatus(ch.t, 'stun', { duration: st, source: e });
    },
  }, unbalanced((b, e) => { if (P.ch) stop(b, e); }),
  skill(s, (b, e) => {
    const dur = s.bb.duration ?? 0;
    P.ch = { t: e.blockedBy, until: b.time + dur };
    b.addBuff(e, { key: 'ab:elkCharge', duration: dur + 0.1, visible: true, flags: { disarm: true } });
    b.fx('telegraph', { x: e.blockedBy.x, y: e.blockedBy.y, r: 0.5, dur, kind: 'elkCharge', id: e.id });
  }, { cond: (b, e) => !P.ch && !!(e.blockedBy && e.blockedBy.alive) })];
}

// ---------------------------------------------------------------------------------------------------------------
// “不死的黑蛇” (enemy_1515_bsnake) — the Episode 08 leader's data-driven-ish kit. The numbers are the official
// level-0 values (PRTS / Terra Wiki); the mode's enemyScale still applies to the stats. The two helpers below are
// generic enough for another burning/phase boss, but this first version keeps the constants local to the kit.

const BS_BREATH = 'burningBreath';
const BS_DOWN = 'bsnake:down';
const BS_ENRAGED = 'bsnake:enraged';
const BS_INFERNO = 'bsnake:inferno';
const BS_RETURN = 'bsnake:return';
const BS_AGGREGATE = 'bsnake:aggregate';
const BS_BREATH_TIME = 30.5, BS_BREATH_START = 50, BS_BREATH_END = 230;
const BS_IGNITE_CD = 19, BS_DETONATE_CD = 35, BS_INFERNO_WAVES = 10, BS_INFERNO_INTERVAL = 2;
const BS_INFERNO_TIME = 28, BS_AGGREGATE_TIME = 25, BS_AGGREGATE_DAMAGE = 1000;
/** projectile_enemy_bsnake `_speed` (official projectile prefab). */
const BS_FIREBALL_SPEED = 2.5;

/** Official compiled effects of the local black-snake plugin (assets/fx), namespaced by PluginFxPlayer. */
const BS_FX = (key) => `plugin:black-snake:${key}`;
function bsFx(b, key, x, y, extra = {}) {
  b.fx?.('plugin', { skill: BS_FX(key), x, y, ...extra });
}

/** Apply/refresh 烈焚灼息 on an ally through the catalogue status (resist, visibility and statusApplied included). */
function bsBreath(b, boss, u, fx = true) {
  if (!u || !u.alive || u.side !== 'ally') return;
  const applied = b.applyStatus(u, BS_BREATH, {
    duration: BS_BREATH_TIME, source: boss, refresh: 'replace',
    data: { maxDuration: BS_BREATH_TIME, start: BS_BREATH_START, end: BS_BREATH_END },
  });
  if (applied && fx) bsFx(b, 'enemy_bsnake_buff_03_start_a', u.x, u.y, { dur: 1 });
}

/** The two direct fire-phase helpers are kept here rather than in the core: the boss owns their lifecycle. */
function bsInfernoWave(b, boss, a) {
  if (!a.inferno || !boss.alive) return;
  const rows = [...new Set(b.allies().filter((u) => u && u.alive && !u.hidden && !u.s.flags.untargetable)
    .map((u) => Math.round(u.y)))];
  for (const row of rows) {
    // A wave is one fireball per occupied lane, fired from the enemy side and homing on the FIRST operator it meets.
    // The projectile itself supplies the flight (and the renderer's trail / impact); damage lands only on its hit.
    const hit = b.allies().filter((u) => u && u.alive && !u.hidden && !u.s.flags.untargetable && Math.round(u.y) === row)
      .sort((u, v) => v.x - u.x)[0];
    if (!hit) continue;
    const from = { x: b.rect.c1 + 0.5, y: row };
    const dur = Math.max(0.05, hypot(hit.x - from.x, hit.y - from.y) / BS_FIREBALL_SPEED);
    b.fx('pluginProjectile', {
      x: from.x, y: from.y, tx: hit.x, ty: hit.y, dur,
      skill: BS_FX('enemy_bsnake_reborn_01_trail'),
      hitSkill: BS_FX('enemy_bsnake_reborn_01_trail_hit_01'),
    });
    b.addProjectile({
      from, target: hit, speed: BS_FIREBALL_SPEED, visual: 'enemy', source: boss,
      hitDead: true, maxAge: 3,
      onHit: ({ target }) => {
        if (!a.inferno || !target || !target.alive) return;
        b.dealDamage(boss, target, { amount: boss.s.atk, type: 'arts', canDodge: false, tags: ['enemyAbility', 'bsnakeInferno'] });
      },
    });
  }
}

function bsStartInferno(b, boss, a, first) {
  a.inferno = true;
  a.wave = 0;
  if (first) b.fx('bgm', { key: 'boss:boss_x_black_snake_bsnake_hard' });
  b.fx('phase', { x: boss.x, y: boss.y, id: boss.id, kind: first ? 'bsnakeInferno' : 'bsnakeFinal', dur: 1 });
  bsFx(b, 'enemy_bsnake_buff_03_start_b', boss.x, boss.y, { dur: 2 });
  // The official trail is looping; its source prefab is now accepted (FxUVTweener is cosmetic).
  bsFx(b, 'enemy_bsnake_skill_03_trail', boss.x, boss.y, { loop: true, dur: BS_INFERNO_TIME });
  b.addBuff(boss, {
    key: BS_INFERNO, duration: BS_INFERNO_TIME, persist: true, visible: true,
    flags: { invulnerable: true, untargetable: true, unblockable: true, noMove: true, stun: true },
    onExpire: ({ battle }) => {
      a.inferno = false;
      a.waveTimer?.cancel?.();
      battle.removeBuff(boss, BS_INFERNO);
      boss.profile.noAttack = a.noAtk;
      if (!boss.alive) return;
      if (first) {
        battle.addBuff(boss, { key: BS_RETURN, duration: 15, visible: true, flags: { invulnerable: true } });
        battle.fx('phase', { x: boss.x, y: boss.y, id: boss.id, kind: 'bsnakeReturn' });
        bsFx(battle, 'enemy_bsnake_reborn_01_end', boss.x, boss.y, { dur: 2 });
      } else {
        bsFx(battle, 'enemy_bsnake_die_01_end', boss.x, boss.y, { dur: 2 });
        battle.kill(boss, null);
      }
    },
  });
  boss.profile.noAttack = true;
  a.waveTimer = b.every(BS_INFERNO_INTERVAL, () => {
    if (!a.inferno) return;
    bsInfernoWave(b, boss, a);
    if (++a.wave >= BS_INFERNO_WAVES) a.waveTimer?.cancel?.();
  }, { owner: boss });
}

function kitBlackSnake() {
  return [{
    spawn(b, e, a) {
      a.deaths = 0;
      a.noAtk = e.profile.noAttack;
      a.inferno = false;
      a.phase = 1;
      b.every(BS_IGNITE_CD, () => {
        if (a.busy || a.inferno || !e.alive) return;
        const targets = b.allies().filter((u) => u && u.alive && !u.hidden && !u.findBuff?.(BS_BREATH)).slice(0, 2);
        if (targets.length) bsFx(b, 'enemy_bsnake_skill_01_start', e.x, e.y, { dur: 1 });
        for (const u of targets) {
          bsBreath(b, e, u);
          bsFx(b, 'enemy_bsnake_skill_01_hit', u.x, u.y, { dur: 1 });
        }
      }, { owner: e });
      b.every(BS_DETONATE_CD, () => {
        if (a.busy || a.inferno || !e.alive) return;
        const afflicted = b.allies().filter((v) => v && v.alive && v.findBuff?.(BS_BREATH));
        if (afflicted.length) {
          bsFx(b, a.deaths > 0 ? 'enemy_bsnake_skill_02_start_04_reborn' : 'enemy_bsnake_skill_02_start_02',
            e.x, e.y, { dur: 1 });
        }
        for (const u of afflicted) {
          b.dealDamage(e, u, { amount: e.s.atk, type: 'arts', isSkill: true, tags: ['enemyAbility', 'bsnakeDetonate'] });
          bsFx(b, 'enemy_bsnake_skill_02_range', u.x, u.y, { dur: 1 });
          bsFx(b, 'enemy_bsnake_skill_02_hit', u.x, u.y, { dur: 1 });
          b.removeBuff(u, BS_BREATH);
          // 引爆 consumes the mark on the target and re-applies it to the target plus its four neighbours.
          bsBreath(b, e, u);
          for (const v of areaAlliesInTiles(b, e, u.tileR, u.tileC, 'plus', 1)) if (v !== u) bsBreath(b, e, v);
          b.fx('explode', { x: u.x, y: u.y, r: 1, kind: 'bsnakeDetonate' });
        }
      }, { owner: e });
      b.every(75, () => {
        if (a.busy || a.phase < 2 || a.inferno || !e.alive) return;
        spawnChildren(b, e, 'enemy_x_black_snake_aggregate', 1, { pos: [e.y, e.x + 1], tag: 'bsnakeAdd' });
      }, { owner: e });
    },
    attack(c, b, e) {
      for (const u of c.targets || []) {
        bsBreath(b, e, u);
        bsFx(b, 'enemy_bsnake_attack_01_hit', u.x, u.y, { dur: 1 });
      }
    },
    hitIn(c) {
      // A unit under 烈焚灼息 deals only half damage to the Black Snake.
      if (c.source?.findBuff?.(BS_BREATH)) c.dmg.mul *= 0.5;
    },
    killed(c, b, e, a) {
      if (a.inferno || a.busy) return true;
      if (a.deaths >= 2) return false;
      a.deaths++;
      a.busy = true;
      a.inferno = false;
      e.hp = Math.max(1, e.s.maxHp * 0.01);
      e.profile.noAttack = true;
      b.addBuff(e, {
        key: BS_DOWN, duration: 5, persist: true, visible: true,
        flags: { invulnerable: true, untargetable: true, unblockable: true, noMove: true, stun: true },
        onExpire: ({ battle }) => {
          a.busy = false;
          if (!e.alive) return;
          if (a.deaths === 1) {
            a.phase = 2;
            battle.addBuff(e, { key: BS_ENRAGED, persist: true, visible: true, mods: { hpPct: 0.5, atkPct: 0.5 } });
            e.hp = e.s.maxHp;
            bsFx(battle, 'enemy_bsnake_buff_04_start_reborn', e.x, e.y, { dur: 2 });
            bsFx(battle, 'enemy_bsnake_reborn_01_start', e.x, e.y, { dur: 2 });
            bsStartInferno(battle, e, a, true);
          } else {
            bsStartInferno(battle, e, a, false);
          }
        },
      });
      b.fx('phase', { x: e.x, y: e.y, id: e.id, kind: 'bsnakeDown', dur: 5 });
      bsFx(b, 'enemy_bsnake_buff_03_start_a', e.x, e.y, { dur: 5 });
      bsFx(b, 'enemy_bsnake_die_01_start', e.x, e.y, { dur: 5 });
      bsFx(b, 'enemy_bsnake_reborn_01_buff', e.x, e.y, { dur: 5 });
      return true;
    },
  }];
}

function kitEnergyAggregate() {
  const explode = (b, e, a) => {
    if (a.done) return;
    a.done = true;
    b.removeBuff(e, BS_AGGREGATE);
    b.fx('explode', { x: e.x, y: e.y, r: 1.5, kind: 'bsnakeAggregate' });
    bsFx(b, 'map_fire_crystal_die_01_start', e.x, e.y, { dur: 1 });
    bsFx(b, 'enemy_bsnake_skill_02_hit_02', e.x, e.y, { dur: 1 });
    const allies = b.allies().filter((u) => u && u.alive && !u.hidden && !u.s.flags.untargetable);
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      // 能量聚合体: four directional fireballs, each hitting the first operator on that ray.
      const target = allies.filter((u) => {
        const dx = u.x - e.x, dy = u.y - e.y;
        return dc ? Math.abs(dy) < 0.6 && dx * dc > 0 : Math.abs(dx) < 0.6 && dy * dr > 0;
      }).sort((u, v) => hypot(u.x - e.x, u.y - e.y) - hypot(v.x - e.x, v.y - e.y))[0];
      if (!target) continue;
      const dur = Math.max(0.05, hypot(target.x - e.x, target.y - e.y) / 10);
      b.fx('pluginProjectile', {
        x: e.x, y: e.y, tx: target.x, ty: target.y, dur,
        skill: BS_FX('enemy_bsnake_reborn_01_trail'),
        hitSkill: BS_FX('enemy_bsnake_reborn_01_trail_hit_01'),
      });
      b.addProjectile({
        from: e, target, speed: 10, visual: 'enemy', source: e, hitDead: true, maxAge: 3,
        onHit: ({ target: hit }) => {
          if (!hit || !hit.alive) return;
          b.dealDamage(e, hit, { amount: BS_AGGREGATE_DAMAGE, type: 'arts', isSkill: true, tags: ['enemyAbility', 'bsnakeAggregate'] });
          bsBreath(b, e, hit);
        },
      });
    }
    b.kill(e, null);
  };
  return [{
    spawn(b, e, a) {
      a.done = false;
      // Hand-made crystal body: the official trap has no Spine, so the plugin draws a small original 4-frame crystal;
      // the official birth / death effects still play around it.
      bsFx(b, 'aggregate_crystal', e.x, e.y, { loop: true, dur: BS_AGGREGATE_TIME });
      bsFx(b, 'map_fire_crystal_birth_01_start', e.x, e.y, { dur: 1 });
      b.addBuff(e, {
        key: BS_AGGREGATE, duration: BS_AGGREGATE_TIME, persist: true, visible: true,
        onExpire: ({ battle }) => explode(battle, e, a),
      });
    },
    death(c, b, e, a) {
      // The official 能量结晶 is a timed self-destruct; a unit killed before 25 s leaves no blast.
      a.done = true;
      b.removeBuff(e, BS_AGGREGATE);
    },
  }];
}

// ---------------------------------------------------------------------------------------------------------------
// Kits for plugin-defined enemies. These ids are deliberately outside `data/enemies.json`, so they must not
// appear in the core KITS/STATS_ONLY coverage map; content.js looks them up before the base `effectRef` kit.
// The first pair is the fork's original Episode 08 boss and its summoned add.

export const PLUGIN_KITS = Object.freeze({
  enemy_x_black_snake_bsnake: kitBlackSnake,           // “不死的黑蛇” · 烈焚灼息 / 引爆 / 狂暴 / 不息恶火
  enemy_x_black_snake_aggregate: kitEnergyAggregate,   // 能量聚合体 · 25 s 自爆，四方向火球
  // H8-4 escorts: their official data uses only stats / normal attacks; an empty kit prevents the base record's kit
  // (the data records inherit from enemy_1500_skulsr only to reuse fields the plugin does not override).
  enemy_x_black_snake_uoffcr: () => [],
  enemy_x_black_snake_uterer: () => [],
  enemy_x_black_snake_uamord: () => [],
  // H8-4 civilian: killed by an enemy costs one team LP; a player kill is just a kill.
  enemy_x_black_snake_upeopl: () => [{
    death(c, b, e) {
      if (c?.killer?.side === 'enemy') b.emit('lpLoss', { amount: 1, enemy: e, source: c.killer });
    },
  }],
});

// ---------------------------------------------------------------------------------------------------------------
// this family's part of KITS (content/enemies.js spreads the parts in this order)

export const LEADER_KITS = Object.freeze({
  // --- bounty (悬赏) leaders with a single form (kitLeaderMisc)
  enemy_1050_lslime: (ab, e) => kitLeaderMisc('enemy_1050_lslime', ab, e),   // “庞贝” · 4 targets, burning DoT, self-blast when blocked, ASPD up below half
  enemy_1500_skulsr: (ab, e) => kitLeaderMisc('enemy_1500_skulsr', ab, e),   // 碎骨 · unblocked grenades (splash + DEF down); ATK up below half
  enemy_1502_crowns: (ab, e) => kitLeaderMisc('enemy_1502_crowns', ab, e),   // 弑君者 · blinks past its blocker
  enemy_1504_cqbw: (ab, e) => kitLeaderMisc('enemy_1504_cqbw', ab, e),       // W · C4 (2 below half)
  enemy_1509_mousek: (ab, e) => kitLeaderMisc('enemy_1509_mousek', ab, e),   // 鼠王 · opening barrier with DEF up; enrage below half
  enemy_1511_mdrock: (ab, e) => kitLeaderMisc('enemy_1511_mdrock', ab, e),   // 泥岩 · stacking ATK, refreshed barrier (+HP/ASPD while up)
  enemy_1513_dekght: (ab, e) => kitLeaderMisc('enemy_1513_dekght', ab, e),   // 腐败骑士 · plus-shaped hits; rage when 凋零骑士 dies
  enemy_1513_dekght_2: (ab, e) => kitLeaderMisc('enemy_1513_dekght_2', ab, e), // 凋零骑士 · 2 targets; rage when 腐败骑士 dies
  enemy_1539_reid: (ab, e) => kitLeaderMisc('enemy_1539_reid', ab, e),       // “复仇者” · ATK up below half; revives once at 50 %
  enemy_2003_rockman: (ab, e) => kitLeaderMisc('enemy_2003_rockman', ab, e), // 迷路的巨像 · long-stun boulder on a non-stunned unit
  enemy_2004_balloon: (ab, e) => kitLeaderMisc('enemy_2004_balloon', ab, e), // 喷气人 · takes off when blocked: 7 s hovering, unblockable, 失衡免疫
  enemy_2005_axetro: (ab, e) => kitLeaderMisc('enemy_2005_axetro', ab, e),   // “遗弃者” · attack stacks, reset after 4 s idle
  enemy_2008_flking: (ab, e) => kitLeaderMisc('enemy_2008_flking', ab, e),   // “墓碑” · operators' ATK/DEF halved; periodic barrier
  enemy_2048_smgrd: (ab, e) => kitLeaderMisc('enemy_2048_smgrd', ab, e),     // “邪魔的利刃” · 国度 ASPD-down around it, ×2.5 inside
  enemy_2050_smsha: (ab, e) => kitLeaderMisc('enemy_2050_smsha', ab, e),     // 陷落雪祀 · cold + 3-target chain
  enemy_2052_smgia: (ab, e) => kitLeaderMisc('enemy_2052_smgia', ab, e),     // 纠缠藤蔓 · every 3rd attack stuns 15 s; fragile after terrain damage

  // --- multi-form leaders and other bounty (悬赏) targets
  enemy_1512_mcmstr: kitUglyThing,                                   // “巨大的丑东西” · melee ×3; KO ⇒ stun blast, fleeing 大祭司 (true HP loss/s)
  enemy_1516_jakill: kitWarden,                                      // 杰斯顿·威廉姆斯 · ranged arts + multi-stun ⇒ killer form (frees prisoners, armour piercing)
  enemy_1517_xi: kitXi,                                              // “自在” · cross arts, 破桎而出 barrier blast ⇒ form 2 (double hits, 2 crosses)
  enemy_1525_blkswb: kitMace,                                        // 锏 · 抵抗, DEF pen, 速杀 blink, AoE ⇒ form 2 (stealth, double hits, SP clear)
  enemy_1535_wlfmster: kitWolfLord,                                  // 扎罗 · −30 % damage, 溶血骇惧 ⇒ 远古威慑 rebirth ⇒ ranged double hits
  enemy_10081_mpplai: kitTranslator,                                 // 转译基底·α · damage cancelled; 4th phys / 4th arts hit or blocked ⇒ 2 s change ⇒ 寻仇者 / 特战术师 / 幽灵
  enemy_10144_xdelk_2: kitElk,                                       // 乌顶巨角卢鲁 · 角力对决 charge on its blocker (push fails ⇒ damage + stun)
  // 圆仔 · PRTS 天赋 "无法攻击/被阻挡；受到来源于正面的物理和法术伤害-80%；自身始终朝向我方干员数量最多的方向" (no attack: applyWay
  // NONE; its 倒走 / 【炫耀】 is "仅用于演出，无额外效果"): unblockable, faces the bigger crowd, front damage −80 %
  enemy_2085_skzjxd: (ab) => [unblockable(), frontGuard(T(ab, 'Weakness.damage_resistance') ?? 0, faceCrowd)],
  enemy_2085_skzjxd_2: (ab) => [unblockable(), frontGuard(T(ab, 'Weakness.damage_resistance') ?? 0, faceCrowd)], // (鸭爵 strategy) same
  // 失衡 (pushed / pulled by operators)
  enemy_1328_cbjedi: (ab) => {                                       // 弧光锋卫 · bleeds while in its 失衡 state
    // PRTS 修正 "失衡移动时持续受到真实伤害", 天赋 "处于失衡状态时，每0.066s受到400点无来源真实持续伤害" (data unbalanced_bleed.damage /
    // .interval; 伤害分类: 弧光锋卫失衡状态下的自残伤害 is BUFF damage): damage, not a 流失 (player report D1 audit) — every `interval`
    // s for as long as the state lasts (battle/displacement.js _unbalance: a push's 位移时间, a pull's force window even
    // after the 急停 or with no movement). Until 0.2.2 one hit in proportion to the tiles moved [ASSUMED], from the position jump.
    const v = T(ab, 'unbalanced_bleed.damage') ?? 0, iv = T(ab, 'unbalanced_bleed.interval') ?? 0;
    return [{
      tick(b, e, a, dt) {
        if (!(v > 0 && iv > 0) || !unbalancedNow(b, e)) { a.bleed = 0; return; }
        a.bleed = (a.bleed ?? 0) + dt;
        while (a.bleed >= iv - 1e-9 && e.alive) {
          a.bleed -= iv;
          b.dealDamage(null, e, { ...periodicDamage(v), tags: ['dot', 'periodic', 'unbalanced'] });
        }
      },
    }];
  },
  enemy_10112_ymgds: (ab) => [unbalanced((b, e) => {                 // 冒失的小弟 · stunned after being unbalanced
    const st = T(ab, 'StunAfterUnbalance.stun') ?? 0;
    if (st > 0) b.applyStatus(e, 'stun', { duration: st, source: null });
  })],
  enemy_10138_xdsnow: (ab) => [unbalanced((b, e, a) => {             // 雪孩子 · pushed / pulled into high ground ⇒ hitWall.value damage
    const dx = e.x - a.lx, dy = e.y - a.ly, d = hypot(dx, dy);
    if (!(d > 0)) return;
    const r = Math.round(e.y + (dy / d) * 0.6), c = Math.round(e.x + (dx / d) * 0.6);
    if (b.grid.isLow(r, c) && b.grid.groundPassable(r, c)) return;   // stopped by nothing: no collision
    b.fx('explode', { x: e.x, y: e.y, r: 0.4, kind: 'wallHit', id: e.id });
    hurt(b, null, e, T(ab, 'hitWall.value') ?? 0, 'true', { tags: ['wallHit'] });
  })],
  // 拥霜羽兽 · PRTS 天赋 "不会攻击飞行单位"; unbalanced once ⇒ 失去蛋的模式 "不进行普通攻击，不可阻挡，移动速度最终提升至200%" (until
  // 0.1.3 it kept its ranged attack without the egg and stood for each attack clip — ai.js attackStand —, and shot the 炎佑 dragon)
  enemy_10141_xdpeng_2: (ab) => [noAirTargets(), unbalanced((b, e, a) => {
    if (a.done) return;
    a.done = true;
    e.profile.noAttack = true;
    b.addBuff(e, { key: 'ab:noEgg', persist: true, visible: true, flags: { unblockable: true }, mods: { moveMul: 1 + (T(ab, 'speed.move_speed') ?? 0) } });
  })],
});
