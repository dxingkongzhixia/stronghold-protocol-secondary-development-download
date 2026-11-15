// server/sim/content/kits/ops/ver-cammou.js — 卡达 (char_328_cammou), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 ATK +atk and each attack may stun its target for attack@stun (probe
// attack@prob). The 浮游单元 range/return behaviour is not modelled: the kit keeps the stat line and the stun roll
// [ASSUMED].
import { num } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S2 = 'skchr_cammou_2';

function cammou(_bb, chess, def) {
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration, mods: { atkPct: num(sbb.atk) },
      onAttack({ battle, unit, targets }) {
        const prob = num(sbb['attack@prob']), stun = num(sbb['attack@stun']);
        if (!(prob > 0) || !(stun > 0)) return;
        for (const t of targets || []) {
          if (!t?.alive || t.side !== 'enemy') continue;
          if (battle.rng.chance(prob)) battle.applyStatus(t, 'stun', { duration: stun, source: unit });
        }
      },
    };
    return { kind: 'duration', duration: rec?.duration, mods: { atkPct: num(sbb.atk) } };
  });
  return { skills, skill };
}

export default { char_328_cammou: cammou };
