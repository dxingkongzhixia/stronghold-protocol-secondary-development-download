// server/sim/content/kits/ops/ver-liesel.js — 复奏 (char_4031_liesel), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 下次攻击 at 1.5× with a wider splash; S2 an instant blast at 1.3× on up to
// three targets, and every enemy it hits burns for 15 % of her ATK a second over 6 s. The splash radius is not in the
// blackboard: 1.5 tiles [ASSUMED].
import { num } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skchr_liesel_1';
const S2 = 'skchr_liesel_2';
const SPLASH = 1.5;

function liesel(_bb, chess, def) {
  const b2 = chess?.skills?.find((s) => s.skillId === S2)?.bb ?? {};
  const dotScale = num(b2['liesel_s_2[dot].atk_scale'], 0.15), dotDur = num(b2['liesel_s_2[dot].duration'], 6);
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S1) return { kind: 'instant', attack: { atkScale: num(sbb.atk_scale, 1.5), splashRadius: SPLASH } };
    if (id === S2) return {
      kind: 'instant',
      attack: { atkScale: num(sbb.atk_scale, 1.3), maxTargets: Math.max(1, Math.floor(num(sbb.max_target_cnt, 3))), splashRadius: SPLASH },
      onAttack({ battle, unit, targets }) {
        if (!(dotScale > 0) || !(dotDur > 0)) return;
        for (const t of targets || []) {
          if (!t?.alive || t.side !== 'enemy') continue;
          battle.addBuff(t, {
            key: `liesel:dot:${unit.id}`, duration: dotDur, interval: 1, refresh: 'replace', source: unit, visible: true,
            onTick({ battle: b, unit: tgt }) { b.dealDamage(unit, tgt, { amount: unit.s.atk * dotScale, type: 'arts', isSkill: true, tags: ['skill', 'dot'] }); },
          });
        }
      },
    };
    return { kind: 'instant' };
  });
  return { skills, skill };
}

export default { char_4031_liesel: liesel };
