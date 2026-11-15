// server/sim/content/kits/ops/ver-amiya.js — 阿米娅 (char_002_amiya), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 attack speed +45; S2 seven 39 % shots over 25 s, then she is stunned 10 s; S3
// ATK +130 %, +50 % max HP, true damage, and she leaves the field when it ends. Talent: +3 SP a hit, +10 SP a kill.
import { num, up } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S2 = 'skchr_amiya_2';
const S3 = 'skchr_amiya_3';

function amiya(_bb, chess, def) {
  const t0 = chess?.talents?.[0]?.bb ?? {};
  const spHit = num(t0['amiya_t_1[atk].sp'], 3), spKill = num(t0['amiya_t_1[kill].sp'], 10);
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      attack: { atkScale: num(sbb['attack@atk_scale'], 0.39), hits: Math.max(1, Math.floor(num(sbb['attack@times'], 7))) },
      onEnd({ battle, unit }) {
        const stun = num(sbb.stun, 10);
        if (stun > 0 && up(unit)) battle.applyStatus(unit, 'stun', { duration: stun, source: unit });
      },
    };
    if (id === S3) return {
      kind: 'duration', duration: rec?.duration,
      mods: { atkPct: num(sbb.atk), hpPct: num(sbb.max_hp) },
      attack: { dmgType: 'true' },
      onEnd({ battle, unit }) { if (up(unit)) battle.retreat(unit, { reason: 'expired', permanent: true }); },
    };
    return { kind: 'duration', duration: rec?.duration, mods: { aspd: num(sbb.attack_speed) } };
  });
  return {
    skills, skill,
    install(battle, unit) {
      battle.on('attack', (ctx) => {
        if (ctx.attacker !== unit || !up(unit) || !(spHit > 0)) return;
        unit.skill?.gainSp(spHit, 'talent');
      }, { owner: unit });
      battle.on('kill', (ctx) => {
        if (ctx.killer !== unit || !up(unit) || !(spKill > 0)) return;
        unit.skill?.gainSp(spKill, 'talent');
      }, { owner: unit });
    },
  };
}

export default { char_002_amiya: amiya };
