// server/sim/content/kits/ops/ver-meteo.js — 陨星 (char_219_meteo), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 下次攻击 at 1.5×; S2 an instant blast at 2.1× that lowers the DEF of every
// enemy it hits by |def| for `duration` s. The S1 explosion-radius increase is not modelled [ASSUMED].
import { num } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S2 = 'skchr_meteo_2';

function meteo(_bb, chess, def) {
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'instant',
      attack: { atkScale: num(sbb.atk_scale, 2.1) },
      onAttack({ battle, unit, targets }) {
        const dur = num(sbb.duration, 10), def = num(sbb.def);
        if (!(dur > 0) || !(def < 0)) return;
        for (const t of targets || []) {
          if (!t?.alive || t.side !== 'enemy') continue;
          battle.addBuff(t, { key: `meteo:shred:${unit.id}`, duration: dur, refresh: 'replace', source: unit, visible: true, mods: { defFlat: def } });
        }
      },
    };
    return { kind: 'instant', attack: { atkScale: num(sbb.atk_scale, 1.5) } };
  });
  return { skills, skill };
}

export default { char_219_meteo: meteo };
