// server/sim/content/kits/ops/chess_char_130_doberm-doberm.js — 杜宾 (char_130_doberm) kit, tier 3 (custom:
// tools/build-data.mjs CUSTOM_CHESS, the bolivar roster). 4★ 教官: the 教官 branch's unblocked-damage ×1.2 lives in
// professions.js; this kit adds talent 新人教官 (every 3★ operator on the field +11 % ATK, ×2.4 while 鞭策 runs) and
// the two skills: 强力击·β型 (next attack ×1.85) and 鞭策 (+40 % ATK for 25 s, talent_scale 2.4).
// Kit contract: ../README.md.
import { num, talentBb, skillBbOf, installAura } from '../shared/tier1.js';

const S1 = 'skchr_doberm_1';
const S2 = 'skchr_doberm_2';

export default {
  chess_char_130_doberm_a: (bb, chess) => {
    const t = talentBb(chess, 0);
    const s2 = skillBbOf(chess, S2);
    const base = num(t.atk);
    const scale = num(s2.talent_scale, 1);
    return {
      skill: { kind: 'instant', attack: { atkScale: num(skillBbOf(chess, S1).atk_scale, 1.85) } },
      skills: {
        [S1]: { kind: 'instant', attack: { atkScale: num(skillBbOf(chess, S1).atk_scale, 1.85) } },
        [S2]: { kind: 'duration', mods: { atkPct: num(s2.atk) }, onStart({ battle, unit }) { battle.fx('buff', { x: unit.x, y: unit.y, id: unit.id }); } },
      },
      talents: [{
        install(battle, unit) {
          // 在场时: every 3★ ally (self included when it is one) gets the aura; 鞭策 raises the talent's effect.
          const value = () => base * (unit.skill?.id === S2 && unit.skill.active ? scale : 1);
          installAura(battle, unit, {
            key: 'talent:doberm', select: (a) => a.def?.rarity === 3, mods: () => ({ atkPct: value() }), value: 0,
          });
        },
      }],
    };
  },
};
