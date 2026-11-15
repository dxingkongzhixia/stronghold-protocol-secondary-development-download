// server/sim/content/kits/ops/ver-ctrail.js — 云迹 (char_4165_ctrail), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 takes off for 30 s: ATK +45 %, physical dodge +50 %, a wider range. S2 takes off
// with ATK +45 %, three targets; a flyer it hits is stopped (sluggish) 1 s. Talent: +7 % ATK while airborne, +7 % DEF
// while on the ground.
import { num, toggleBuff } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S1 = 'skchr_ctrail_1';
const S2 = 'skchr_ctrail_2';
const LIFTOFF_FLAGS = Object.freeze({ blockFly: true, liftoff: true });

function takeOff({ battle, unit }) {
  battle.releaseBlocked(unit);
  battle.fx('takeoff', { x: unit.x, y: unit.y, id: unit.id });
}
function land({ battle, unit }) {
  battle.releaseBlocked(unit);
}

function ctrail(_bb, chess, def) {
  const t0 = chess?.talents?.[0]?.bb ?? {};
  const airAtk = num(t0.atk_scale, 1.07), groundDef = num(t0.def, 0.07);
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration,
      mods: { atkPct: num(sbb.atk) }, flags: LIFTOFF_FLAGS,
      targeting: { rangeGrid: def?.skill?.rangeGrid ?? null, maxTargets: Math.max(1, Math.floor(num(sbb['attack@max_target'], 3))) },
      onStart: takeOff, onEnd: land,
      onAttack({ battle, unit, targets }) {
        const dur = num(sbb['attack@sluggish'], 1);
        if (!(dur > 0)) return;
        for (const t of targets || []) if (t?.alive && t.side === 'enemy' && t.isFlying) battle.applyStatus(t, 'sluggish', { duration: dur, source: unit });
      },
    };
    if (id === S1) return {
      kind: 'duration', duration: rec?.duration, activateOnDeploy: true,
      mods: { atkPct: num(sbb.atk), ...(num(sbb.prob) > 0 ? { dodgePhys: num(sbb.prob) } : {}) },
      flags: LIFTOFF_FLAGS,
      targeting: { rangeGrid: def?.skill?.rangeGrid ?? null },
      onStart: takeOff, onEnd: land,
    };
    return { kind: 'instant' };
  });
  return {
    skills, skill,
    install(battle, unit) {
      if (airAtk !== 1) toggleBuff(battle, unit, 'trait:ctrail_air', () => !!unit.s.flags.liftoff, { atkMul: airAtk });
      if (groundDef > 0) toggleBuff(battle, unit, 'trait:ctrail_ground', () => !unit.s.flags.liftoff, { defPct: groundDef });
    },
  };
}

export default { char_4165_ctrail: ctrail };
