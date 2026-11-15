// server/sim/content/kits/ops/ver-highmo.js — 海沫 (char_4066_highmo), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 下次攻击 at 1.2×, two hits. S2 ATK +40 %, physical dodge +45 %, and an enemy
// killed in her range heals her 6 % of max HP while it runs.
import { bodyInRange } from '../../../body.js';
import { num, up } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skchr_highmo_1';
const S2 = 'skchr_highmo_2';

function highmo(_bb, chess, def) {
  const b2 = chess?.skills?.find((s) => s.skillId === S2)?.bb ?? {};
  const dodge = num(b2.prob), healRatio = num(b2.hp_ratio);
  const { skills, skill, sid } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S1) return { kind: 'instant', attack: { atkScale: num(sbb.atk_scale, 1.2), hits: 2 } };
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      mods: { atkPct: num(sbb.atk), ...(dodge > 0 ? { dodgePhys: dodge } : {}) },
    };
    return { kind: 'instant' };
  });
  return {
    skills, skill,
    install(battle, unit) {
      if (sid !== S2 || !(healRatio > 0)) return;
      battle.on('death', (ctx) => {
        const e = ctx.unit;
        if (e?.side !== 'enemy' || ctx.reason !== 'killed' || !up(unit)) return;
        if (!unit.skill?.active || unit.skill.id !== S2) return;
        if (bodyInRange(e, unit.rangeKeys)) battle.heal(unit, unit, unit.s.maxHp * healRatio, { self: true, tags: ['skill'] });
      }, { owner: unit });
    },
  };
}

export default { char_4066_highmo: highmo };
