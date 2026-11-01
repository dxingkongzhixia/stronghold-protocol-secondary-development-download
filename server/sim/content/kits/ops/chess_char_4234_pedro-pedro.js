// server/sim/content/kits/ops/chess_char_4234_pedro-pedro.js — 佩德洛 (char_4234_pedro) kit, tier 3 (custom:
// tools/build-data.mjs CUSTOM_CHESS, the bolivar roster). 5★ 支援射手: 掩护战术 (+12 % ATK while at least 2 other
// operators stand in range), plus the two 触发型效果 skills:
//   标记射击 S1 — next attack ×1.1 on up to 2 targets; each marked target that then takes Arts damage takes one extra
//     1.5 × ATK Arts hit (no stacking, a new mark is only taken by a target that has none).
//   交替撤离 S2 — mark up to 3 operators in range (no stacking); a marked operator that drops below 50 % HP is healed
//     for 1.5 × ATK once and gains 8 s of 挑衅 -1 (the PRTS "不容易受到攻击").
// Kit contract: ../README.md.
import { num, talentBb, skillBbOf, toggleBuff } from '../shared/tier1.js';
import { TRIGGER_MARK as MARK, placeTrigger } from '../shared/triggerEffect.js';

const S1 = 'skchr_pedro_1';
const S2 = 'skchr_pedro_2';
const GUARD = 'pedro:guard';

export default {
  chess_char_4234_pedro_a: (bb, chess) => {
    const t = talentBb(chess, 0);
    const s1 = skillBbOf(chess, S1);
    const s2 = skillBbOf(chess, S2);
    return {
      skill: { kind: 'instant', attack: { atkScale: num(s1.atk_scale, 1.1), maxTargets: num(s1.max_target, 2) } },
      skills: {
        [S1]: {
          kind: 'instant',
          attack: {
            atkScale: num(s1.atk_scale, 1.1),
            maxTargets: num(s1.max_target, 2),
            onEachHit({ battle, unit, target }) {
              placeTrigger(battle, unit, target, { kind: 'pedro:s1' });
            },
          },
        },
        [S2]: {
          kind: 'instant',
          onStart({ battle, unit }) {
            const allies = battle.alliesInGrid(unit).filter((a) => a !== unit).slice(0, num(s2.max_target, 3));
            for (const a of allies) {
              if (a.findBuff(GUARD)) {
                // 已存在时改为将其触发 (official): heal at once + 8 s 挑衅 instead of re-marking.
                battle.removeBuff(a, GUARD);
                battle.heal(unit, a, unit.s.atk * num(s2.atk_scale, 1.5));
                battle.addBuff(a, { key: 'pedro:guardTaunt', duration: num(s2.duration, 8), mods: { tauntLevel: num(s2.taunt_level, -1) } });
              } else {
                battle.addBuff(a, { key: GUARD, duration: 999, source: unit, status: 'pedro_s2_mark' });
              }
            }
          },
        },
      },
      talents: [{
        install(battle, unit) {
          // 掩护战术: at least `cnt` other operators in her range → +atk.
          toggleBuff(battle, unit, 'talent:pedro',
            () => battle.alliesInGrid(unit).filter((a) => a !== unit).length >= num(t.cnt, 2),
            { atkPct: num(t.atk) });
          // The S1 mark: the next Arts damage the marked enemy takes adds one 1.5 × ATK Arts hit.
          battle.on('damaged', (ctx) => {
            const target = ctx.target;
            if (!target?.alive || ctx.type !== 'arts' || !target.findBuff(MARK)) return;
            battle.removeBuff(target, MARK);
            battle.fx('blast', { x: target.x, y: target.y, id: unit.id });
            battle.dealDamage(unit, target, { amount: unit.s.atk * num(s1.debuff_atk_scale, 1.5), type: 'arts', isSkill: true, tags: ['skill', 'pedro:trigger'] });
          }, { owner: unit });
          // The S2 trigger: a marked operator below `hp_ratio` is healed once and gains the 8 s 挑衅.
          battle.every(0.25, () => {
            for (const a of battle.alliesFor(unit)) {
              if (!a.alive || !a.findBuff(GUARD)) continue;
              if (!(a.hpRatio < num(s2.hp_ratio, 0.5))) continue;
              battle.removeBuff(a, GUARD);
              battle.fx('heal', { x: a.x, y: a.y, id: unit.id });
              battle.heal(unit, a, unit.s.atk * num(s2.atk_scale, 1.5));
              battle.addBuff(a, { key: 'pedro:guardTaunt', duration: num(s2.duration, 8), mods: { tauntLevel: num(s2.taunt_level, -1) } });
            }
          }, { owner: unit });
        },
      }],
    };
  },
};
