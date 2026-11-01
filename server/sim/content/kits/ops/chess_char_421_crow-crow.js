// server/sim/content/kits/ops/chess_char_421_crow-crow.js — 羽毛笔 (char_421_crow) kit, tier 4 (custom:
// tools/build-data.mjs CUSTOM_CHESS, the bolivar roster). 5★ 收割者: the branch's AoE attack / no-heal / self-heal cap
// lives in professions.js (installReaperHeal); this kit adds
//   渐入佳境 — +3 ASPD per kill, up to 12 stacks;
//   高速切割 S1 — next attack ×1.2, two consecutive hits;
//   收割 S2 — +40 % ATK, shorter interval (base_attack_time -0.35) for 23 s, +30 % ATK against targets below 50 % HP.
// Kit contract: ../README.md.
import { num, talentBb, skillBbOf, batMod, onHitOn, isMainHit } from '../shared/tier1.js';

const S1 = 'skchr_crow_1';
const S2 = 'skchr_crow_2';

export default {
  chess_char_421_crow_a: (bb, chess) => {
    const t = talentBb(chess, 0);
    const s2 = skillBbOf(chess, S2);
    const per = num(t.attack_speed, 3);
    const max = num(t.max_stack_cnt, 12);
    const extra = num(s2['crow_s_2[atk].atk'], 0.3);
    return {
      skill: { kind: 'instant', attack: { atkScale: num(skillBbOf(chess, S1).atk_scale, 1.2), hits: 2 } },
      skills: {
        [S1]: { kind: 'instant', attack: { atkScale: num(skillBbOf(chess, S1).atk_scale, 1.2), hits: 2 } },
        [S2]: {
          kind: 'duration',
          mods: { atkPct: num(s2.atk), batPct: batMod(num(s2.base_attack_time), chess) },
        },
      },
      talents: [{
        install(battle, unit) {
          let stacks = 0;
          const add = () => battle.addBuff(unit, { key: 'talent:crow', mods: { aspd: per * stacks }, persist: true, allowDead: true, tags: ['talent'] });
          battle.on('kill', (ctx) => {
            if (ctx.killer !== unit || stacks >= max) return;
            stacks++;
            battle.fx('buff', { x: unit.x, y: unit.y, id: unit.id });
            battle.removeBuff(unit, 'talent:crow');
            add();
          }, { owner: unit });
          // 收割: below hp_ratio HP the attack deals its ×(1 + 0.3) damage (the skill's own atk_scale is the base).
          onHitOn(battle, unit, ({ target, dmg }) => {
            if (!isMainHit(dmg) || unit.skill?.id !== S2 || !unit.skill.active) return;
            if (target?.hpRatio != null && target.hpRatio < num(s2.hp_ratio, 0.5)) dmg.amount *= 1 + extra;
          });
        },
      }],
    };
  },
};
