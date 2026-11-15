// server/sim/content/kits/ops/ver-fang2.js — 历阵锐枪芬 (char_1036_fang2), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 下次攻击 at 1.35×, two hits, +1 DP for each enemy it kills. S2 is a passive:
// ATK +85 %, DEF +25 %, block +1, and every attack hits all enemies she blocks. The redeploy-cost talent is not
// modelled (deployment cost is a prep-side rule) [ASSUMED].
import { num } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skchr_fang2_1';
const S2 = 'skchr_fang2_2';

function fang2(_bb, chess, def) {
  const { skills, skill, sid } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return { kind: 'passive', mods: { atkPct: num(sbb.atk), defPct: num(sbb.def), blockCnt: num(sbb.block_cnt) } };
    return { kind: 'instant', attack: { atkScale: num(sbb.atk_scale, 1.35), hits: 1 + Math.max(0, Math.floor(num(sbb.cnt, 1))) } };
  });
  return {
    skills, skill,
    install(battle, unit) {
      if (sid === S2) {
        battle.on('beforeAttack', (ctx) => {
          if (ctx.attacker !== unit) return;
          const list = (unit.blocking || []).filter((e) => e?.alive);
          if (list.length) ctx.targets = list;
        }, { owner: unit });
      }
      battle.on('kill', (ctx) => {
        if (ctx.killer !== unit || !unit.skill?.active || unit.skill.id !== S1) return;
        battle.addDp(unit.ownerId, 1);
      }, { owner: unit });
    },
  };
}

export default { char_1036_fang2: fang2 };
