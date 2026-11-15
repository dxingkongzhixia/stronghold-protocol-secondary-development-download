// server/sim/content/kits/ops/ver-ju.js — 䌷 (char_4221_ju), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 下次攻击 at 2.1× (the "never a target above half HP" rule is a targeting
// restriction the spec cannot express today [ASSUMED]). S2 ATK +62 %, two targets, and every enemy under half HP in the
// attack takes one extra 100 % physical hit per cast.
import { num } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skchr_ju_1';
const S2 = 'skchr_ju_2';

function ju(_bb, chess, def) {
  const b2 = chess?.skills?.find((s) => s.skillId === S2)?.bb ?? {};
  const extraScale = num(b2.atk_scale_s2_extra, 1), hpRatio = num(b2.hp_ratio, 0.5);
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S1) return { kind: 'instant', attack: { atkScale: num(sbb.atk_scale_s1, 2.1) } };
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      mods: { atkPct: num(sbb.atk) },
      attack: { maxTargets: Math.max(1, Math.floor(num(sbb['attack@max_target_s2'], 2))) },
      onStart({ unit }) { unit.mem.juExtra = new Set(); },
      onAttack({ battle, unit, targets }) {
        const seen = (unit.mem.juExtra ??= new Set());
        for (const t of targets || []) {
          if (!t?.alive || t.side !== 'enemy' || seen.has(t.id) || !(t.hpRatio <= hpRatio)) continue;
          seen.add(t.id);
          battle.dealDamage(unit, t, { amount: unit.s.atk * extraScale, type: 'phys', isSkill: true, tags: ['skill'] });
        }
      },
    };
    return { kind: 'instant' };
  });
  return { skills, skill };
}

export default { char_4221_ju: ju };
