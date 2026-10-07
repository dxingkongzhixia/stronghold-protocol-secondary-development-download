// server/sim/content/kits/ops/chess_char_4138_narant-narant.js — 娜仁图亚 (char_4138_narant) kit, tier 3 (custom:
// tools/build-data.mjs CUSTOM_CHESS). Relocated from the pre-0.2.0 kits/tier3.js; kit contract and rules: ../README.md.

import { absoluteRangeKeys, canTargetEnemy } from '../../../targeting.js';
import { bodyDist } from '../../../body.js';
import { normalizeChess, normalizeSkill } from '../../../simdata.js';

// helpers (kit-local: not exported by ../shared/tierN.js)

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

const defOf = (chess, def) => def ?? normalizeChess(chess);

const talentBb = (d, i) => d?.talents?.[i]?.bb ?? {};

const selectedId = (chess, d) => d?.skill?.id ?? chess?.skill?.skillId ?? null;

function skillData(chess, d, bb, id) {
  if (id != null && selectedId(chess, d) === id && d?.skill) return { ...d.skill, bb: bb ?? d.skill.bb ?? {} };
  const rec = (chess?.skills ?? []).find((s) => s && s.skillId === id);
  return (rec && normalizeSkill({ skill: rec })) || { id, bb: {}, rangeGrid: null, maxCharges: 1, duration: 0, description: '' };
}

function altSkills(chess, d, bb, builders) {
  const out = {};
  for (const [id, build] of Object.entries(builders)) out[id] = build(skillData(chess, d, bb, id));
  return out;
}

const alive = (u) => !!(u && u.alive && u.deployed);

const fx = (battle, kind, u, extra = {}) => battle.fx(kind, { x: u.x, y: u.y, id: u.id, ...extra });

const gridKeys = (grid, u, ext = 0) => absoluteRangeKeys(grid || [[0, 0]], u.tileR, u.tileC, u.dir, ext);

function enemiesAround(battle, unit, x, y, r, skip = null) {
  const out = battle.foesInRadius(x, y, r).filter((e) => !(skip && skip.has(e)) && canTargetEnemy(unit, e, { canHitFly: true }));
  const d = (e) => bodyDist(e, x, y);
  return out.sort((a, b) => d(a) - d(b) || (a.spawnSeq ?? a.id) - (b.spawnSeq ?? b.id));
}

