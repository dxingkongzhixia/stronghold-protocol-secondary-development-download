// server/sim/content/kits/ops/ver-frncat.js — 慕斯 (char_185_frncat), a version kit keyed by charId (kits/index.js
// VERSION_KIT_FILES). S1 下次攻击 ATK ×(1+atk) and the target's ATK −|debuff.atk| for debuff.duration; S2 ATK / DEF +atk.
import { num } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skchr_frncat_1';
const S2 = 'skchr_frncat_2';

function frncat(_bb, chess, def) {
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S1) return {
      kind: 'instant', attack: { atkScale: 1 + num(sbb.atk) },
      onAttack({ battle, unit, targets }) {
        const dur = num(sbb['frncat_s_1[debuff].duration'], 5);
        const atk = num(sbb['frncat_s_1[debuff].atk']);
        if (!(dur > 0) || !(atk < 0)) return;
        for (const t of targets || []) {
          if (!t?.alive || t.side !== 'enemy') continue;
          battle.addBuff(t, { key: `frncat:weaken:${unit.id}`, duration: dur, refresh: 'replace', source: unit, visible: true, mods: { atkPct: atk } });
        }
      },
    };
    if (id === S2) return { kind: 'duration', duration: rec?.duration, mods: { atkPct: num(sbb.atk), defPct: num(sbb.def) } };
    return { kind: 'instant' };
  });
  return { skills, skill };
}

export default { char_185_frncat: frncat };
