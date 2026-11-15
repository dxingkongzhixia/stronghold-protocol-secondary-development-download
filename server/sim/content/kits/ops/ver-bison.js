// server/sim/content/kits/ops/ver-bison.js — 拜松 (char_325_bison), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). The DEF skill is a plain def boost; S2 raises his own DEF by self.def, adds
// taunt_level, and gives the allies on the 8 surrounding tiles ally.def while it runs.
import { cheb, num, skillBbOf } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S2 = 'skchr_bison_2';

function bison(_bb, chess, def) {
  const { skills, skill, sid } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      mods: { defPct: num(sbb['bison_s_2[self].def']), taunt: num(sbb['bison_s_2[self].taunt_level']) },
    };
    return { kind: 'duration', duration: rec?.duration, mods: { defPct: num(sbb.def) } };
  });
  const allyDef = num(skillBbOf(chess, S2)['bison_s_2[ally].def']);
  return {
    skills, skill,
    install(battle, unit) {
      if (sid !== S2 || !(allyDef > 0)) return;
      battle.on('tick', () => {
        if (!unit.alive || !unit.skill?.active || unit.skill.id !== S2) return;
        for (const a of battle.allyUnits) {
          if (a === unit || !a.alive || a.side !== 'ally' || cheb(unit, a) > 1) continue;
          battle.addBuff(a, { key: `bison:guard:${unit.id}`, duration: 0.3, refresh: 'replace', source: unit, visible: true, mods: { defPct: allyDef } });
        }
      }, { owner: unit });
    },
  };
}

export default { char_325_bison: bison };
