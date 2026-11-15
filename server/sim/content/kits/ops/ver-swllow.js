// server/sim/content/kits/ops/ver-swllow.js — 灰喉 (char_367_swllow), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 下次攻击 fires 1 + cnt shots at atk_scale; S2 ATK +atk and every attack becomes
// three shots (the shop text: 攻击变为3连射).
import { num } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skchr_swllow_1';
const S2 = 'skchr_swllow_2';

function swllow(_bb, chess, def) {
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S1) return { kind: 'instant', attack: { atkScale: num(sbb.atk_scale, 1.1), hits: 1 + Math.max(0, Math.floor(num(sbb.cnt, 1))) } };
    if (id === S2) return { kind: 'duration', duration: rec?.duration, mods: { atkPct: num(sbb.atk) }, attack: { hits: 3 } };
    return { kind: 'instant' };
  });
  return { skills, skill };
}

export default { char_367_swllow: swllow };
