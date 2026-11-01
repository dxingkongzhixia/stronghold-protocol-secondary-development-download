// server/sim/content/kits/ops/chess_char_122_beagle-beagle.js — 米格鲁 (char_122_beagle) kit, tier 2 (custom:
// tools/build-data.mjs CUSTOM_CHESS, the bolivar roster). 3★ 铁卫: 防御提升 talent +10 % DEF, one MANUAL skill
// 防御力强化·α型 +30 % DEF for its data duration (TAKE_DAMAGE trigger from data). Kit contract: ../README.md.
import { num, talentBb, statBuff } from '../shared/tier1.js';

const S = 'skcom_def_up[1]';

export default {
  chess_char_122_beagle_a: (bb, chess) => ({
    skill: { kind: 'duration', mods: { defPct: num(bb.def) }, onStart({ battle, unit }) { battle.fx('shield', { x: unit.x, y: unit.y, id: unit.id }); } },
    skills: { [S]: { kind: 'duration', mods: { defPct: num(bb.def) }, onStart({ battle, unit }) { battle.fx('shield', { x: unit.x, y: unit.y, id: unit.id }); } } },
    talents: [{
      install(battle, unit) {
        statBuff(battle, unit, 'talent:beagle', { defPct: num(talentBb(chess, 0).def) });
      },
    }],
  }),
};
