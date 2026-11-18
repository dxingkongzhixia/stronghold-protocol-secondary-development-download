// server/sim/content/kits/ops/ver-glassb.js — 真理 (char_195_glassb), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 shortens the attack interval by |base_attack_time| s; S2 ATK +atk, attacking
// three targets (attack@max_target).
import { batMod, num } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S2 = 'skchr_glassb_2';

function glassb(_bb, chess, def) {
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      mods: { atkPct: num(sbb.atk) },
      attack: { maxTargets: Math.max(1, Math.floor(num(sbb['attack@max_target'], 3))) },
      // 文学风暴 "攻击范围扩大": the skill's own range (the data grid), not her normal one
      ...(Array.isArray(rec?.rangeGrid) && rec.rangeGrid.length ? { targeting: { rangeGrid: rec.rangeGrid.map((p) => [p[0], p[1]]) } } : {}),
    };
    return { kind: 'duration', duration: rec?.duration, mods: { batPct: batMod(num(sbb.base_attack_time), chess) } };
  });
  return { skills, skill };
}

export default { char_195_glassb: glassb };
