// server/sim/content/kits/ops/ver-bluep.js — 蓝毒 (char_129_bluep), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 下次攻击 at 1.4× on two targets; S2 ATK +20 % and every attack hits one extra
// target. Talent: each hit poisons for 40 arts a second over 3.1 s.
import { num, onHitBy } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skchr_bluep_1';
const S2 = 'skchr_bluep_2';

function bluep(_bb, chess, def) {
  const t0 = chess?.talents?.[0]?.bb ?? {};
  const poison = num(t0.poison_damage), poisonDur = num(t0.duration, 3.1);
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S1) return { kind: 'instant', attack: { atkScale: num(sbb.atk_scale, 1.4), maxTargets: 2 } };
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      mods: { atkPct: num(sbb.atk) },
      attack: { maxTargets: 1 + Math.max(0, Math.floor(num(sbb['attack@times'], 1))) },
    };
    return { kind: 'instant' };
  });
  return {
    skills, skill,
    install(battle, unit) {
      if (!(poison > 0) || !(poisonDur > 0)) return;
      onHitBy(battle, unit, ({ target, dmg }) => {
        if (!dmg?.isAttack || !target?.alive) return;
        battle.addBuff(target, {
          key: `bluep:poison:${unit.id}`, duration: poisonDur, interval: 1, refresh: 'replace', source: unit, visible: true,
          onTick({ battle: b, unit: tgt }) { b.dealDamage(unit, tgt, { amount: poison, type: 'arts', isSkill: true, tags: ['poison'] }); },
        });
      });
    },
  };
}

export default { char_129_bluep: bluep };
