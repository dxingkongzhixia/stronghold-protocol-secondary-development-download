// server/sim/content/kits/ops/ver-acrbot.js — “暴躁铁皮” (char_618_acrbot), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 a shorter attack interval, ATK +160 %, +60 % max HP for 20 s. The status
// immunity and the "attacks allies too" rule are not modelled [ASSUMED]. Talent: when it goes down it deals 150 % of its
// ATK as arts around itself and stuns the enemies it hits for 5 s.
import { batMod, cheb, num } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

function acrbot(_bb, chess, def) {
  const t0 = chess?.talents?.[0]?.bb ?? {};
  const blast = num(t0.atk_scale, 1.5), stun = num(t0.stun, 5);
  const { skills, skill } = kitSkills(chess, def, (_id, rec, sbb) => ({
    kind: 'duration', duration: rec?.duration,
    mods: { atkPct: num(sbb.atk), hpPct: num(sbb.max_hp), batPct: batMod(num(sbb.base_attack_time), chess) },
  }));
  return {
    skills, skill,
    install(battle, unit) {
      battle.on('death', (ctx) => {
        if (ctx.unit !== unit || ctx.reason === 'expired') return;
        for (const e of battle.enemies) {
          if (!e.alive || e.side !== 'enemy' || cheb(unit, e) > 1) continue;
          battle.dealDamage(unit, e, { amount: unit.s.atk * blast, type: 'arts', isSkill: true, tags: ['talent'] });
          if (stun > 0) battle.applyStatus(e, 'stun', { duration: stun, source: unit });
        }
        battle.fx('aoe', { x: unit.x, y: unit.y, radius: 1.5, id: unit.id, skill: 'acrbot' });
      }, { owner: unit });
    },
  };
}

export default { char_618_acrbot: acrbot };
