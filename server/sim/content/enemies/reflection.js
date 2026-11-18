// server/sim/content/enemies/reflection.js — REFLECTION 折射 kits (深池 enemies, 守墓石像) and their part of KITS (split from
// content/enemies.js).

import { T, auraAllies, auraBuff } from './helpers.js';
import { refraction, statue, kitRefraction } from './archetypes.js';
import { hypot } from '../../detmath.js';

// ---------------------------------------------------------------------------------------------------------------
// kits

function kitPhalanx(ab, e) {
  const def = T(ab, 'auraDefup.def') ?? 0;
  const r = (e.def.raw && e.def.raw.stats && e.def.raw.stats.rawRangeRadius) || 1.5;
  return [...kitRefraction(ab), {
    iv: 0.5,
    tick(b, e2) {
      let n = 0;
      for (const o of b.enemiesInRadius(e2.x, e2.y, r)) if (o !== e2 && o.defId === e2.defId) n++;
      if (n > 0) auraBuff(b, e2, 'ab:phalanx', 0.5, { defFlat: def * n });
    },
  }];
}

function kitHolyGuard(ab) {
  const r = T(ab, 'traitAbility.range_radius') ?? 1.1, aspd = T(ab, 'traitAbility.attack_speed') ?? 0;
  return [...kitRefraction(ab), {
    iv: 0.5,
    tick(b, e) {
      const on = b.enemiesInRadius(e.x, e.y, r).some((o) => /enemy_1175_dushdo/.test(o.defId));
      if (!on) return;
      // a buff aura (auraAllies): no 隐匿 operator, the blocker included (PRTS 作战机制 §隐匿与Buff的关系 — no 无视 note on
      // its page), but an airborne 起飞 one still [ASSUMED, as §21.22's ground-enemy auras]
      for (const u of auraAllies(b, e, e.x, e.y, r)) auraBuff(b, u, 'ab:forceField', 0.5, { aspd }, null, true);
    },
  }];
}

/**
 * 假想敌：镜波 (enemy_9031_acrefd): 折射; 被击倒时向半径 1.2 内法抗最低的一名干员发射弹道，使其法抗 +10（可无限叠加，
 * 持续时间无限）— PRTS 假想敌：镜波.
 */
function kitAcRefd(ab, e) {
  const r = T(ab, 'refracting.range_radius') ?? 1.2;
  const gain = T(ab, 'refracting.acrefd[magic-resistance].magic_resistance') ?? 10;
  return [...kitRefraction(ab), {
    spawn(b) {
      b.on('death', (c) => {
        if (c.unit !== e) return;
        const near = b.allies().filter((u) => u.alive && hypot(u.x - e.x, u.y - e.y) <= r);
        if (!near.length) return;
        const t = near.sort((x, y) => (x.s.res - y.s.res) || (hypot(x.x - e.x, x.y - e.y) - hypot(y.x - e.x, y.y - e.y)))[0];
        b.addBuff(t, { key: `reg:acrefd:${e.id}`, persist: true, visible: true, source: e, mods: { resFlat: gain } });
        b.fx('beam', { x: t.x, y: t.y, id: e.id, kind: 'acrefd' });
      }, { owner: e });
    },
  }];
}

/**
 * 假想敌：镜眼 (enemy_9039_acrefm): 折射; 拥有折射时受到法术伤害，使伤害来源攻击速度 -50，持续 3 秒 — PRTS 假想敌：镜眼.
 */
function kitAcRefm(ab, e) {
  const aspd = T(ab, 'refracting.attack_speed') ?? -50;
  const dur = T(ab, 'refracting.duration') ?? 3;
  return [...kitRefraction(ab), {
    taken(c, b) {
      if (!c.dmg || c.dmg.type !== 'arts' || !c.source) return;
      b.addBuff(c.source, { key: `reg:acrefm:${e.id}`, duration: dur, refresh: 'replace', visible: true, source: e, mods: { aspd } });
    },
  }];
}

// ---------------------------------------------------------------------------------------------------------------
// this family's part of KITS (content/enemies.js spreads the parts in this order)

export const REFLECTION_KITS = Object.freeze({
  // --- REFLECTION 折射
  enemy_1165_duhond: kitRefraction,                                  // 深池侦察犬 · refraction
  enemy_1165_duhond_2: kitRefraction,                                // 深池侦察犬pro · refraction
  enemy_1166_dusbr: kitRefraction,                                   // 深池侦察兵 · refraction
  enemy_1166_dusbr_2: kitRefraction,                                 // 深池侦察队长 · refraction
  enemy_1168_dumage: kitRefraction,                                  // 深池暗影术师 · refraction
  enemy_1168_dumage_2: kitRefraction,                                // 深池暗影术师队长 · refraction
  enemy_1170_dushld: kitRefraction,                                  // 深池重甲卫士 · refraction
  enemy_1170_dushld_2: kitRefraction,                                // 深池重甲卫士队长 · refraction
  enemy_1169_duphlx: kitPhalanx,                                     // 深池方阵步兵 · refraction + DEF +200 per nearby same unit
  enemy_1169_duphlx_2: kitPhalanx,                                   // 深池方阵指挥官 · same
  enemy_1172_dugago: (ab) => [...kitRefraction(ab), statue(ab)],     // 守墓石像 · refraction; melee when blocked; 1st KO → unblockable statue 10 s → arts flyer
  enemy_1172_dugago_2: (ab) => [...kitRefraction(ab), statue(ab)],   // 愤怒的守墓石像 · same
  enemy_1174_duholy: kitHolyGuard,                                   // 深池伙友卫队 · refraction; ASPD-down field next to 影刃 (taunt from data)
  enemy_1174_duholy_2: kitHolyGuard,                                 // 深池伙友卫队精英 · same
  enemy_9011_acrefr: (ab) => [refraction(T(ab, 'Refracting.magic_resistance') ?? 0, T(ab, 'Refracting.max_hp') ?? 0)], // 假想敌：镜膜 · refraction + max HP until first silence
  enemy_9031_acrefd: kitAcRefd,                                       // 假想敌：镜波 · refraction; 死亡时法抗最低的干员 RES +10 (stackable)
  enemy_9039_acrefm: kitAcRefm,                                       // 假想敌：镜眼 · refraction; 受到法术伤害时攻击者 ASPD -50 持续 3 秒
});
