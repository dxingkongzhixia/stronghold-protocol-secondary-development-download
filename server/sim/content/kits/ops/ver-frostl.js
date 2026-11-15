// server/sim/content/kits/ops/ver-frostl.js — 霜叶 (char_193_frostl), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 下次攻击 at 1.2× and slows the target by move_speed for `duration` s; S2 attack
// speed +20 and every attack slows by move_speed (2 s [ASSUMED]: the blackboard carries no slow duration) with a
// `prob` chance to bind for `debuff` s.
import { num } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skchr_frostl_1';
const S2 = 'skchr_frostl_2';
const SLOW_SECONDS = 2;

function frostl(_bb, chess, def) {
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S1) return {
      kind: 'instant', attack: { atkScale: num(sbb.atk_scale, 1.2) },
      onAttack({ battle, unit, targets }) {
        const mv = num(sbb.move_speed), dur = num(sbb.duration, SLOW_SECONDS);
        if (!(mv < 0) || !(dur > 0)) return;
        for (const t of targets || []) {
          if (!t?.alive || t.side !== 'enemy') continue;
          battle.addBuff(t, { key: `frostl:slow:${unit.id}`, duration: dur, refresh: 'replace', source: unit, visible: true, mods: { moveMul: Math.max(0.05, 1 + mv) } });
        }
      },
    };
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration, mods: { aspd: num(sbb.attack_speed) },
      onAttack({ battle, unit, targets }) {
        const mv = num(sbb.move_speed), prob = num(sbb.prob), bind = num(sbb.debuff);
        for (const t of targets || []) {
          if (!t?.alive || t.side !== 'enemy') continue;
          if (mv < 0) battle.addBuff(t, { key: `frostl:slow:${unit.id}`, duration: SLOW_SECONDS, refresh: 'replace', source: unit, visible: true, mods: { moveMul: Math.max(0.05, 1 + mv) } });
          if (prob > 0 && bind > 0 && battle.rng.chance(prob)) battle.applyStatus(t, 'bind', { duration: bind, source: unit });
        }
      },
    };
    return { kind: 'instant' };
  });
  return { skills, skill };
}

export default { char_193_frostl: frostl };
