// server/sim/content/kits/ops/ver-leto.js — 烈夏 (char_194_leto), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 ATK +atk and attack speed +attack_speed; S2 ATK +atk and one extra target.
// Talent: attack speed +attack_speed.
import { num, talentBb } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S2 = 'skchr_leto_2';

function leto(_bb, chess, def) {
  const t0 = talentBb(chess, 0);
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      mods: { atkPct: num(sbb.atk) },
      attack: { maxTargets: Math.max(1, Math.floor(num(sbb['attack@max_target'], 2))) },
    };
    return { kind: 'duration', duration: rec?.duration, mods: { atkPct: num(sbb.atk), aspd: num(sbb.attack_speed) } };
  });
  return {
    skills, skill,
    install(battle, unit) {
      const aspd = num(t0.attack_speed);
      if (aspd) battle.addBuff(unit, { key: 'talent:leto_as', mods: { aspd } });
    },
  };
}

export default { char_194_leto: leto };
