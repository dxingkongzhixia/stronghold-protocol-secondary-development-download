// server/sim/content/kits/ops/ver-quercu.js — 夏栎 (char_492_quercu), a version kit keyed by charId
// (kits/index.js VERSION_KIT_FILES). S1 is a manual toggle (ATK +20 %, active until closed); S2 attack speed +36 and
// every heal she makes restores sp to its target.
import { num } from '../shared/tier1.js';
import { kitSkills } from '../shared/version.js';

const S2 = 'skchr_quercu_2';

function quercu(_bb, chess, def) {
  const { skills, skill } = kitSkills(chess, def, (id, rec, sbb) => {
    if (id === S2) return {
      kind: 'duration', duration: rec?.duration, mods: { aspd: num(sbb.attack_speed) },
      onStart({ battle, unit, skill: sk }) {
        const sp = num(sbb.sp);
        if (!(sp > 0)) return;
        const hook = battle.on('heal', (ctx) => {
          if (ctx.source !== unit || !sk.active || !(ctx.amount > 0)) return;
          ctx.target?.skill?.gainSp(sp, 'skill');
        }, { owner: unit });
        unit.mem.quercuHook = hook;
      },
      onEnd({ battle, unit }) {
        if (unit.mem.quercuHook) { battle.off(unit.mem.quercuHook); unit.mem.quercuHook = null; }
      },
    };
    return { kind: 'toggle', mods: { atkPct: num(sbb.atk) } };
  });
  return { skills, skill };
}

export default { char_492_quercu: quercu };
