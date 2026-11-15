// server/sim/content/kits/ops/ver-jaksel.js — 杰克 (char_347_jaksel), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 下次攻击 at 1.8×. S2 stops attacking for its duration, adds 50 % physical
// evade, and counters a dodged physical/arts hit at 1.35× — at most once per base_attack_time × the attack interval
// [ASSUMED: the blackboard 0.8 is read as that fraction]. Talent: 18 % evade, and attack speed +6 for 5 s on each evade.
import { num, onHitOn, talentBb, up } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skchr_jaksel_1';
const S2 = 'skchr_jaksel_2';

function jaksel(_bb, chess, def) {
  const t0 = talentBb(chess, 0);
  const baseProb = num(t0.prob);
  const asPerEvade = num(t0['charge_atk_speed_on_evade.attack_speed']);
  const asSeconds = num(t0['charge_atk_speed_on_evade.duration'], 5);
  const b2 = chess?.skills?.find((s) => s.skillId === S2)?.bb ?? {};
  const extraProb = num(b2['jaksel_skill_2[evade].prob']);
  const counterScale = num(b2['attack@atk_scale'], 1.35);
  const gapFactor = num(b2.base_attack_time, 0.8);
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S1) return { kind: 'instant', attack: { atkScale: num(sbb.atk_scale, 1.8) } };
    if (id === S2) return { kind: 'duration', duration: rec?.duration, attack: { noAttack: true } };
    return { kind: 'instant' };
  });
  return {
    skills, skill,
    install(battle, unit) {
      onHitOn(battle, unit, (ctx) => {
        const dmg = ctx.dmg;
        if (!dmg || dmg.cancel || !up(unit)) return;
        if (dmg.type !== 'phys' && dmg.type !== 'arts') return;
        const s2 = !!unit.skill?.active && unit.skill.id === S2;
        const prob = Math.min(1, baseProb + (s2 ? extraProb : 0));
        if (!(prob > 0) || !battle.rng.chance(prob)) return;
        dmg.cancel = true;
        battle.fx('dodge', { x: unit.x, y: unit.y, id: unit.id });
        if (asPerEvade > 0) battle.addBuff(unit, { key: 'jaksel:evade', duration: asSeconds, refresh: 'extend', visible: true, mods: { aspd: asPerEvade } });
        if (!s2) return;
        const gap = Math.max(0, (Number(unit.s?.bat) || 1) * gapFactor);
        const last = unit.mem.jakselCounterAt ?? -Infinity;
        if (battle.time - last + 1e-9 < gap) return;
        const src = ctx.source;
        if (!src?.alive) return;
        unit.mem.jakselCounterAt = battle.time;
        battle.dealDamage(unit, src, { amount: unit.s.atk * counterScale, type: 'phys', isSkill: true, canDodge: false, tags: ['counter'] });
        battle.fx('counter', { x: src.x, y: src.y, id: unit.id, target: src.id });
      }, 5);
    },
  };
}

export default { char_347_jaksel: jaksel };
