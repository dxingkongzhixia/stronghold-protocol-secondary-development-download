// server/sim/content/kits/ops/ver-sidero.js — 铸铁 (char_333_sidero), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 heals 40 % of max HP at once; S2 ATK +atk and regenerates
// hp_recovery_per_sec_by_max_hp_ratio of max HP each second.
import { num } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S2 = 'skchr_sidero_2';

function sidero(_bb, chess, def) {
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      mods: { atkPct: num(sbb.atk), hpRegenRatio: num(sbb.hp_recovery_per_sec_by_max_hp_ratio) },
    };
    return {
      kind: 'instant',
      onStart({ battle, unit }) {
        const ratio = num(sbb.heal_scale, 0.4);
        if (ratio > 0 && unit.alive) battle.heal(unit, unit, unit.s.maxHp * ratio, { self: true, tags: ['skill'] });
      },
    };
  });
  return { skills, skill };
}

export default { char_333_sidero: sidero };
