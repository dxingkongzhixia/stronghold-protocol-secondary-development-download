// server/sim/content/kits/ops/ver-chnut.js — 褐果 (char_4041_chnut), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 an instant heal whose element recovery is doubled. S2 attack speed +90 and heals
// 120 % (the "same target twice in a row" condition is not modelled [ASSUMED]). Talent: element recovery +13 %.
import { num } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S2 = 'skchr_chnut_2';

function chnut(_bb, chess, def) {
  const t0 = chess?.talents?.[0]?.bb ?? {};
  const epScale = num(t0.ep_heal_scale, 1.13);
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration, heal: true,
      mods: { aspd: num(sbb.attack_speed) },
      attack: { healScale: num(sbb['attack@heal_continuously_scale'], 1.2) },
    };
    return {
      kind: 'instant', heal: true,
      onStart({ unit }) { unit.mem.chnutBoost = true; },
    };
  });
  return {
    skills, skill,
    install(battle, unit) {
      // talent: element recovery of every heal she makes
      const h = unit.profile?.heal;
      if (h && epScale !== 1) unit.profile.heal = { ...h, elementHealRatio: num(h.elementHealRatio) * epScale };
      // S1: the next heal this cast makes recovers the same element amount once more (×2)
      battle.on('heal', (ctx) => {
        if (ctx.source !== unit || !unit.mem.chnutBoost || !(ctx.amount > 0)) return;
        unit.mem.chnutBoost = false;
        const ratio = num(unit.profile?.heal?.elementHealRatio);
        if (ratio > 0 && ctx.target?.alive) battle.reduceElement(ctx.target, unit.s.atk * ratio);
      }, { owner: unit });
    },
  };
}

export default { char_4041_chnut: chnut };