export default {
  // ---- 3_4138 娜仁图亚 · 回环射手 (custom: tools/build-data.mjs CUSTOM_CHESS) — "持有回旋投射物时才能够攻击" is the
  //      profession's boomerang (professions.js `loopshooter` + ai.js throwBoomerang: no new engine piece). 我见，我得 steals
  //      ATK/DEF on every attack (capped); 婀娜虚影 gives her a phys/arts dodge and lowers the hit rate of the enemies in the
  //      8 surrounding tiles. S1 旋刃 (toggle) 攻击距离−1 and the projectile bounces between enemies (≤`attack@times`);
  //      S2 恶魇 ×`attack@atk_scale` + 停顿 and its return trip hits what it passes (×`attack@atk_scale_comeback`);
  //      S3 吞日 (default) throws `cnt` boomerangs and, once they are all caught, hits ≤`attack@aoe.max_target` enemies of
  //      the 8 tiles for ×`atk_scale_aoe` + 停顿.
  chess_char_4138_narant_a: (bb, chess, def) => {
    const d = defOf(chess, def);
    const t0 = talentBb(d, 0), t1 = talentBb(d, 1);
    const sid = selectedId(chess, d);
    const AROUND8 = [[1, -1], [1, 0], [1, 1], [0, -1], [0, 0], [0, 1], [-1, -1], [-1, 0], [-1, 1]];
    const dodgeP = num(t1.prob, 0), hPhys = num(t1.damage_hitrate_physical, 0), hArts = num(t1.damage_hitrate_magical, 0);
    const stealAtk = num(t0['attack@steal_atk'], 0), stealAtkMax = num(t0['attack@steal_atk_max'], 0);
    const stealDef = num(t0['attack@steal_def'], 0), stealDefMax = num(t0['attack@steal_def_max'], 0);
    const sluggish = (b, u, t, sec) => { if (sec > 0 && t && t.alive) b.applyStatus(t, 'sluggish', { duration: sec, source: u }); };
    /** S1 旋刃: the projectile bounces on to the nearest other enemies (≤ `attack@times`). */
    const bounce = (s, battle, u, target) => {
      const times = Math.max(0, Math.floor(num(s.bb['attack@times'], 0)));
      const scale = num(s.bb['attack@atk_scale'], 1);
      if (!(times > 0) || !target || !alive(u)) return;
      const skip = new Set([target]);
      for (let i = 0; i < times; i++) {
        const next = enemiesAround(battle, u, target.x, target.y, 1.5, skip)[0];
        if (!next) return;
        skip.add(next);
        battle.dealDamage(u, next, { amount: u.s.atk * scale, type: 'phys', isSkill: true, tags: ['skill', 'narantBounce'] });
      }
    };
    /** S3 吞日: the moment every boomerang is back in her hands, one AoE around her. */
    const retrieveBurst = (s) => (battle, unit) => {
      const carried = Math.max(1, Math.floor(num(s.bb.cnt, 1)));
      const scale = num(s.bb.atk_scale_aoe, 0), sec = num(s.bb.sluggish, 0);
      const cap = Math.max(1, Math.floor(num(s.bb['attack@aoe.max_target'], 1)));
      let was = 0;
      battle.every(0.05, () => {
        const out = Math.floor(num(unit.trait.boomerangsOut, 0));
        const fired = was >= carried;
        was = out;
        if (!fired || out !== 0 || !alive(unit) || !(scale > 0)) return;
        const list = enemiesAround(battle, unit, unit.x, unit.y, 1.5, null).slice(0, cap);
        for (const e of list) {
          battle.dealDamage(unit, e, { amount: unit.s.atk * scale, type: 'phys', isSkill: true, tags: ['skill', 'narantAoe'] });
          sluggish(battle, unit, e, sec);
        }
        if (list.length) fx(battle, 'aoe', unit, { radius: 1.5, dmgType: 'phys' });
      }, { owner: unit });
    };
    return {
      // S3 吞日 (default): `cnt` boomerangs per attack, each ×`attack@atk_scale`
      skill: {
        kind: 'duration', duration: Math.max(1, num(d.skill?.duration, 20)),
        attack: { hits: Math.max(1, Math.floor(num(bb.cnt, 1))), atkScale: num(bb['attack@atk_scale'], 1) },
      },
      skills: altSkills(chess, d, bb, {
        // S1 旋刃 (toggle): 攻击距离−1, 弹跳 ≤`attack@times`, 每发 ×`attack@atk_scale`
        skchr_narant_1: (s) => ({
          kind: 'toggle',
          targeting: { rangeExtend: Math.round(num(s.bb.ability_range_forward_extend, 0)) },
          attack: {
            atkScale: num(s.bb['attack@atk_scale'], 1),
            onEachHit({ battle, unit: u, target }) { bounce(s, battle, u, target); },
          },
        }),
        // S2 恶魇: ×`attack@atk_scale` + 停顿 `attack@sluggish`; 返回时对穿过的敌人 ×`attack@atk_scale_comeback`
        skchr_narant_2: (s) => ({
          kind: 'duration', duration: Math.max(1, num(s.duration, 30)),
          attack: {
            atkScale: num(s.bb['attack@atk_scale'], 1),
            onEachHit({ battle, unit: u, target }) {
              sluggish(battle, u, target, num(s.bb['attack@sluggish'], 0));
              const back = num(s.bb['attack@atk_scale_comeback'], 0);
              if (!(back > 0) || !target || !target.alive || !alive(u)) return;
              for (const e of enemiesAround(battle, u, target.x, target.y, 0.8, new Set([target]))) {
                battle.dealDamage(u, e, { amount: u.s.atk * back, type: 'phys', isSkill: true, tags: ['skill', 'narantReturn'] });
              }
            },
          },
        }),
      }),
      talents: [
        // 我见，我得: every attack steals ATK / DEF up to the caps
        { install(battle, unit) {
          let atk = 0, dfn = 0;
          battle.on('attack', ({ attacker }) => {
            if (attacker !== unit || !alive(unit)) return;
            if (stealAtk > 0 && atk < stealAtkMax) {
              atk = Math.min(stealAtkMax, atk + stealAtk);
              battle.addBuff(unit, { key: 'narant:stealAtk', persist: true, allowDead: true, mods: { atkFlat: atk } });
            }
            if (stealDef > 0 && dfn < stealDefMax) {
              dfn = Math.min(stealDefMax, dfn + stealDef);
              battle.addBuff(unit, { key: 'narant:stealDef', persist: true, allowDead: true, mods: { defFlat: dfn } });
            }
          }, { owner: unit });
        } },
        // 婀娜虚影: dodge + the enemies' hit rate in the 8 surrounding tiles
        { install(battle, unit) {
          if (dodgeP > 0) battle.addBuff(unit, { key: 'narant:dodge', persist: true, allowDead: true, mods: { dodgePhys: dodgeP, dodgeArts: dodgeP } });
          if (hPhys < 0 || hArts < 0) battle.every(0.25, () => {
            if (!alive(unit)) return;
            for (const e of battle.enemiesInKeys(gridKeys(AROUND8, unit), unit, { canHitFly: true })) {
              battle.addBuff(e, { key: 'narant:mirror', duration: 0.5, refresh: 'replace', source: unit, mods: { hitRatePhys: hPhys, hitRateArts: hArts } });
            }
          }, { owner: unit });
        } },
      ],
      install(battle, unit) {
        if (sid === 'skchr_narant_3') retrieveBurst(skillData(chess, d, bb, 'skchr_narant_3'))(battle, unit);
      },
    };
  },
};
